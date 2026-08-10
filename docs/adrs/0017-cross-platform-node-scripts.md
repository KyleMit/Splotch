# ADR-0017: Cross-Platform Node Scripts with Shared Helpers in scripts/lib/

**Status:** Active — **amended** by [ADR-0062](0062-drop-windows-dev-support.md): the shared-helper
structure stands, but scripts now target **macOS and Linux only** (Windows dev support was dropped),
so the Windows branches described below (`isWindows`, `where`, `.cmd`/`.bat` shims, `gradlew.bat`)
were removed. **Date:** 2026-06

**Amended 2026-07-27:** command discovery now uses POSIX `sh` + `command -v`, stateless stroke
geometry lives outside the Playwright driver, and Vite lifecycle handling has its own shared module.

> **Superseded in part by [ADR-0108](0108-unified-tools-tree.md):** the shared-helper, Node `.mjs`,
> macOS/Linux, and process-safety rules below all stand. Only the **location** changed — `scripts/`
> is now `tools/`, and `scripts/lib/` split into a shared `tools/lib/` plus per-capability
> `tools/<capability>/lib/`.

## Context

The `scripts/` folder grew to eleven standalone `.mjs` files that each re-derived the same
boilerplate: computing the repo root from `import.meta.url`, spawning child processes with manual
status checks, sleeping, parsing release-file frontmatter, and (in two Playwright scripts) ~150
lines of duplicated app-driving code. Several scripts were also single-platform:
`android-emulator-smoke.mjs` hardcoded `%LOCALAPPDATA%` paths and `.bat` extensions (Windows-only),
while `android-setup.mjs` assumed `~/Library/Android/sdk`, brew, and `~/.zshrc` (macOS-only).

Two alternatives were considered when simplifying:

* **Rewrite the shell-heavy scripts in bash.** `android-setup.mjs` in particular is ~90% process
  orchestration, which bash expresses more tersely (`command -v`, `yes |`, `set -e`). Rejected: the
  team standardizes on Node/TypeScript tooling everywhere else, bash would be a lone outlier among
  eleven Node scripts, and at the time the project still supported Windows development (later
  dropped — ADR-0062), which bash couldn't serve.
* **Keep each script fully self-contained.** Zero-import scripts are easy to copy around, but the
  duplication had already drifted (two near-identical Playwright helper sets, two frontmatter
  parsers) and made each script longer than its actual job.

## Decision

All automation scripts in `scripts/` are Node `.mjs` files that must run on macOS and Linux. Shared
boilerplate lives in purpose-named modules under `scripts/lib/`, and each script reads imperatively
top-to-bottom with only its own domain logic inline:

* `scripts/lib/proc.mjs` — process/CLI helpers: repo-root and main-entry resolution, environment and
  CLI argument handling, `run`/`capture` (spawn the executable with an argument array directly,
  preserving literal arguments while the OS resolves commands through `PATH`), `sh` (the explicit
  escape hatch for deliberate shell command lines), OS opening, command discovery through POSIX
  `sh` + `command -v`, polling, and run-ID generation.
* `scripts/lib/net.mjs` — `waitForUrl`, polling a URL until it responds ready.
* `scripts/lib/playwright.mjs` — Chromium binary resolution, self-healing against cached-revision
  drift under `PLAYWRIGHT_BROWSERS_PATH`.
* `scripts/lib/maestro.mjs` — the Maestro CLI location (PATH first, then `~/.maestro/bin`).
* `scripts/lib/frontmatter.mjs` — strict flat-frontmatter parsing, deep file writes, and semver
  comparison for the release tooling.
* `scripts/lib/android.mjs` — macOS/Linux Android SDK resolution: `ANDROID_HOME` or
  `ANDROID_SDK_ROOT`, then `~/Library/Android/sdk` or `~/Android/Sdk`; plus `ADB`/`EMULATOR` binary
  paths and `AVD_NAME`.
* `scripts/lib/app-driver.mjs` — Playwright helpers for scripts that drive the live app
  (`store-shots.mjs`, `gen-large-image.mjs`): `ensureDevServer` (reuses an already-running server on
  the port, else spawns `node_modules/vite/bin/vite.js` directly — no shell — so killing the whole
  process group works reliably), `openAppPage`, and the UI gestures (`pickColor`, `setStrokeSize`,
  `drawStroke`, `expandDrawer`, `dismissMenu`).
* `scripts/lib/stroke-geometry.mjs` — dependency-free point generators shared by browser-driving
  scripts and the performance scenario without importing Playwright.
* `scripts/lib/vite-server.mjs` — group-safe Vite lifecycle and stale-port cleanup, including the
  visible-output cloud-tunnel variant.
* `scripts/lib/book-assets.mjs` — coloring-book distribution helpers, including the script-side
  `webOnlyBooks` complement of `booksForPlatform('mobile')` in `web/src/lib/state/books.ts`.

Non-obvious invariants:

* `run()`/`capture()` exit the process on failure — scripts stay imperative with no try/catch.
  Cleanup-sensitive flows use the rejecting async `sh()` helper so a failed shell command still
  reaches the caller's `finally` block.
* Platform branching belongs in `scripts/lib/` (paths, executable names, fix instructions), not
  scattered through individual scripts.
* `local.properties` is written with forward slashes — backslashes are escape characters in Java
  properties files.

## Consequences

* \+ Each script now contains only its own job; the ~100-line scripts dropped by a third or more,
  and the two Playwright scripts share one driver.
* \+ `android-setup` and `test:android` work on macOS and Linux, with per-platform fix instructions
  when tools are missing.
* \+ New scripts get cross-platform process handling for free instead of re-discovering the
  `.cmd`-shim and quoting pitfalls.
* − Scripts are no longer copy-paste self-contained; moving one elsewhere means bringing
  `scripts/lib/` along.
* − `run()` exiting the process makes it unsuitable for cleanup-sensitive flows; those callers must
  use the rejecting async `sh()` helper.
* − Deliberate shell syntax is confined to `sh()` command lines, which remain
  shell-dialect-sensitive and require callers to handle their own quoting.
