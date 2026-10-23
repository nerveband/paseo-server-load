Server Load keeps a Mac that runs many coding agents from sinking into swap. It shows the machine's memory-pressure level (green, yellow, or red) with the reasons behind it, and gives you a switch for each load control.

The controls come from the `server-pressure` watchdog in this repository, which runs every minute through launchd:

- **Wait gate.** New agents, subagents, and heavy jobs (renders, ML models, builds, test suites) wait while pressure is red and report back if it stays red. Oh My Pi sessions enforce this automatically through a bundled extension; other agents can run `server-pressure gate`.
- **Pause heavy jobs.** Under red, the newest heavy jobs (ffmpeg, rembg, whisper, render commands) are paused so the oldest one finishes. Nothing stays paused for more than 20 minutes.
- **Clean up leftovers.** Stops orphaned test browsers, test scripts, and dev servers that agents left running.
- **Archive idle subagents.** Archives Paseo subagents that have been idle for 6 hours once their parent is idle too. Threads you start are never archived. A Recently archived list restores any of them with one click.

Setup: run `tools/install.sh` on the Mac you want to watch (macOS only, uses the system `python3`). In Settings, choose This Mac, or Another Mac over SSH with a host alias that logs in without a prompt. Thresholds, caps, and timings live in `~/.config/server-pressure/config.json` on the watched Mac.

The plugin runs `server-pressure` locally or over SSH and reads only its JSON output. It sends nothing anywhere else.
