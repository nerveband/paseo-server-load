import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  FEATURES,
  getArchivedAgents,
  getPressureStatus,
  restoreArchivedAgent,
  setPressureFeatures,
  type Feature,
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
const QUERY_KEY = ["server-pressure", "status"];
const ARCHIVED_KEY = ["server-pressure", "archived"];

export function MainSurface({ theme, layout }: PluginSurfaceProps) {
  const fetchStatus = useRpc(getPressureStatus);
  const setFeatures = useRpc(setPressureFeatures);
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchStatus({}),
    refetchInterval: 15_000,
  });
  const toggle = useMutation({
    mutationFn: setFeatures,
    onSuccess: next => queryClient.setQueryData(QUERY_KEY, next),
  });
  const fetchArchived = useRpc(getArchivedAgents);
  const restoreAgent = useRpc(restoreArchivedAgent);
  const archived = useQuery({
    queryKey: ARCHIVED_KEY,
    queryFn: () => fetchArchived({}),
    refetchInterval: 60_000,
  });
  const restore = useMutation({
    mutationFn: restoreAgent,
    onSuccess: next => queryClient.setQueryData(ARCHIVED_KEY, next),
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
      section: { gap: 8 },
      label: { color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600" as const, letterSpacing: 0.5 },
      row: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, gap: 12 },
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
            {data ? `${data.host}${data.via === "ssh" ? " (over SSH)" : ""}` : " "}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh Server Load"
          style={styles.ghost}
          onPress={() => status.refetch()}
        >
          <Text style={styles.ghostText}>Refresh</Text>
        </Pressable>
      </View>

      {status.isPending ? <ActivityIndicator color={theme.colors.accent} /> : null}
      {data?.error ? <Text style={styles.danger}>{data.error}</Text> : null}
      {toggle.error ? <Text style={styles.danger}>{String(toggle.error)}</Text> : null}
      {data?.configErrors.length ? (
        <Text style={styles.danger}>config.json: {data.configErrors.join("; ")}</Text>
      ) : null}

      {data && data.level ? (
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

      {data ? (
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
                  onPress={() => toggle.mutate({ features: [feature], on: !on })}
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
              onPress={() => toggle.mutate({ features: [...FEATURES], on: false })}
            >
              <Text style={styles.ghostText}>All off</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Turn every control on"
              disabled={busy}
              style={styles.ghost}
              onPress={() => toggle.mutate({ features: [...FEATURES], on: true })}
            >
              <Text style={styles.ghostText}>All on</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

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
                onPress={() => restore.mutate({ id: agent.id })}
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
    </ScrollView>
  );
}
