# Server Load for Paseo

A Paseo plugin and a small macOS watchdog for a Mac that runs many coding agents at once. When memory runs out, new agents and heavy jobs wait instead of piling on, the newest heavy jobs pause so the oldest can finish, leftover test browsers get cleaned up, and idle subagents get archived. The plugin shows the current level and lets you switch each of those on or off.

It was built for a 16 GB M1 Pro that hosts a Paseo daemon with a dozen or more Oh My Pi, Claude Code, and Codex sessions. The defaults suit that kind of machine; every threshold is configurable.

## What is in here

| Path | What it is |
|---|---|
| `tools/server-pressure` | The command. Samples memory pressure, answers the gate, runs one watchdog tick, and switches features. Python 3.9+, standard library only. |
| `tools/install.sh` | Links the command into `~/.local/bin`, adds the omp extension if `omp` is installed, and loads the launchd watchdog. `--remove` undoes it. |
| `tools/pressure-gate.ts` | Oh My Pi extension that calls the gate before `task` spawns, Paseo `create_agent` calls, and heavy bash commands. |
| everything else | The Paseo plugin (sidebar entry **Server Load**, a command center entry, and a settings screen). |

## Install

Server Load has two parts, and you need both:

1. **The tools**, on every Mac you want to watch. They do the actual work: the watchdog, the wait gate, and the switches.
2. **The plugin**, in every Paseo daemon you want to see it from. It is only the dashboard and does nothing on its own.

If a machine is missing the tools, the Server Load screen says so and shows the exact command to run.

### 1. Tools (macOS, on each watched Mac)

Requires macOS and the system `/usr/bin/python3` (Python 3.9 or later, standard library only). `git` is the only other thing you need.

```bash
git clone https://github.com/nerveband/paseo-server-load.git ~/src/paseo-server-load
~/src/paseo-server-load/tools/install.sh
server-pressure status
```

`install.sh` links `~/.local/bin/server-pressure`, links the Oh My Pi extension into `~/.omp/agent/extensions/` when `omp` is installed, and loads a launchd job (`io.github.nerveband.server-pressure`) that runs the watchdog every minute. It needs no `sudo`. To install on a machine you reach over SSH, run the same two lines there, or from your own Mac:

```bash
ssh <host> 'git clone https://github.com/nerveband/paseo-server-load.git ~/src/paseo-server-load && ~/src/paseo-server-load/tools/install.sh'
```

To update later: `git -C ~/src/paseo-server-load pull && ~/src/paseo-server-load/tools/install.sh`.

### 2. Plugin (in each Paseo daemon)

```bash
paseo plugin install git:nerveband/paseo-server-load
```

Paseo 0.9.2 or later. The plugin appears as **Server Load** in the sidebar and in the command center.

## Watching several machines

Open **Settings → Plugins**, pick **Server Load** from the server-load actions menu (or run **Server Load settings** from the command center), and add a machine for each Mac you want to watch:

- **This Mac** is the Mac the Paseo daemon runs on.
- **Another Mac over SSH** runs `server-pressure` through `ssh` from the daemon's Mac. Use an `~/.ssh/config` alias or `user@host`, with a key that logs in without a prompt (the plugin uses SSH BatchMode, so 1Password or other agents that ask for approval will not work). Check it with `ssh -o BatchMode=yes <host> true`.

The Server Load screen shows a button per machine at the top; tap one to switch. The first machine in the list opens by default, and **Move up** changes the order. A typical setup is a laptop daemon with two machines (the laptop itself and the server over SSH) and a server daemon with just **This Mac**.

## Levels

`server-pressure` reads the kernel's memory-pressure level and available-memory percentage, the swap-in rate since the last sample, and the one-minute load average.

