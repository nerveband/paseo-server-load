import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const featureSchema = z.enum(["gate", "pause", "reap", "archive"]);
export type Feature = z.infer<typeof featureSchema>;
export const FEATURES: readonly Feature[] = featureSchema.options;

/** SSH destination: a ~/.ssh/config alias or user@host. Kept strict so it can never smuggle options. */
export const SSH_HOST = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;
/** Path to server-pressure on the watched Mac; `~` expands there. */
export const COMMAND_PATH = /^~?[A-Za-z0-9._/-]+$/;
export const DEFAULT_COMMAND = "~/.local/bin/server-pressure";
export const REPO_URL = "https://github.com/nerveband/paseo-server-load.git";

export const machineSchema = z.object({
  id: z.string().min(1),
  /** Shown in the machine picker; defaults to the hostname or SSH host. */
  label: z.string().trim().default(""),
  /** `local`: the Mac this Paseo daemon runs on. `ssh`: another Mac reached through SSH. */
  mode: z.enum(["local", "ssh"]).default("local"),
  sshHost: z.string().trim().default(""),
  command: z.string().trim().default(DEFAULT_COMMAND),
});
export type Machine = z.infer<typeof machineSchema>;

export const LOCAL_MACHINE: Machine = { id: "local", label: "", mode: "local", sshHost: "", command: DEFAULT_COMMAND };

export const machinesSettings = defineSettings({
  id: "connection",
  scope: "host",
  version: 2,
  schema: z.object({
    machines: z.array(machineSchema).min(1).default([LOCAL_MACHINE]),
  }),
  // Version 1 stored a single machine at the top level.
  migrate: (values, fromVersion) => {
    if (fromVersion >= 2 || !values || typeof values !== "object") return values;
    const v1 = values as Partial<Machine>;
    return { machines: [{ ...LOCAL_MACHINE, ...v1, id: v1.mode === "ssh" && v1.sshHost ? `ssh-${v1.sshHost}` : "local" }] };
  },
});
export type MachinesSettings = z.infer<typeof machinesSettings.schema>;

/** What the plugin found when it ran server-pressure on a machine. */
export const reachSchema = z.enum(["ok", "not-installed", "unreachable", "misconfigured", "failed"]);

const machineInput = z.object({ machineId: z.string().min(1) });

export const pressureStatusSchema = z.object({
  machineId: z.string(),
  host: z.string(),
  via: z.enum(["local", "ssh"]),
  reach: reachSchema,
  level: z.enum(["green", "yellow", "red"]).nullable(),
  reasons: z.array(z.string()),
  memAvailablePct: z.number().nullable(),
  swapinMbs: z.number().nullable(),
  load1: z.number().nullable(),
  ncpu: z.number().nullable(),
  agents: z.number().nullable(),
  heavyJobs: z.number().nullable(),
  paused: z.array(z.object({ pid: z.number(), cmd: z.string(), since: z.number() })),
  switches: z.record(featureSchema, z.boolean()),
  /** Problems in the watched Mac's ~/.config/server-pressure/config.json. */
  configErrors: z.array(z.string()),
  sampledAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type PressureStatus = z.infer<typeof pressureStatusSchema>;

export const getPressureStatus = defineRpc({
  name: "server-pressure.status",
  input: machineInput,
  output: pressureStatusSchema,
});

export const setPressureFeatures = defineRpc({
  name: "server-pressure.set",
  input: machineInput.extend({ features: z.array(featureSchema).min(1), on: z.boolean() }),
  output: pressureStatusSchema,
});

export const archivedAgentSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  name: z.string(),
  cwd: z.string(),
  archivedAt: z.string(),
  reason: z.string(),
  stillArchived: z.boolean(),
});
export type ArchivedAgent = z.infer<typeof archivedAgentSchema>;

export const archivedListSchema = z.object({
  agents: z.array(archivedAgentSchema),
  error: z.string().nullable(),
});

export const getArchivedAgents = defineRpc({
  name: "server-pressure.archived",
  input: machineInput,
  output: archivedListSchema,
});

export const restoreArchivedAgent = defineRpc({
  name: "server-pressure.restore",
  input: machineInput.extend({ id: z.string().regex(/^[0-9a-f-]{7,36}$/) }),
  output: archivedListSchema,
});
