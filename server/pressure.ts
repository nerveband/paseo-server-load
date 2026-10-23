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
  type Machine,
  type PressureStatus,
  type getArchivedAgents,
  type getPressureStatus,
  type machinesSettings,
  type restoreArchivedAgent,
  type setPressureFeatures,
} from "../shared/pressure";

const run = promisify(execFile);
type Reach = PressureStatus["reach"];

/** A failed run, sorted into something the UI can explain. */
class RunError extends Error {
  constructor(
    readonly reach: Reach,
    message: string,
  ) {
    super(message);
  }
}

interface Target {
  machine: Machine;
  label: string;
  exec(args: string[]): Promise<string>;
}

function lastLine(text: unknown): string {
  return String(text ?? "").trim().split("\n").pop() ?? "";
}

function resolveTarget(machine: Machine): Target {
  if (!COMMAND_PATH.test(machine.command)) {
    throw new RunError("misconfigured", `Command path "${machine.command}" has unsupported characters.`);
  }
  if (machine.mode === "local") {
    const command = machine.command.replace(/^~(?=\/|$)/, homedir());
    return {
      machine,
      label: machine.label || hostname().split(".")[0],
      async exec(args) {
        try {
          return (await run(command, args, { timeout: 20_000 })).stdout;
        } catch (error) {
          const e = error as NodeJS.ErrnoException & { stderr?: string };
          if (e.code === "ENOENT" || e.code === "EACCES") throw new RunError("not-installed", `${command} was not found.`);
          throw new RunError("failed", lastLine(e.stderr) || e.message);
        }
      },
    };
  }
  if (!SSH_HOST.test(machine.sshHost)) {
    throw new RunError("misconfigured", "Set an SSH host for this machine in Settings → Plugins → Server Load.");
  }
  // The remote shell expands a leading ~; every other argument is a fixed keyword or a validated id.
  const remote = machine.command.startsWith("~/") ? machine.command.slice(2) : machine.command;
  return {
    machine,
    label: machine.label || machine.sshHost,
    async exec(args) {
      try {
        const sshArgs = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", machine.sshHost, remote, ...args];
        return (await run("ssh", sshArgs, { timeout: 25_000 })).stdout;
      } catch (error) {
        const e = error as { code?: number | string; stderr?: string; message: string };
        if (e.code === 255) throw new RunError("unreachable", lastLine(e.stderr) || "ssh could not connect.");
        if (e.code === 127 || /not found|No such file/.test(String(e.stderr))) {
          throw new RunError("not-installed", `${machine.command} was not found on ${machine.sshHost}.`);
        }
        throw new RunError("failed", lastLine(e.stderr) || e.message);
      }
    },
  };
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));
const reachOf = (error: unknown): Reach => (error instanceof RunError ? error.reach : "failed");

function emptyStatus(machineId: string, host: string, via: Machine["mode"], reach: Reach, error: string): PressureStatus {
  return {
    machineId,
    host,
    via,
    reach,
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

export function createHandlers(settings: PluginSettings<typeof machinesSettings.schema>) {
  async function target(machineId: string): Promise<Target> {
    const state = await settings.read();
    if (state.status !== "ready") throw new RunError("misconfigured", `Server Load settings are invalid: ${state.error}`);
    const machine = state.values.machines.find(m => m.id === machineId);
    if (!machine) throw new RunError("misconfigured", "That machine is no longer in Settings → Plugins → Server Load.");
    return resolveTarget(machine);
  }

  async function status({ machineId }: RpcInput<typeof getPressureStatus>): Promise<PressureStatus> {
    let t: Target;
    try {
      t = await target(machineId);
    } catch (error) {
      return emptyStatus(machineId, machineId, "local", reachOf(error), describe(error));
    }
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(await t.exec(["status", "--json"]));
    } catch (error) {
      return emptyStatus(machineId, t.label, t.machine.mode, reachOf(error), describe(error));
    }
    const num = (key: string) => (typeof raw[key] === "number" ? (raw[key] as number) : null);
    const level = raw.level === "green" || raw.level === "yellow" || raw.level === "red" ? raw.level : null;
    const switches = (raw.switches ?? {}) as Record<string, unknown>;
    return {
      machineId,
      host: t.label,
      via: t.machine.mode,
      reach: "ok",
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

  async function set({ machineId, features, on }: RpcInput<typeof setPressureFeatures>): Promise<PressureStatus> {
    try {
      await (await target(machineId)).exec([on ? "on" : "off", ...features]);
    } catch (error) {
      const current = await status({ machineId });
      return { ...current, error: `Could not switch ${features.join(", ")} ${on ? "on" : "off"}: ${describe(error)}` };
    }
    return status({ machineId });
  }

  async function archived({ machineId }: RpcInput<typeof getArchivedAgents>): Promise<{ agents: ArchivedAgent[]; error: string | null }> {
    try {
      const rows = JSON.parse(await (await target(machineId)).exec(["archived", "--json", "--limit", "40"])) as Array<
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
      return { agents: [], error: `Could not read the archive log: ${describe(error)}` };
    }
  }

  async function restore({ machineId, id }: RpcInput<typeof restoreArchivedAgent>) {
    try {
      await (await target(machineId)).exec(["restore", id]);
    } catch (error) {
      return { ...(await archived({ machineId })), error: `Could not restore ${id}: ${describe(error)}` };
    }
    return archived({ machineId });
  }

  return { status, set, archived, restore };
}
