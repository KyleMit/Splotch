# ADR-0062: Drop Windows Dev Support (macOS + Linux Only)

**Status:** Active\
**Date:** 2026-07

## Context

Splotch's tooling was originally written to run on Windows `cmd.exe` as well as macOS and Linux
(ADR-0017). That portability had real, ongoing costs spread across the repo:

* Every env-var-setting npm script was wrapped in
  [`cross-env`](https://github.com/kentcdodds/cross-env) because `cmd.exe` has no
  `VAR=value command` syntax. `cross-env`'s upstream is archived (see the former entry in
  `docs/DEPENDENCIES.md`), so it was a frozen, load-bearing dependency.
* `@capacitor/cli` shells out to `./gradlew`, which breaks on Windows; a `patch-package` patch
  (ADR-0011) rewrote four spawn sites to use `gradlew.bat`, and a `postinstall: patch-package` step
  re-applied it on every install. That was the repo's only lifecycle script.
* `scripts/lib/` and several scripts carried `isWindows` branches for executable names
  (`gradlew.bat`, `jarsigner.exe`, `netlify.cmd`, `maestro.bat`), SDK locations (`%LOCALAPPDATA%`,
  `%USERPROFILE%`), process teardown (`taskkill` vs `process.kill`), and `where` vs `which`.
* The mobile/testing/architecture skills and `docs/CONTRIBUTING.md` documented a parallel Windows
  toolchain (nvm-windows, PowerShell `PATH` edits, manual Maestro install).

In practice the project is developed and shipped from macOS (iOS builds require it) and Linux (cloud
sessions, CI). No one develops it on Windows, so all of the above was maintenance and dependency
surface with no live user.

## Decision

Support development on **macOS and Linux only**. Concretely:

* Remove `cross-env`; npm scripts set env vars inline (`CAPACITOR=true …`, `PERF_MARKS=true …`),
  which works in the shell npm uses on macOS/Linux.
* Remove the `@capacitor/cli` Windows patch, the `patches/` directory, the `postinstall` script, and
  the `patch-package` dependency (ADR-0011 superseded). The repo now defines **no** lifecycle
  scripts; `android:emulator`'s `cap run android` runs the unpatched CLI, which is correct on
  macOS/Linux.
* Drop the `isWindows` branches from `scripts/lib/utils.mjs`, `android.mjs`, `vite-server.mjs`, and
  the individual scripts — each resolves the single macOS/Linux path (`./gradlew`, `jarsigner`,
  `netlify`, `which`, `~/.maestro/bin`, `process.kill(-pid)`), keeping only the genuine
  macOS-vs-Linux differences (SDK location, `open` vs `xdg-open`).
* Remove `android/gradlew.bat`.
* Update the agent instructions (ruler sources), skills, `docs/CONTRIBUTING.md`, and
  `docs/DEPENDENCIES.md`, and amend ADR-0012, ADR-0017, and ADR-0029 to match.

The shared-helper structure of ADR-0017 stands; only its platform scope narrows. iOS remains
macOS-only as before (ADR-0020).

## Consequences

* **+** Two fewer dependencies (`cross-env`, `patch-package`) — one of them archived — and no
  lifecycle scripts, so a plain `npm install` reproduces the working tree.
* **+** Scripts read straight through without platform forks; new scripts don't have to re-learn the
  `.cmd`-shim, `taskkill`, and `%LOCALAPPDATA%` pitfalls.
* **+** Less documentation to keep in sync — one toolchain path per skill, not two.
* **-** A future contributor on Windows would need WSL (which presents as Linux) or another machine;
  the scripts no longer degrade to `cmd.exe`.
* **-** If `@capacitor/cli` is ever run on Windows again, the gradlew bug (ADR-0011) returns; the
  patch would have to be reinstated.
