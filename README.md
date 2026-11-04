# Server Load for Paseo

A Paseo plugin and a small macOS watchdog for a Mac that runs many coding agents at once. When memory runs low:

- new agents and heavy jobs wait instead of piling on,
- the newest heavy jobs pause so the oldest can finish,
- leftover test browsers get closed, and
- idle subagents get archived.

The plugin shows the current level and lets you turn each of these on or off.

It was built for a 16 GB M1 Pro that runs a Paseo daemon with a dozen or more Oh My Pi, Claude Code, and Codex sessions. The defaults fit that kind of machine, and you can change every limit.

## What's in here

| Path | What it is |
|---|---|
| `tools/server-pressure` | The command. It checks memory, answers the wait gate, runs the watchdog, and turns features on or off. Python 3.9 or later, no extra packages. |
| `tools/install.sh` | Links the command into `~/.local/bin`, adds the Oh My Pi extension if `omp` is installed, and starts the watchdog. `--remove` undoes it. |
| `tools/pressure-gate.ts` | Oh My Pi extension. It checks the gate before starting subagents, before Paseo `create_agent` calls, and before heavy shell commands. |
| everything else | The Paseo plugin: the **Server Load** sidebar row, a Command Center action, and a settings screen. |

## Install

Server Load has two parts, and you need both:

1. **The tools**, on every Mac you want to watch. They do the real work.
2. **The plugin**, in every Paseo daemon you want to see it from. It's only the dashboard.

If a Mac is missing the tools, the Server Load screen says so and shows the command to run.

### 1. Tools (on each Mac you want to watch)

You need macOS, the built-in `/usr/bin/python3` (Python 3.9 or later), and `git`.

```bash
git clone https://github.com/nerveband/paseo-server-load.git ~/src/paseo-server-load
~/src/paseo-server-load/tools/install.sh
server-pressure status
```

`install.sh` links `~/.local/bin/server-pressure`, links the Oh My Pi extension into `~/.omp/agent/extensions/` if `omp` is installed, and adds a launchd job (`io.github.nerveband.server-pressure`) that runs the watchdog every minute. It doesn't need `sudo`.

To install on a Mac you reach over SSH, run the same two lines there, or run this from your own Mac:

```bash
ssh <host> 'git clone https://github.com/nerveband/paseo-server-load.git ~/src/paseo-server-load && ~/src/paseo-server-load/tools/install.sh'
```

To update later:

```bash
git -C ~/src/paseo-server-load pull && ~/src/paseo-server-load/tools/install.sh
```

### 2. Plugin (in each Paseo daemon)

```bash
paseo plugin install git:nerveband/paseo-server-load
```

You need Paseo 0.13.0 or later. The plugin shows up as **Server Load** in the sidebar and the Command Center.

## Watch several Macs

Open **Settings → Plugins**, pick **Server Load** from the server-load menu (or run **Server Load settings** from the Command Center), and add each Mac you want to watch:

- **This Mac** is the Mac the Paseo daemon runs on.
- **Another Mac over SSH** runs `server-pressure` on that Mac through `ssh`. Use an `~/.ssh/config` alias or `user@host`, with a key that logs in without a prompt. The plugin can't answer prompts, so 1Password and other agents that ask for approval won't work. Test it with `ssh -o BatchMode=yes <host> true`.

The Server Load screen has a button for each Mac at the top. Tap one to switch. The first Mac in the list opens by default, and **Move up** changes the order. A common setup: a laptop daemon that watches the laptop and the server, and a server daemon that watches only **This Mac**.

## Levels

`server-pressure` checks the kernel's memory-pressure level, how much memory is free, how fast the Mac is reading back from swap, and the one-minute load average.

| Level | When | What happens |
|---|---|---|
| red | kernel pressure critical, free memory ≤ 10%, swap-in ≥ 40 MB/s, or load ≥ 4 × cores | new agents and heavy jobs wait; newer heavy jobs pause |
| yellow | kernel pressure warn, free memory ≤ 20%, swap-in ≥ 8 MB/s, or load ≥ 2 × cores | one heavy job at a time; new agents wait above 16 running agents |
| green | anything else | new agents wait above 24 running agents |

The level leaves red only after two calm checks in a row, so it doesn't flip back and forth.

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

Other agents can follow the same rule. Run `server-pressure gate --kind spawn` before starting agents and `server-pressure gate --kind heavy` before builds, renders, or test suites. If it exits with 75, stop and report.

## Settings

### Plugin machines (Settings → Plugins → server-load → Server Load, in each daemon)

| Field | Default | Meaning |
|---|---|---|
| This Mac / Another Mac over SSH | This Mac | Where `server-pressure` runs. |
| SSH host | empty | `~/.ssh/config` alias or `user@host`. Letters, numbers, `.`, `_`, `@`, and `-` only. |
| Name | hostname or SSH host | The label on the Mac's button. |
| server-pressure command | `~/.local/bin/server-pressure` | Where the command is on that Mac. |

### Watchdog (`~/.config/server-pressure/config.json` on each watched Mac)

Every setting is optional. Unknown settings or bad values are skipped, and the plugin and `server-pressure config` show a warning.

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

`spawn_cap_*` counts agent programs (omp, claude, codex, pi, opencode, antigravity) that the Paseo daemon started.

## What each switch does

- **gate**: affects only the command. When it's off, `server-pressure gate` always says go.
- **pause**: pauses (`SIGSTOP`) and later resumes (`SIGCONT`) ffmpeg, rembg, whisper, demucs, and hyperframes or remotion renders. The oldest one keeps running. Paused jobs resume one per minute once the level drops, and always after `max_pause_minutes`. Turning pause off resumes everything at once. A paused job can still hit its own timeout.
- **reap**: stops (`SIGTERM`) leftover processes that launchd adopted but doesn't manage, if they match a Go test script, a Playwright or Oh My Pi test browser, or (after `devserver_min_age_hours`) an `astro`, `vite`, `next`, `nuxt`, `remix`, or `wrangler` dev server.
- **archive**: archives Paseo subagents (agents with a parent-agent label) when both the subagent and its parent have been idle for `archive_subagent_idle_hours`. It never archives an agent you started. Each archive is logged to `~/.local/state/server-pressure/archived.jsonl`. `restore`, or the plugin's **Restore** button, runs `paseo agent reload`, which brings the agent back with its history and sends no prompt.

Every action is logged to `~/Library/Logs/server-pressure.log`.

## Uninstall

```bash
~/src/paseo-server-load/tools/install.sh --remove
paseo plugin remove server-load
```

## Work on the code

```bash
npm install
npm run typecheck
npm test
```

## License

MIT
