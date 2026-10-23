import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { COMMAND_PATH, SSH_HOST, connectionSettings, type ConnectionSettings } from "../shared/pressure";

export function ConnectionSettingsScreen({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(connectionSettings);
  const [draft, setDraft] = useState<ConnectionSettings | null>(null);
  const saved = settings.status === "ready" ? settings.values : null;
  const invalidStored = settings.status === "invalid";
  useEffect(() => {
    if (saved) setDraft(saved);
    else if (invalidStored) setDraft(connectionSettings.schema.parse({}));
  }, [saved, invalidStored]);

  const styles = useMemo(
    () => ({
      screen: { flex: 1, padding: layout.compact ? 16 : 24, gap: 16, backgroundColor: theme.colors.surface0 },
      label: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" as const },
      help: { color: theme.colors.foregroundMuted, fontSize: 13 },
      danger: { color: theme.colors.statusDanger, fontSize: 13 },
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
      row: { flexDirection: "row" as const, gap: 8 },
      button: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.colors.accent },
      buttonText: { color: theme.colors.accentForeground, fontSize: 13, fontWeight: "600" as const },
      ghost: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.foregroundMuted },
      ghostText: { color: theme.colors.foreground, fontSize: 13, fontWeight: "600" as const },
    }),
    [theme, layout.compact],
  );

  if (settings.status === "loading" || !draft) return <View style={styles.screen} />;
  if (settings.status === "error") return <Text style={[styles.screen, styles.danger]}>{settings.error}</Text>;

  const invalid =
    (draft.mode === "ssh" && !SSH_HOST.test(draft.sshHost)) || !COMMAND_PATH.test(draft.command);
  const set = (patch: Partial<ConnectionSettings>) => setDraft({ ...draft, ...patch });

  return (
    <View style={styles.screen} testID="server-load-settings">
      <View style={styles.field}>
        <Text style={styles.label}>Machine to watch</Text>
        <View style={styles.row}>
          {(["local", "ssh"] as const).map(mode => (
            <Pressable
              key={mode}
              accessibilityRole="radio"
              accessibilityState={{ checked: draft.mode === mode }}
              accessibilityLabel={mode === "local" ? "This Mac" : "Another Mac over SSH"}
              style={draft.mode === mode ? styles.button : styles.ghost}
              onPress={() => set({ mode })}
            >
              <Text style={draft.mode === mode ? styles.buttonText : styles.ghostText}>
                {mode === "local" ? "This Mac" : "Another Mac over SSH"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.help}>
          "This Mac" is the machine this Paseo daemon runs on. Use SSH to control a server from a laptop.
        </Text>
      </View>

      {draft.mode === "ssh" ? (
        <View style={styles.field}>
          <Text style={styles.label}>SSH host</Text>
          <TextInput
            accessibilityLabel="SSH host"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="server"
            placeholderTextColor={theme.colors.foregroundMuted}
            value={draft.sshHost}
            onChangeText={sshHost => set({ sshHost })}
          />
          <Text style={styles.help}>
            An alias from ~/.ssh/config or user@host. It must log in without a prompt (BatchMode).
          </Text>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>server-pressure command</Text>
        <TextInput
          accessibilityLabel="server-pressure command path"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          value={draft.command}
          onChangeText={command => set({ command })}
        />
        <Text style={styles.help}>Path on the watched Mac. tools/install.sh links it to ~/.local/bin/server-pressure.</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Display name</Text>
        <TextInput
          accessibilityLabel="Display name"
          style={styles.input}
          value={draft.label}
          placeholder="Hostname or SSH host"
          placeholderTextColor={theme.colors.foregroundMuted}
          onChangeText={label => set({ label })}
        />
      </View>

      {settings.status === "invalid" ? <Text style={styles.danger}>{settings.error}</Text> : null}
      {settings.saveError ? <Text style={styles.danger}>{settings.saveError}</Text> : null}
      {invalid ? <Text style={styles.danger}>Check the SSH host and command path.</Text> : null}

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save Server Load settings"
          disabled={invalid || settings.saving}
          style={styles.button}
          onPress={() => settings.save(draft, settings.revision)}
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
    </View>
  );
}
