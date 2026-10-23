import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  FEATURES,
  REPO_URL,
  getArchivedAgents,
  getPressureStatus,
  machinesSettings,
  restoreArchivedAgent,
  setPressureFeatures,
  type Feature,
  type Machine,
  type PressureStatus,
} from "../shared/pressure";

const FEATURE_TEXT: Record<Feature, { title: string; detail: string }> = {
  gate: {
    title: "Wait gate",
    detail: "New agents and heavy jobs wait while memory pressure is high, then report back.",
  },
  pause: {
    title: "Pause heavy jobs",
    detail: "Under red, newer renders and ML jobs are paused so the oldest one finishes.",
  },
  reap: {
    title: "Clean up leftovers",
    detail: "Stops orphaned test browsers, test scripts, and dev servers left behind by agents.",
  },
  archive: {
    title: "Archive idle subagents",
    detail: "Archives subagents idle for 6 hours once their parent is idle too. Threads you started are never archived.",
  },
};

const LEVEL_TEXT = { green: "Normal", yellow: "Elevated", red: "Overloaded" } as const;

function machineName(machine: Machine, hostLabel: string): string {
  if (machine.label) return machine.label;
  return machine.mode === "ssh" ? machine.sshHost || "SSH machine" : `This Mac (${hostLabel})`;
}