| Level | When | Effect |
|---|---|---|
| red | kernel pressure critical, available memory ≤ 10%, swap-in ≥ 40 MB/s, or load ≥ 4 × cores | new agents and heavy jobs wait; newer heavy jobs pause |
| yellow | kernel pressure warn, available memory ≤ 20%, swap-in ≥ 8 MB/s, or load ≥ 2 × cores | one heavy job at a time; new agents wait above 16 live agents |
| green | otherwise | new agents wait above 24 live agents |

The watchdog leaves red only after two calm samples in a row, so the level does not flap.

## Commands

```text
server-pressure status [--json]
server-pressure gate [--kind spawn|heavy] [--max-wait SEC] [--json]   exit 0 = go, 75 = still blocked
server-pressure off [all|gate|pause|reap|archive ...]
server-pressure on  [all|gate|pause|reap|archive ...]
server-pressure archived [--json] [--limit N]
server-pressure restore <agent-id>
server-pressure config
```

Agents that are not Oh My Pi can follow the same rule by running `server-pressure gate --kind spawn` before they start agents and `server-pressure gate --kind heavy` before builds, renders, or test suites, and by stopping to report when it exits 75.

## Settings

### Plugin machines (Settings → Plugins → server-load → Server Load, per Paseo daemon)

| Field | Default | Meaning |
|---|---|---|
| This Mac / Another Mac over SSH | This Mac | Where `server-pressure` runs. |
| SSH host | empty | `~/.ssh/config` alias or `user@host`. Letters, digits, `.`, `_`, `@`, `-` only. |
| Name | hostname or SSH host | Label on the machine button. |
| server-pressure command | `~/.local/bin/server-pressure` | Path on that Mac. |

### Watchdog (`~/.config/server-pressure/config.json` on the watched Mac)

Every key is optional. Unknown keys or bad values are ignored and shown as a warning in the plugin and in `server-pressure config`.

```json
{
  "red_mem_available_pct": 10,
  "yellow_mem_available_pct": 20,
  "red_swapin_mb_per_s": 40,
  "yellow_swapin_mb_per_s": 8,
  "red_load_per_cpu": 4,
  "yellow_load_per_cpu": 2,
  "spawn_cap_green": 24,
  "spawn_cap_yellow": 16,
  "max_pause_minutes": 20,
  "archive_subagent_idle_hours": 6,
  "orphan_min_age_hours": 2,
  "devserver_min_age_hours": 48,
  "paseo": "~/.local/bin/paseo"
}
```

`spawn_cap_*` counts agent CLIs (omp, claude, codex, pi, opencode, antigravity) started by the Paseo daemon.

## What each control touches

- **gate**: nothing outside the command. When off, `server-pressure gate` always answers go.
- **pause**: sends `SIGSTOP` and later `SIGCONT` to processes whose command matches ffmpeg, rembg, whisper, demucs, or a hyperframes or remotion render. The oldest one keeps running. Jobs resume one per minute once the level drops, and after `max_pause_minutes` regardless. Switching pause off resumes everything at once. A paused job can still hit its caller's own timeout.
- **reap**: sends `SIGTERM` to processes whose parent is launchd, that launchd does not manage, and that match a Go test temp script, a Playwright or Oh My Pi Chrome for Testing, or (after `devserver_min_age_hours`) an `astro`, `vite`, `next`, `nuxt`, `remix`, or `wrangler` dev server group.
- **archive**: archives Paseo agents that carry a parent-agent label, have been idle for `archive_subagent_idle_hours`, and whose parent has been idle that long too. It never archives an agent you started. Each archive is logged to `~/.local/state/server-pressure/archived.jsonl`, and `restore` (or the plugin's Restore button) runs `paseo agent reload`, which brings the agent back with its history and sends no prompt.

Every action is logged to `~/Library/Logs/server-pressure.log`.

## Uninstall

```bash
~/src/paseo-server-load/tools/install.sh --remove
paseo plugin remove server-load
```

## Development

```bash
npm install
npm run typecheck
npm test
```

## License

MIT
