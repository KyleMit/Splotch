# ADR-0024: Web App in `web/` Subdirectory to Scope the Netlify Dev Watcher

**Status:** Active
**Date:** 2026-06

## Context

`npm run dev:netlify` (Netlify Dev — the local server that runs the `/api/*` functions)
crashed shortly after start with `EMFILE: too many open files, watch`.

Root cause: netlify-cli bundles **chokidar 4**, which dropped the native `fsevents` watcher
and watches via Node's `fs.watch` — **one file descriptor per directory** on macOS. Its
edge-functions registry watches the **entire project root** (its only built-in ignores are
`node_modules` and `.git`). With the app at the repo root, that root also held the
Capacitor native trees — `ios/` (~6,300 dirs) + `android/` (~1,100 dirs) — so the watcher
tried to open ~7,400 descriptors and died.

Approaches that do **not** work (verified empirically, with the config in place at crash time):

- `netlify.toml [dev] watch.ignore` — netlify-cli has no such config key; silently ignored.
- Vite `server.watch.ignored` — configures Vite's *separate* watcher process, not netlify-cli's.
- Raising `ulimit -n` — works as a band-aid but is per-machine/per-shell and not portable.

netlify-cli's watch root is `command.workingDir`, which `--cwd` sets directly (no workspace
machinery). So scoping the watcher to a subdirectory that excludes the native trees is the
structural fix. We chose subdirectories over npm/pnpm **workspaces** deliberately — the app
and its Capacitor plugins (`@capacitor/*`, imported in several source files) share one
dependency tree, and a workspace split adds more machinery than the problem warrants.

## Decision

Move the web-served app into **`web/`** and run **`netlify dev --cwd web`** so netlify-cli's
watch root is `web/`. The Capacitor native trees (`android/`, `ios/`) stay at the repo root as
**siblings of `web/`** — outside the watch root, so they are never watched.

Layout:

- **Repo root** (Capacitor project root; *not* netlify's watch root): `package.json` +
  `node_modules` (the single dependency tree), `capacitor.config.json` (`webDir: "web/build"`),
  `android/`, `ios/`, `scripts/`, `fastlane/`, release/store assets.
- **`web/`** (netlify workingDir): `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, the
  Vitest/Playwright configs, `src/`, `static/`, `tests/`, `netlify.toml`, and the `build/`
  output.

`web/` has **no `package.json` of its own**. The toolchain (vite, svelte-kit, vitest,
playwright) runs with `cwd = web/`, resolving `node_modules` upward to the root, via the
`scripts/web.mjs` helper (cross-platform per ADR-0017). The local dev server is driven by an
explicit custom command in `web/netlify.toml` (`[dev] framework = "#custom"` + `command` +
`targetPort`), since framework auto-detection would otherwise need a `web/package.json`.

## Consequences

- **+** `npm run dev:netlify` runs with the watcher scoped to `web/` (~200 dirs) — no EMFILE,
  on any machine, with no `ulimit` tuning.
- **+** One `package.json` / `node_modules` / `npm ci` at the root; Capacitor, every
  `scripts/*.mjs`, and the Android CI job are unaffected (native trees never moved).
- **−** The app no longer lives at the repo root, so tooling runs through the `scripts/web.mjs`
  cwd shim, and `scripts/*.mjs` that touch `src/`/`static/`/`build/`/`tests/` use `web/…` paths.
- **Production deploy** keeps the Netlify base at the repo **root** (so `npm ci` finds the root
  `package.json`/lockfile). `npm run build` runs the SvelteKit build with cwd=web/, so
  adapter-netlify writes under `web/`; `scripts/stage-netlify.mjs` (the tail of the root
  `netlify.toml` build command) then copies `web/build → build` and `web/.netlify → .netlify`,
  reproducing the standard "app at root" layout Netlify expects (`publish = "build"`, SSR
  function at `.netlify/functions-internal`). Two `netlify.toml` files result: the root one for
  production, `web/netlify.toml` for local `netlify dev`. **This must still be confirmed green on
  a Netlify deploy preview before merging** — it is implemented but not yet validated against a
  real Netlify build.

Supersedes the root-level layout assumed by ADR-0001 (the dual-adapter strategy itself is
unchanged; only the file locations moved).
