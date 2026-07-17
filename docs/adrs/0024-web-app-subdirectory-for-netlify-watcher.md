# ADR-0024: Web App in `web/` Subdirectory to Scope the Netlify Dev Watcher

**Status:** Active **Date:** 2026-06

## Context

`npm run dev:netlify` (Netlify Dev — the local server that runs the `/api/*` functions) crashed
shortly after start with `EMFILE: too many open files, watch`.

Root cause: netlify-cli bundles **chokidar 4**, which dropped the native `fsevents` watcher and
watches via Node's `fs.watch` — **one file descriptor per directory** on macOS. Its edge-functions
registry watches the **entire project root** (its only built-in ignores are `node_modules` and
`.git`). With the app at the repo root, that root also held the Capacitor native trees — `ios/`
(~6,300 dirs) + `android/` (~1,100 dirs) — so the watcher tried to open ~7,400 descriptors and died.

The natural fixes are to tell *something* to ignore the native trees, or to raise the descriptor
ceiling. None of them work here — see **Alternatives considered** below for why each is either
silently a no-op, aimed at the wrong watcher, or not portable.

netlify-cli's watch root is `command.workingDir`, which `--cwd` sets directly (no workspace
machinery). So scoping the watcher to a subdirectory that excludes the native trees is the only
**structural** fix — it removes the directories from the set being watched rather than fighting a
watcher we can't configure.

## Decision

Move the web-served app into **`web/`** and run **`netlify dev --cwd web`** so netlify-cli's watch
root is `web/`. The Capacitor native trees (`android/`, `ios/`) stay at the repo root as **siblings
of `web/`** — outside the watch root, so they are never watched.

Layout:

* **Repo root** (Capacitor project root; *not* netlify's watch root): `package.json` +
  `node_modules` (the single dependency tree), `capacitor.config.json` (`webDir: "web/build"`),
  `android/`, `ios/`, `scripts/`, `fastlane/`, release/store assets.
* **`web/`** (netlify workingDir): `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, the
  Vitest/Playwright configs, `src/`, `static/`, `tests/`, `netlify.toml`, and the `build/` output.

`web/` has **no `package.json` of its own**. The toolchain (vite, svelte-kit, vitest, playwright)
runs with `cwd = web/`, resolving `node_modules` upward to the root, via the `scripts/web.mjs`
helper (cross-platform per ADR-0017). The local dev server is driven by an explicit custom command
in `web/netlify.toml` (`[dev] framework = "#custom"` + `command` + `targetPort`), since framework
auto-detection would otherwise need a `web/package.json`.

## Consequences

* **+** `npm run dev:netlify` runs with the watcher scoped to `web/` (~200 dirs) — no EMFILE, on any
  machine, with no `ulimit` tuning.
* **+** One `package.json` / `node_modules` / `npm ci` at the root; Capacitor, every
  `scripts/*.mjs`, and the Android CI job are unaffected (native trees never moved).
* **−** The app no longer lives at the repo root, so tooling runs through the `scripts/web.mjs` cwd
  shim, and `scripts/*.mjs` that touch `src/`/`static/`/`build/`/`tests/` use `web/…` paths.
* **Production deploy** keeps the Netlify base at the repo **root** (so `npm ci` finds the root
  `package.json`/lockfile). `npm run build` runs the SvelteKit build with cwd=web/, so
  adapter-netlify writes under `web/`; `scripts/stage-netlify.mjs` (the tail of the root
  `netlify.toml` build command) then copies `web/build → build` and `web/.netlify → .netlify`,
  reproducing the standard "app at root" layout Netlify expects (`publish = "build"`, SSR function
  at `.netlify/functions-internal`). Two `netlify.toml` files result: the root one for production,
  `web/netlify.toml` for local `netlify dev`. **This must still be confirmed green on a Netlify
  deploy preview before merging** — it is implemented but not yet validated against a real Netlify
  build.

Supersedes the root-level layout assumed by ADR-0001 (the dual-adapter strategy itself is unchanged;
only the file locations moved).

## Alternatives considered

All three of the "just don't watch those folders" fixes were tried against the actual crash before
moving the app; each failed for a structural reason, not a tuning one.

### Raise the open-file limit (`ulimit -n`)

The crash is `EMFILE` — the watcher wants more file descriptors than the shell allows (macOS
defaults the soft limit to 256). Bumping it (`ulimit -n 10240`) above the ~7,400 the watcher needs
does stop the crash.

Rejected because it fixes the symptom, not the cause, and isn't committable config. It would have to
be set in every contributor's shell and every CI runner *before* `dev:netlify`, and silently
regresses the first time someone forgets. The project supports macOS and Linux, but encoding an
`ulimit` change in a contributor shell would still be uncommittable and easy to forget. We'd be
telling the watcher it may open 7,400 descriptors to watch trees we never edit, instead of not
watching them.

### Add a watch-ignore to `netlify.toml`

The intuitive fix: declare `android/` and `ios/` as ignored so netlify-cli's watcher skips them
(e.g. a `[dev] watch.ignore` key).

Impossible: netlify-cli (v26) exposes no such option. Its edge-functions registry watcher hard-codes
its ignore set to `node_modules` and `.git`; there is no public or documented config to extend it. A
key added under `[dev]` is silently accepted and ignored — verified empirically, the crash
reproduced byte-for-byte with the config in place.

### Add `server.watch.ignored` to `vite.config.ts`

Vite's dev server *does* support ignoring paths in its file watcher, so configuring it to skip the
native trees looks like the right lever.

Ineffective: it configures only **Vite's own** watcher (the bundler/HMR process). Under
`netlify dev`, netlify-cli runs a **separate** chokidar watcher for its edge-functions registry, in
its own process, that never consults Vite's config. The descriptors that overflow `EMFILE` belong to
*that* watcher, so ignoring paths in Vite changes nothing about the crash — it's aimed at the wrong
process.

### npm/pnpm workspaces instead of plain subdirectories

Once the fix is "scope netlify-cli's `--cwd` to a subdirectory," a workspace split is the heavier
way to get there. Rejected: the app and its Capacitor plugins (`@capacitor/*`, imported in several
source files) share one dependency tree, so a workspace boundary buys nothing and adds machinery — a
`web/package.json`, hoisting rules, a second install surface. Plain subdirectories under one root
`package.json` give netlify-cli the scoped watch root it needs with none of that (see **Decision**).
