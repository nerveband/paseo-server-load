import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const featureSchema = z.enum(["gate", "pause", "reap", "archive"]);
export type Feature = z.infer<typeof featureSchema>;
export const FEATURES: readonly Feature[] = featureSchema.options;

/** SSH destination: a ~/.ssh/config alias or user@host. Kept strict so it can never smuggle options. */
export const SSH_HOST = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;
/** Path to server-pressure on the watched Mac; `~` expands there. */
export const COMMAND_PATH = /^~?[A-Za-z0-9._/-]+$/;

export const connectionSettings = defineSettings({
  id: "connection",
  scope: "host",
  version: 1,
  schema: z.object({
    /** `local`: watch the Mac this daemon runs on. `ssh`: watch another Mac through SSH. */
    mode: z.enum(["local", "ssh"]).default("local"),
    sshHost: z.string().trim().default(""),
    command: z.string().trim().default("~/.local/bin/server-pressure"),
    /** Shown as the machine name; defaults to the hostname or SSH host. */
    label: z.string().trim().default(""),
  }),
});
export type ConnectionSettings = z.infer<typeof connectionSettings.schema>;

export const pressureStatusSchema = z.object({
  /** Machine the numbers describe and how this daemon reached it. */
  host: z.string(),
  via: z.enum(["local", "ssh"]),
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
  input: z.object({}),
  output: pressureStatusSchema,
});

export const setPressureFeatures = defineRpc({
  name: "server-pressure.set",
  input: z.object({ features: z.array(featureSchema).min(1), on: z.boolean() }),
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
  input: z.object({}),
  output: archivedListSchema,
});

export const restoreArchivedAgent = defineRpc({
  name: "server-pressure.restore",
  input: z.object({ id: z.string().regex(/^[0-9a-f-]{7,36}$/) }),
  output: archivedListSchema,
});
