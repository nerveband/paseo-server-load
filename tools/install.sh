#!/usr/bin/env bash
# Install the server-pressure gate and watchdog for the current macOS user. Safe to re-run.
#   tools/install.sh            link the command, add the omp extension if omp is installed,
#                               and load the watchdog (runs every 60 seconds)
#   tools/install.sh --remove   unload the watchdog, resume paused jobs, remove the links
set -Eeuo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
label=io.github.nerveband.server-pressure
plist="$HOME/Library/LaunchAgents/$label.plist"
domain="gui/$(id -u)"
bin="$HOME/.local/bin/server-pressure"
ext="$HOME/.omp/agent/extensions/pressure-gate.ts"

if [[ "$(uname -s)" != Darwin ]]; then
  echo "server-pressure reads macOS memory statistics and only runs on macOS" >&2
  exit 1
fi

if [[ "${1:-}" == --remove ]]; then
  launchctl bootout "$domain/$label" 2>/dev/null || true
  /usr/bin/python3 - <<'PY'
import json, os, signal
p = os.path.expanduser("~/.local/state/server-pressure/state.json")
try:
    for job in json.load(open(p)).get("paused", []):
        try:
            os.kill(job["pid"], signal.SIGCONT)
        except OSError:
            pass
except (OSError, ValueError):
    pass
PY
  rm -f "$plist" "$bin" "$ext"
  echo "removed. State and logs stay in ~/.local/state/server-pressure and ~/Library/Logs/server-pressure.log"
  exit 0
fi

mkdir -p "$HOME/.local/bin" "$HOME/Library/LaunchAgents"
chmod +x "$here/server-pressure"
ln -sf "$here/server-pressure" "$bin"

if command -v omp >/dev/null 2>&1; then
  mkdir -p "$(dirname "$ext")"
  ln -sf "$here/pressure-gate.ts" "$ext"
  # The gate may wait up to 10 minutes inside a tool_call handler (default budget is 30 s).
  omp config set extensionHandlers.toolCallTimeoutMs 660000 >/dev/null
  echo "omp extension linked: $ext"
else
  echo "omp not found: skipping the omp extension (other agents can call 'server-pressure gate')"
fi

# launchd starts with a minimal PATH; give the watchdog the directories that hold paseo and node.
path_dirs="$HOME/.local/bin"
for tool in paseo node; do
  if found="$(command -v "$tool" 2>/dev/null)"; then path_dirs="$path_dirs:$(dirname "$found")"; fi
done
path_dirs="$path_dirs:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cat >"$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>$label</string>
	<key>ProgramArguments</key>
	<array>
		<string>/usr/bin/python3</string>
		<string>$bin</string>
		<string>watchdog</string>
	</array>
	<key>StartInterval</key>
	<integer>60</integer>
	<key>RunAtLoad</key>
	<true/>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>$path_dirs</string>
	</dict>
	<key>ProcessType</key>
	<string>Interactive</string>
	<key>StandardOutPath</key>
	<string>$HOME/Library/Logs/server-pressure.launchd.log</string>
	<key>StandardErrorPath</key>
	<string>$HOME/Library/Logs/server-pressure.launchd.log</string>
</dict>
</plist>
PLIST
plutil -lint "$plist" >/dev/null
launchctl bootout "$domain/$label" 2>/dev/null || true
launchctl bootstrap "$domain" "$plist"
echo "watchdog loaded: $label"
"$bin" status
