<!-- Source: .ruler/AGENTS.md -->

# scripts/ — repo automation

> This directory's `CLAUDE.md` and `AGENTS.md` are generated from the `.ruler/AGENTS.md` beside them
> — edit that source, then run `npm run ruler:apply` at the repo root (ADR-0058).

* Every script must run on macOS and Linux (ADR-0017) — the project dropped Windows dev support
  (ADR-0062). Keep them plain Node `.mjs` for consistency, and put the macOS-vs-Linux differences
  that remain (SDK paths, `open` vs `xdg-open`) behind a branch in `scripts/lib/` rather than
  scattering them. Scripts bound to one platform by nature (`ios-simulator-smoke.mjs` needs Xcode)
  must fail fast with a clear message elsewhere.
* Shared helpers live in `scripts/lib/` — `android.mjs` resolves the SDK and AVD locations per
  platform (override the SDK with `ANDROID_HOME` or `ANDROID_SDK_ROOT`); `proc.mjs` has the common
  process/CLI helpers (`run`/`capture`/`fail`, `sh()` for a rejecting, shell-based command runner,
  env and arg handling, the OS opener); `net.mjs` has `waitForUrl()` for polling a URL until ready;
  `playwright.mjs` resolves the Chromium binary; `maestro.mjs` the Maestro location;
  `frontmatter.mjs` the release frontmatter/semver parsing; `vite-server.mjs` spawns a throwaway
  vite dev/preview server in a detached process group so `stop()` can't orphan the vite grandchild;
  `smoke.mjs` has the `check()`/`fatal()`/`summarize()` pass-fail reporter shared by the smoke
  tests; `adminClient.mjs` the `/api/admin` login + token-CRUD request plumbing they both drive; and
  `native-export.mjs` owns what the native static export drops — the web-only static file list plus
  the head-tag rewrite that keeps `strip-native-assets.mjs` from leaving a tag pointing at a file it
  deleted. Check there before writing new glue. A new helper joins the purpose-named module that
  owns its concern (or gets a new purpose-named file) — never a `utils`/`misc`/`helpers` grab-bag.
* Every CLI script gates execution behind `isMain(import.meta)` (`scripts/lib/proc.mjs`) and exports
  a distinctly named entry function.
* Script options are flags via `parseArgs`; an env var is at most a documented fallback.
* Multi-item CLI runs: validate inputs up front with a path-specific one-line error and a non-zero
  exit; wrap per-item work in try/catch and report failures at the end without discarding completed
  results; never overwrite a baseline/output artifact from a run that had errors; name polling
  budgets.
* TypeScript-flavored scripts run via `node --experimental-strip-types` (see the `check:assets` npm
  script).
* Env vars in npm scripts are set inline (`VAR=value cmd`) — no `cross-env`, since scripts run only
  on macOS/Linux.
* **The AI/`sharp` asset-generation pipeline moved to `tools/asset-gen/`**
  (`tools/asset-gen/docs/architecture.md`): the AI style covers, light/dark coloring-page fills,
  thumbnails, and format/line-art utilities (`gen-style-covers`, `gen-coloring-chalk`,
  `gen-coloring-fills`, `gen-coloring-fills-dark`, `gen-coloring-thumbs`,
  `gen-coloring-book-proof-sheet`, `png-to-webp`). See `tools/asset-gen/docs/README.md` +
  `tools/asset-gen/CLAUDE.md`. The **coloring-page pipeline** (pen/chalk outlines → fills → punch,
  gates, per-category runbook) lives in `tools/asset-gen/docs/pipeline.md` — read it before
  generating more.
* `scripts/audit-burndown/` is the scripted bulk burndown of `docs/AUDIT.md` (the runner-specific
  `burn-down-audits` skill — read the one for the active agent before touching these). Its Claude
  package under `.claude/` and Codex package under `.agents/` are direct sources maintained
  independently; do not edit it through Ruler or sync one provider from the other. `burndown.mjs`
  drives one isolated Claude Code or Codex session per role per finding (verify → implement →
  adversarial review → fix); `agent-runner.mjs` owns native auth, invocation, session-resume, model
  defaults, and output normalization; `pop.mjs` is the **only** thing that reads or edits
  `docs/AUDIT.md` at that scale; `lib.mjs` holds the shared state helpers, which deliberately return
  status instead of exiting. `prompts/*.md` are runner-neutral role prompts. Entry points are the
  `audit:*` npm scripts. A run is a `createBurndownRun({ config, effects })` instance — the counters
  it shares (`done`/`dropped`/`deferred`/`consecutive`/`sincePush`) live there, each lifecycle step
  is a named helper, and `effects` is the git/shell/agent-runner/log/halt surface the tests
  substitute; `readConfig(env)` resolves the knobs and `main()` runs only under `isMain`, so
  importing the driver starts nothing. The backlog surgery, the runner seam, and the driver's own
  sequencing are locked by `scripts/tests/audit-burndown-*.test.mjs` (`npm run test:scripts`, in
  CI).
* `direct-provider-skills.mjs` declares the provider packages and notes that are edited in place.
  `ruler-apply.mjs` snapshots and restores those paths around Ruler's atomic skill-tree replacement,
  including on failure. `apply-ruler-skill-forks.mjs` then replaces complete generated packages for
  any Ruler-managed exceptional skills. The focused `scripts/tests/ruler-*.test.mjs` files lock both
  seams.
* The app-driving `gen:*` generators that stay here — `gen:shots` (`store-shots.mjs`) and
  `gen:large-image` (`gen-large-image.mjs`) — drive the live app by selector through
  `scripts/lib/app-driver.mjs` and only run on demand, so that module rots silently when app markup,
  element IDs, or show/hide mechanics change (drawer, palette, dialogs). `test:driver:smoke` (in the
  CI test job) boots the app and exercises the driver's entry path to catch that — after such a
  change, run it, and remember the driver has bitten twice before (a dropped `sleep` import;
  `expandDrawer` broke when the drawer's buttons became always-in-DOM, so its probe checks
  visibility, not presence).
