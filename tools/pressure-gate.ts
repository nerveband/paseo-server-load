import { execFile } from "node:child_process";
import { homedir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";

// omp extension: queues agent fan-out and heavy jobs while this Mac is under memory pressure.
// Decisions come from ~/.local/bin/server-pressure (kept fresh by the launchd watchdog).
const GATE = `${homedir()}/.local/bin/server-pressure`;
const MAX_WAIT_S = Number(process.env.PRESSURE_GATE_MAX_WAIT_S ?? 600); // keep below extensionHandlers.toolCallTimeoutMs
const SPAWN_HANDLER_WAIT_S = 20; // before_subagent_spawn has a fixed 30 s budget
const SPAWN_TOOL = /(^|_)create_agent$/;
const HEAVY = /\b(rembg|ffmpeg|whisper(-cli)?|demucs|xcodebuild|swift build|cargo (build|test)|go (build|test)|docker (build|compose (up|build))|playwright test|vitest|jest|pytest|(npm|pnpm|yarn|bun)( run)? (build|test)|next build|astro build|vite build|hyperframes (render|preview)|remotion render|ollama run|mlx_lm)\b/;

type Kind = "spawn" | "heavy";
interface GateResult {
  ok: boolean;
  waited_s: number;
  level: string;
  reasons: string[];
  blocked_by: string | null;
}

function gate(kind: Kind, maxWait: number): Promise<GateResult | null> {
  const { promise, resolve } = Promise.withResolvers<GateResult | null>();
  execFile(
    GATE,
    ["gate", "--kind", kind, "--max-wait", String(maxWait), "--json"],
    { timeout: (maxWait + 30) * 1000 },
    (_err, stdout) => {
      try {
        resolve(JSON.parse(String(stdout)) as GateResult);
      } catch {
        resolve(null); // gate missing or broken: never block work on a monitoring failure
      }
    },
  );
  return promise;
}

async function check(kind: Kind, maxWait: number, ctx: ExtensionContext) {
  const first = await gate(kind, 0);
  if (!first) return undefined;
  let result = first;
  if (!first.ok && maxWait > 0) {
    if (ctx.hasUI) ctx.ui.notify(`server-pressure: waiting up to ${maxWait / 60} min (${first.blocked_by})`, "warning");
    result = (await gate(kind, maxWait)) ?? first;
  }
  if (!result.ok) {
    return {
      block: true,
      reason:
        `server-pressure: ${result.blocked_by}. Waited ${result.waited_s}s and it is still blocked. ` +
        "Do not retry right away. Finish or checkpoint the current step, then tell the user the server is overloaded " +
        "and which work is queued. `server-pressure status` shows the current level.",
    };
  }
  const notes: string[] = [];
  if (result.waited_s > 0) notes.push(`waited ${result.waited_s}s for ${kind} capacity`);
  if (result.level === "yellow" && kind === "spawn") notes.push("memory pressure is yellow: run at most 2 new agents at a time");
  return notes.length ? { additionalContext: `server-pressure: ${notes.join("; ")}.` } : undefined;
}

export default function pressureGate(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "task" || SPAWN_TOOL.test(event.toolName)) return check("spawn", MAX_WAIT_S, ctx);
    if (event.toolName === "bash") {
      const command = String(event.input.command ?? "");
      if (HEAVY.test(command)) return check("heavy", MAX_WAIT_S, ctx);
    }
    return undefined;
  });

  // eval agent() and workpool workers skip the task tool; the task tool itself is gated above.
  pi.on("before_subagent_spawn", async (event, ctx) => {
    if (event.invocationKind === "task") return undefined;
    const result = await check("spawn", SPAWN_HANDLER_WAIT_S, ctx);
    return result && "block" in result ? { block: true, reason: result.reason } : undefined;
  });
}
