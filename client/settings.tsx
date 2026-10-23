import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  COMMAND_PATH,
  DEFAULT_COMMAND,
  LOCAL_MACHINE,
  SSH_HOST,
  machinesSettings,
  type Machine,
} from "../shared/pressure";

function problem(machine: Machine): string | null {
  if (machine.mode === "ssh" && !SSH_HOST.test(machine.sshHost)) {
    return "SSH host: use an ~/.ssh/config alias or user@host (letters, digits, . _ @ -).";
  }
  if (!COMMAND_PATH.test(machine.command)) return "Command path: letters, digits, . _ / - and a leading ~ only.";
  return null;
}

export function ConnectionSettingsScreen({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(machinesSettings);
  const [draft, setDraft] = useState<Machine[] | null>(null);
  const saved = settings.status === "ready" ? settings.values.machines : null;
  const invalidStored = settings.status === "invalid";
  useEffect(() => {
    if (saved) setDraft(saved);
    else if (invalidStored) setDraft([LOCAL_MACHINE]);
  }, [saved, invalidStored]);

  const styles = useMemo(
    () => ({
      screen: { flexGrow: 1, padding: layout.compact ? 16 : 24, gap: 16, backgroundColor: theme.colors.surface0 },
      heading: { color: theme.colors.foreground, fontSize: 16, fontWeight: "600" as const },
      label: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" as const },
      help: { color: theme.colors.foregroundMuted, fontSize: 13 },
      danger: { color: theme.colors.statusDanger, fontSize: 13 },
      card: { borderRadius: 10, padding: 12, gap: 10, borderWidth: 1, borderColor: theme.colors.foregroundMuted },
      field: { gap: 6 },
      input: {
        color: theme.colors.foreground,
        borderWidth: 1,
        borderColor: theme.colors.foregroundMuted,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 14,
      },
      row: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8, alignItems: "center" as const },
      button: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.colors.accent },
      buttonText: { color: theme.colors.accentForeground, fontSize: 13, fontWeight: "600" as const },
      ghost: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.foregroundMuted },
      ghostText: { color: theme.colors.foreground, fontSize: 13, fontWeight: "600" as const },
    }),
    [theme, layout.compact],
  );

  if (settings.status === "loading" || !draft) return <View style={styles.screen} />;
  if (settings.status === "error") return <Text style={[styles.screen, styles.danger]}>{settings.error}</Text>;

  const update = (index: number, patch: Partial<Machine>) =>
    setDraft(draft.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  const problems = draft.map(problem);
  const blocked = problems.some(Boolean);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={styles.screen}
      testID="server-load-settings"
    >
      <View style={{ gap: 4 }}>
        <Text style={styles.heading}>Machines</Text>
        <Text style={styles.help}>
          Each machine needs the server-pressure tools installed (the Server Load screen shows the command if they are
          missing). The first machine opens by default; switch between them at the top of the Server Load screen.
        </Text>
      </View>

      {draft.map((machine, index) => (
        <View key={machine.id} style={styles.card}>
          <View style={styles.row}>
            {(["local", "ssh"] as const).map(mode => (
              <Pressable
                key={mode}
                accessibilityRole="radio"
                accessibilityState={{ checked: machine.mode === mode }}
                accessibilityLabel={`Machine ${index + 1}: ${mode === "local" ? "This Mac" : "Another Mac over SSH"}`}
                style={machine.mode === mode ? styles.button : styles.ghost}
                onPress={() => update(index, { mode })}
              >
                <Text style={machine.mode === mode ? styles.buttonText : styles.ghostText}>
                  {mode === "local" ? "This Mac" : "Another Mac over SSH"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.help}>
            {machine.mode === "local"
              ? "The Mac this Paseo daemon runs on."
              : "Reached with ssh from the Mac this Paseo daemon runs on. It must log in without a prompt (BatchMode)."}
          </Text>

          {machine.mode === "ssh" ? (
            <View style={styles.field}>
              <Text style={styles.label}>SSH host</Text>
              <TextInput
                accessibilityLabel={`Machine ${index + 1} SSH host`}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="server"
                placeholderTextColor={theme.colors.foregroundMuted}
                value={machine.sshHost}
                onChangeText={sshHost => update(index, { sshHost })}
              />
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              accessibilityLabel={`Machine ${index + 1} name`}
              style={styles.input}
              placeholder={machine.mode === "ssh" ? "SSH host" : "This Mac"}
              placeholderTextColor={theme.colors.foregroundMuted}
              value={machine.label}
              onChangeText={label => update(index, { label })}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>server-pressure command</Text>
            <TextInput
              accessibilityLabel={`Machine ${index + 1} server-pressure command path`}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              value={machine.command}
              onChangeText={command => update(index, { command })}
            />
            <Text style={styles.help}>Path on that Mac. tools/install.sh puts it at {DEFAULT_COMMAND}.</Text>
          </View>

          {problems[index] ? <Text style={styles.danger}>{problems[index]}</Text> : null}

          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move machine ${index + 1} up`}
              disabled={index === 0}
              style={[styles.ghost, index === 0 ? { opacity: 0.4 } : null]}
              onPress={() => {
                const next = [...draft];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                setDraft(next);
              }}
            >
              <Text style={styles.ghostText}>Move up</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove machine ${index + 1}`}
              disabled={draft.length === 1}
              style={[styles.ghost, draft.length === 1 ? { opacity: 0.4 } : null]}
              onPress={() => setDraft(draft.filter((_, i) => i !== index))}
            >
              <Text style={styles.ghostText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a machine reached over SSH"
          style={styles.ghost}
          onPress={() =>
            setDraft([...draft, { id: `m${Date.now().toString(36)}`, label: "", mode: "ssh", sshHost: "", command: DEFAULT_COMMAND }])
          }
        >
          <Text style={styles.ghostText}>Add machine</Text>
        </Pressable>
      </View>

      {settings.status === "invalid" ? <Text style={styles.danger}>{settings.error}</Text> : null}
      {settings.saveError ? <Text style={styles.danger}>{settings.saveError}</Text> : null}

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save Server Load settings"
          disabled={blocked || settings.saving}
          style={[styles.button, blocked ? { opacity: 0.4 } : null]}
          onPress={() => settings.save({ machines: draft }, settings.revision)}
        >
          <Text style={styles.buttonText}>{settings.saving ? "Saving…" : "Save"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reset Server Load settings"
          disabled={settings.saving}
          style={styles.ghost}
          onPress={() => settings.reset()}
        >
          <Text style={styles.ghostText}>Reset</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