export function MainSurface({ theme, layout, host }: PluginSurfaceProps) {
  const settings = useSettings(machinesSettings);
  const machines = settings.status === "ready" ? settings.values.machines : [];
  const [chosenId, setChosenId] = useState<string | null>(null);
  const machine = machines.find(m => m.id === chosenId) ?? machines[0];
  const machineId = machine?.id ?? "";

  const queryClient = useQueryClient();
  const statusKey = ["server-pressure", "status", machineId];
  const archivedKey = ["server-pressure", "archived", machineId];
  const fetchStatus = useRpc(getPressureStatus);
  const setFeatures = useRpc(setPressureFeatures);
  const fetchArchived = useRpc(getArchivedAgents);
  const restoreAgent = useRpc(restoreArchivedAgent);
  const status = useQuery({
    queryKey: statusKey,
    queryFn: () => fetchStatus({ machineId }),
    enabled: Boolean(machine),
    refetchInterval: 15_000,
  });
  const reachable = status.data?.reach === "ok";
  const archived = useQuery({
    queryKey: archivedKey,
    queryFn: () => fetchArchived({ machineId }),
    enabled: Boolean(machine) && reachable,
    refetchInterval: 60_000,
  });
  const toggle = useMutation({
    mutationFn: setFeatures,
    onSuccess: next => queryClient.setQueryData(statusKey, next),
  });
  const restore = useMutation({
    mutationFn: restoreAgent,
    onSuccess: next => queryClient.setQueryData(archivedKey, next),
  });

  const pad = layout.compact ? 16 : 24;
  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: pad, gap: layout.compact ? 16 : 20 },
      title: { color: theme.colors.foreground, fontSize: 20, fontWeight: "600" as const },
      text: { color: theme.colors.foreground, fontSize: 14 },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      danger: { color: theme.colors.statusDanger, fontSize: 14 },
      code: { color: theme.colors.foreground, fontSize: 13, fontFamily: "Menlo" },
      section: { gap: 8 },
      label: { color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600" as const, letterSpacing: 0.5 },
      row: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, gap: 12 },
      wrap: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
      card: { borderRadius: 10, padding: 12, gap: 4, borderWidth: 1, borderColor: theme.colors.foregroundMuted },
      button: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.colors.accent },
      buttonText: { color: theme.colors.accentForeground, fontSize: 13, fontWeight: "600" as const },
      ghost: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.foregroundMuted },
      ghostText: { color: theme.colors.foreground, fontSize: 13, fontWeight: "600" as const },
    }),
    [theme, layout.compact, pad],
  );

  const data: PressureStatus | undefined = status.data;
  const busy = toggle.isPending;
  const levelStyle = data?.level === "red" ? styles.danger : styles.text;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="server-pressure-surface">
      <View style={styles.row}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text style={styles.title}>Server Load</Text>
          <Text style={styles.muted}>
            {machine ? `${machineName(machine, host.label)}${machine.mode === "ssh" ? " (over SSH)" : ""}` : " "}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh Server Load"
          style={styles.ghost}
          onPress={() => {
            status.refetch();
            if (reachable) archived.refetch();
          }}
        >
          <Text style={styles.ghostText}>Refresh</Text>
        </Pressable>
      </View>

      {machines.length > 1 ? (
        <View style={styles.wrap} accessibilityRole="tablist">
          {machines.map(m => {
            const active = m.id === machineId;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Show ${machineName(m, host.label)}`}
                style={active ? styles.button : styles.ghost}
                onPress={() => setChosenId(m.id)}
              >
                <Text style={active ? styles.buttonText : styles.ghostText}>{machineName(m, host.label)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Text style={styles.muted}>Add or edit machines in Settings → Plugins → server-load → Server Load.</Text>

      {settings.status === "loading" || status.isPending ? <ActivityIndicator color={theme.colors.accent} /> : null}
      {settings.status === "error" || settings.status === "invalid" ? (
        <Text style={styles.danger}>Settings could not be read: {settings.error}</Text>
      ) : null}

      {data && data.reach === "not-installed" && machine ? <InstallHelp machine={machine} styles={styles} /> : null}
      {data && data.reach === "unreachable" && machine ? (
        <View style={styles.card}>
          <Text style={styles.text}>Can't reach {machine.sshHost} over SSH.</Text>
          <Text selectable style={styles.muted}>{data.error}</Text>
          <Text style={styles.muted}>
            The Paseo daemon connects without a prompt (SSH BatchMode), so this host needs a key that logs in on its own.
            Check it from a terminal on the daemon's Mac:
          </Text>
          <Text selectable style={styles.code}>ssh -o BatchMode=yes {machine.sshHost} true</Text>
        </View>
      ) : null}
      {data && (data.reach === "misconfigured" || data.reach === "failed") ? (
        <Text selectable style={styles.danger}>{data.error}</Text>
      ) : null}
      {reachable && data?.error ? <Text style={styles.danger}>{data.error}</Text> : null}
      {toggle.error ? <Text style={styles.danger}>{String(toggle.error)}</Text> : null}
      {data?.configErrors.length ? (
        <Text style={styles.danger}>config.json: {data.configErrors.join("; ")}</Text>
      ) : null}

      {reachable && data?.level ? (
        <View style={styles.card} accessible accessibilityLabel={`Level ${data.level}, ${LEVEL_TEXT[data.level]}`}>
          <Text style={[levelStyle, { fontSize: 18, fontWeight: "700" }]}>
            {data.level.toUpperCase()} · {LEVEL_TEXT[data.level]}
          </Text>
          {data.reasons.length ? <Text style={styles.muted}>{data.reasons.join("; ")}</Text> : null}
          <Text style={styles.text}>
            Memory available {data.memAvailablePct ?? "?"}% · Swap-in {data.swapinMbs ?? "?"} MB/s
          </Text>
          <Text style={styles.text}>
            Load {data.load1 ?? "?"} on {data.ncpu ?? "?"} cores · {data.agents ?? "?"} agents · {data.heavyJobs ?? "?"} heavy jobs
          </Text>
          {data.paused.length ? (
            <Text style={styles.text}>Paused: {data.paused.map(p => `${p.pid} ${p.cmd.slice(0, 60)}`).join(", ")}</Text>
          ) : null}
          {data.sampledAt ? (
            <Text style={styles.muted}>Sampled {new Date(data.sampledAt).toLocaleTimeString()}</Text>
          ) : null}
        </View>
      ) : null}

      {reachable && data ? (
        <View style={styles.section}>
          <Text style={styles.label}>CONTROLS</Text>
          {FEATURES.map(feature => {
            const on = data.switches[feature];
            const text = FEATURE_TEXT[feature];
            return (
              <View key={feature} style={[styles.card, styles.row]}>
                <View style={{ flexShrink: 1, gap: 2 }}>
                  <Text style={styles.text}>{text.title}</Text>
                  <Text style={styles.muted}>{text.detail}</Text>
                </View>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: on, disabled: busy }}
                  accessibilityLabel={text.title}
                  disabled={busy}
                  style={on ? styles.button : styles.ghost}
                  onPress={() => toggle.mutate({ machineId, features: [feature], on: !on })}
                >
                  <Text style={on ? styles.buttonText : styles.ghostText}>{on ? "On" : "Off"}</Text>
                </Pressable>
              </View>
            );
          })}
          <View style={[styles.row, { justifyContent: "flex-start" }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Turn every control off"
              disabled={busy}
              style={styles.ghost}
              onPress={() => toggle.mutate({ machineId, features: [...FEATURES], on: false })}
            >
              <Text style={styles.ghostText}>All off</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Turn every control on"
              disabled={busy}
              style={styles.ghost}
              onPress={() => toggle.mutate({ machineId, features: [...FEATURES], on: true })}
            >
              <Text style={styles.ghostText}>All on</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {reachable ? (
        <View style={styles.section}>
          <Text style={styles.label}>RECENTLY ARCHIVED</Text>
          {archived.data?.error ? <Text style={styles.danger}>{archived.data.error}</Text> : null}
          {restore.error ? <Text style={styles.danger}>{String(restore.error)}</Text> : null}
          {archived.data && archived.data.agents.length === 0 ? (
            <Text style={styles.muted}>Nothing archived yet.</Text>
          ) : null}
          {archived.data?.agents.map(agent => (
            <View key={agent.id} style={[styles.card, styles.row]}>
              <View style={{ flexShrink: 1, gap: 2 }}>
                <Text style={styles.text}>{agent.name || agent.shortId}</Text>
                <Text style={styles.muted}>
                  {agent.shortId} · {new Date(agent.archivedAt).toLocaleString()} · {agent.reason}
                  {agent.cwd ? ` · ${agent.cwd.replace(/^\/(Users|home)\/[^/]+/, "~")}` : ""}
                </Text>
              </View>
              {agent.stillArchived ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Restore ${agent.name || agent.shortId}`}
                  disabled={restore.isPending}
                  style={styles.ghost}
                  onPress={() => restore.mutate({ machineId, id: agent.id })}
                >
                  <Text style={styles.ghostText}>
                    {restore.isPending && restore.variables?.id === agent.id ? "Restoring…" : "Restore"}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.muted}>Restored</Text>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

type Styles = Record<"card" | "text" | "muted" | "code" | "label", object>;

/** Shown when the watched Mac does not have the server-pressure tools yet. */
function InstallHelp({ machine, styles }: { machine: Machine; styles: Styles }) {
  const install = `git clone ${REPO_URL} ~/src/paseo-server-load && ~/src/paseo-server-load/tools/install.sh`;
  return (
    <View style={styles.card}>
      <Text style={styles.text}>
        {machine.mode === "ssh" ? `${machine.label || machine.sshHost} needs` : "This Mac needs"} the server-pressure tools before this
        plugin can show or control anything.
      </Text>
      <Text style={styles.muted}>
        The plugin is only the dashboard. The watchdog, the wait gate, and the switches run on the watched Mac, installed
        from the same repository (macOS only, uses the system python3, no other dependencies).
      </Text>
      <Text style={styles.label}>
        {machine.mode === "ssh" ? `RUN ON ${(machine.label || machine.sshHost).toUpperCase()}` : "RUN IN A TERMINAL ON THIS MAC"}
      </Text>
      <Text selectable style={styles.code}>{install}</Text>
      {machine.mode === "ssh" ? (
        <>
          <Text style={styles.label}>OR FROM THIS MAC</Text>
          <Text selectable style={styles.code}>{`ssh ${machine.sshHost} '${install}'`}</Text>
        </>
      ) : null}
      <Text style={styles.muted}>
        It links ~/.local/bin/server-pressure, adds the Oh My Pi extension when omp is installed, and loads a launchd
        job that runs every minute. Press Refresh when it finishes. To undo it later: ~/src/paseo-server-load/tools/install.sh --remove
      </Text>
    </View>
  );
}
