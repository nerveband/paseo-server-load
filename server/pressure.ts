import { execFile } from "node:child_process";
import { homedir, hostname } from "node:os";
import { promisify } from "node:util";
import type { RpcInput } from "@getpaseo/plugin";
import type { PluginSettings } from "@getpaseo/plugin/server";
import {
  COMMAND_PATH,
  FEATURES,
  SSH_HOST,
  type ArchivedAgent,
  type ConnectionSettings,
  type PressureStatus,
  type connectionSettings,
  type restoreArchivedAgent,
  type setPressureFeatures,
} from "../shared/pressure";

const run = promisify(execFile);

interface Target {
  mode: "local" | "ssh";
  label: string;
  exec(args: string[]): Promise<string>;
}

function resolveTarget(s: ConnectionSettings): Target {
  if (!COMMAND_PATH.test(s.command)) throw new Error(`Command path "${s.command}" has unsupported characters.`);
  if (s.mode === "local") {
    const command = s.command.replace(/^~(?=\/|$)/, homedir());
    return {
      mode: "local",
      label: s.label || hostname().split(".")[0],
      exec: async args => (await run(command, args, { timeout: 20_000 })).stdout,
    };
  }
  if (!SSH_HOST.test(s.sshHost)) throw new Error("Set an SSH host in Settings → Plugins → Server Load (an ~/.ssh/config alias or user@host).");
  // The remote shell expands a leading ~; every argument passed here is a fixed keyword or a validated id.
  const remote = s.command.startsWith("~/") ? s.command.slice(2) : s.command;
  return {
    mode: "ssh",
    label: s.label || s.sshHost,
    exec: async args =>
      (
        await run("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", s.sshHost, remote, ...args], {
          timeout: 25_000,
        })
      ).stdout,
  };
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function failure(target: Pick<Target, "mode" | "label">, error: string): PressureStatus {
  return {
    host: target.label,
    via: target.mode,
    level: null,
    reasons: [],
    memAvailablePct: null,
    swapinMbs: null,
    load1: null,
    ncpu: null,
    agents: null,
    heavyJobs: null,
    paused: [],
    switches: Object.fromEntries(FEATURES.map(f => [f, true])) as PressureStatus["switches"],
    configErrors: [],
    sampledAt: null,
    error,
  };
}

export function createHandlers(settings: PluginSettings<typeof connectionSettings.schema>) {
  async function target(): Promise<Target> {
    const state = await settings.read();
    if (state.status !== "ready") throw new Error(`Server Load settings are invalid: ${state.error}`);
    return resolveTarget(state.values);
  }

  async function status(): Promise<PressureStatus> {
    let t: Target;
    try {
      t = await target();
    } catch (error) {
      return failure({ mode: "local", label: hostname().split(".")[0] }, message(error));
    }
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(await t.exec(["status", "--json"]));
    } catch (error) {
      return failure(t, `Could not run server-pressure on ${t.label}: ${message(error)}`);
    }
    const num = (key: string) => (typeof raw[key] === "number" ? (raw[key] as number) : null);
    const level = raw.level === "green" || raw.level === "yellow" || raw.level === "red" ? raw.level : null;
    const switches = (raw.switches ?? {}) as Record<string, unknown>;
    return {
      host: t.label,
      via: t.mode,
      level,
      reasons: Array.isArray(raw.reasons) ? raw.reasons.map(String) : [],
      memAvailablePct: num("mem_available_pct"),
      swapinMbs: num("swapin_mbs"),
      load1: num("load1"),
      ncpu: num("ncpu"),
      agents: num("agents"),
      heavyJobs: num("heavy_jobs"),
      paused: Array.isArray(raw.paused)
        ? raw.paused.map(p => ({ pid: Number(p.pid), cmd: String(p.cmd ?? ""), since: Number(p.since) }))
        : [],
      switches: Object.fromEntries(FEATURES.map(f => [f, switches[f] !== false])) as PressureStatus["switches"],
      configErrors: Array.isArray(raw.config_errors) ? raw.config_errors.map(String) : [],
      sampledAt: typeof raw.ts === "number" ? new Date(raw.ts * 1000).toISOString() : null,
      error: null,
    };
  }

  async function set({ features, on }: RpcInput<typeof setPressureFeatures>): Promise<PressureStatus> {
    try {
      await (await target()).exec([on ? "on" : "off", ...features]);
    } catch (error) {
      const current = await status();
      return { ...current, error: `Could not switch ${features.join(", ")} ${on ? "on" : "off"}: ${message(error)}` };
    }
    return status();
  }

  async function archived(): Promise<{ agents: ArchivedAgent[]; error: string | null }> {
    try {
      const rows = JSON.parse(await (await target()).exec(["archived", "--json", "--limit", "40"])) as Array<
        Record<string, unknown>
      >;
      return {
        agents: rows.map(r => ({
          id: String(r.id),
          shortId: String(r.shortId ?? String(r.id).slice(0, 7)),
          name: String(r.name ?? ""),
          cwd: String(r.cwd ?? ""),
          archivedAt: new Date(Number(r.archivedAt) * 1000).toISOString(),
          reason: String(r.reason ?? ""),
          stillArchived: r.stillArchived === true,
        })),
        error: null,
      };
    } catch (error) {
      return { agents: [], error: `Could not read the archive log: ${message(error)}` };
    }
  }

  async function restore({ id }: RpcInput<typeof restoreArchivedAgent>) {
    try {
      await (await target()).exec(["restore", id]);
    } catch (error) {
      return { ...(await archived()), error: `Could not restore ${id}: ${message(error)}` };
    }
    return archived();
  }

  return { status, set, archived, restore };
}
