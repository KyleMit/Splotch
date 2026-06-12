# ADR-0017: Cross-Platform Node Scripts with Shared Helpers in scripts/lib/

**Status:** Active
**Date:** 2026-06

## Context

The `scripts/` folder grew to eleven standalone `.mjs` files that each
re-derived the same boilerplate: computing the repo root from
`import.meta.url`, spawning child processes with manual status checks, sleeping,
parsing release-file frontmatter, and (in two Playwright scripts) ~150 lines of
duplicated app-driving code. Several scripts were also single-platform:
`android-emulator-smoke.mjs` hardcoded `%LOCALAPPDATA%` paths and `.bat`
extensions (Windows-only), while `android-setup.mjs` assumed
`~/Library/Android/sdk`, brew, and `~/.zshrc` (macOS-only).

Two alternatives were considered when simplifying:

- **Rewrite the shell-heavy scripts in bash.** `android-setup.mjs` in
  particular is ~90% process orchestration, which bash expresses more tersely
  (`command -v`, `yes |`, `set -e`). Rejected: the project explicitly supports
  Windows development (see MOBILE.md and ADR-0011/0012), bash would be a lone
  outlier among eleven Node scripts, and the team standardizes on
  Node/TypeScript tooling everywhere else.
- **Keep each script fully self-contained.** Zero-import scripts are easy to
  copy around, but the duplication had already drifted (two near-identical
  Playwright helper sets, two frontmatter parsers) and made each script longer
  than its actual job.

## Decision

All automation scripts in `scripts/` are Node `.mjs` files that must run on
both Windows and macOS. Shared boilerplate lives in three modules under
`scripts/lib/`, and each script reads imperatively top-to-bottom with only its
own domain logic inline:

- `scripts/lib/utils.mjs` — generic helpers: `ROOT`, `isWindows`, `sleep`,
  `fail`, `run`/`capture` (spawn **through the shell** so Windows `.cmd`/`.bat`
  shims like `npm`, `npx`, `gh`, and `sdkmanager` resolve, with args quoted),
  `hasCommand` (`which`/`where`), `parseFrontmatter`, `writeFileDeep`,
  `compareSemverDesc`, `webOnlyBooks`.
- `scripts/lib/android.mjs` — per-platform Android SDK resolution:
  `ANDROID_HOME` (env override, else `%LOCALAPPDATA%\Android\Sdk` /
  `~/Library/Android/sdk`), `ADB`/`EMULATOR` binary paths, `AVD_NAME`, and the
  Maestro location.
- `scripts/lib/app-driver.mjs` — Playwright helpers for scripts that drive the
  live app (`store-shots.mjs`, `gen-large-image.mjs`): `ensureDevServer`
  (reuses an already-running server on the port, else spawns
  `node_modules/vite/bin/vite.js` directly — no shell — so killing it works on
  Windows), `openAppPage`, and the UI gestures (`pickColor`, `setStrokeSize`,
  `drawStroke`, `expandDrawer`, `dismissMenu`) plus point generators.

Non-obvious invariants:

- `run()`/`capture()` exit the process on failure — scripts stay
  imperative with no try/catch. The one exception is
  `android-emulator-smoke.mjs`, which keeps a local async `sh()` because a
  failed build must still reach the `finally` block that kills the emulator.
- Platform branching belongs in `scripts/lib/` (paths, executable names, fix
  instructions), not scattered through individual scripts.
- `local.properties` is written with forward slashes — backslashes are escape
  characters in Java properties files.

## Consequences

- + Each script now contains only its own job; the ~100-line scripts dropped
  by a third or more, and the two Playwright scripts share one driver.
- + `android-setup` and `test:android` work on both Windows and macOS, with
  per-platform fix instructions when tools are missing.
- + New scripts get cross-platform process handling for free instead of
  re-discovering the `.cmd`-shim and quoting pitfalls.
- - Scripts are no longer copy-paste self-contained; moving one elsewhere means
  bringing `scripts/lib/` along.
- - `run()` exiting the process makes it unsuitable for cleanup-sensitive flows;
  authors must notice and use an async local runner (as the smoke test does).
- - Shell-mediated spawning means argument quoting is centralized but still
  shell-dialect-sensitive; exotic arguments (embedded quotes) would need care.
