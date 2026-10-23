Server Load keeps a Mac that runs many coding agents from sinking into swap. It shows each watched Mac's memory-pressure level (green, yellow, or red) with the reasons behind it, and gives you a switch for each load control. Watch several Macs from one place and switch between them at the top of the screen.

It has two parts. This plugin is the dashboard. The work is done by the `server-pressure` tools, which you install on every Mac you want to watch:

```bash
git clone https://github.com/nerveband/paseo-server-load.git ~/src/paseo-server-load
~/src/paseo-server-load/tools/install.sh
```

That needs macOS and the system `python3`, and no `sudo`. If a machine does not have the tools yet, the Server Load screen says so and shows this command for that machine.

The controls:

- **Wait gate.** New agents, subagents, and heavy jobs (renders, ML models, builds, test suites) wait while pressure is red and report back if it stays red. Oh My Pi sessions enforce this automatically through a bundled extension; other agents can run `server-pressure gate`.
- **Pause heavy jobs.** Under red, the newest heavy jobs (ffmpeg, rembg, whisper, render commands) are paused so the oldest one finishes. Nothing stays paused for more than 20 minutes.
- **Clean up leftovers.** Stops orphaned test browsers, test scripts, and dev servers that agents left running.
- **Archive idle subagents.** Archives Paseo subagents that have been idle for 6 hours once their parent is idle too. Threads you start are never archived. A Recently archived list restores any of them with one click.

Add machines in Settings → Plugins → Server Load: **This Mac** for the Mac the daemon runs on, or **Another Mac over SSH** with a host alias that logs in without a prompt. Thresholds, caps, and timings live in `~/.config/server-pressure/config.json` on each watched Mac.

The plugin runs `server-pressure` locally or over SSH and reads only its JSON output. It sends nothing anywhere else.
