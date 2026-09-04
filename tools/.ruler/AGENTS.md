# tools/ — repo automation

> This directory's `CLAUDE.md` and `AGENTS.md` are generated from the `.ruler/AGENTS.md` beside them
> — edit that source, then run `npm run ruler:apply` at the repo root (ADR-0058).

`tools/` is the single home for Splotch-owned repository automation — one tree for both a one-file
Node task and a full pipeline with its own docs, fixtures, and CLIs (ADR-0108). The root
`package.json` plus `npm run info` stays the public invocation catalog (ADR-0019); reach for a `node
tools/...` path only when no npm command covers what you need.

## Where a new tool goes (ADRs 0108 and 0111)

* A capability with one executable and no support files starts **flat**:
  `tools/<verb-object[-qualifier]>.mjs`. A unit test alone does not force a folder — it can live in
  `tools/tests/`.
* It earns `tools/<capability>/` as soon as it owns **multiple entry points** or domain files
  (helpers, fixtures, prompts, docs, samples, outputs).
* A runnable file uses `verb-object[-qualifier].mjs`; the capability folders already supply its
  domain. Keep enough meaning in the leaf for search results and stack frames, but do not repeat the
  capability mechanically. Use `tools/mobile/android/setup-emulator.mjs`, not
  `tools/android/android-setup.mjs` or an ambiguous `index.mjs`.
* A supporting module uses a purpose noun, adding a capability qualifier when a generic leaf would
  be ambiguous. Do not use generic `toolchain.mjs`, `config.mjs`, `utils`, `misc`, or `helpers`
  leaves.
* Executables do not belong in a `bin/` directory. They live at the capability root or within a
  named sub-capability.
* Fold by a user-recognizable capability or an existing npm namespace. Do not create `checks/`,
  `generators/`, or `assets/` grab bags — a shared filename prefix is not a shared domain.
* Do not absorb path-owned code just because it is a script: `.ruler/skills/**`, `.claude/**`,
  `.agents/**`, `.github/scripts/**`, framework configs, Fastlane, and native build wrappers stay
  where their owning system looks for them.
* No npm workspaces and no per-tool `package.json` (ADR-0119). `tools/asset-gen/package.json` stays
  the documented dependency-free local-alias exception.
* Tests follow the same shape: a flat tool's test goes in `tools/tests/`, a capability's tests in
  `tools/<capability>/tests/`. `tools/vitest.config.mjs` discovers both (`npm run test:tools`);
  `asset-gen` and `store-drawings` are excluded because they keep their own named suites. A
  capability that introduces sub-capability tests must extend Vitest's include glob to the new
  depth; nested tests otherwise disappear from collection without an error.
* A new capability folder must be added to the `project` list in `knip.json`, which enumerates them
  (knip cannot re-include a path under a negated glob, so a blanket `tools/**` plus exclusions is
  not an option). You do not have to remember: `tools/tests/enumerated-build-paths.test.mjs` fails
  on the omission, and also pins the Netlify deploy filter's `:(glob)` pathspec and its coverage of
  everything the production build runs. Its `entry` glob `tools/*/*.mjs` covers capability-root
  executables only. A capability that adds runnable sub-capabilities must add explicit entry globs
  for those exact roots, such as `tools/mobile/{android,ios}/*.mjs`; do not use a generic
  `tools/*/*/*.mjs` glob that would promote support modules to public entries. `tools/lib/` and
  nested capability libraries are deliberately excluded from `entry` so `lint:dead` still flags dead
  shared code; they stay reachable through their importers.
* Every capability and meaningful sub-capability must have a `README.md` covering purpose, entry
  points, inputs and outputs, prerequisites, failure behavior, domain ownership, and maintenance
  guidance. Structural folders such as `lib`, `tests`, `fixtures`, `assets`, `prompts`, `generated`,
  `inputs`, `samples`, and `probes` are documented by their nearest capability README unless they
  carry an independent runbook.

ADR-0111's layout is being adopted capability by capability in the migration tracked by issue 975;
until that stack is complete, parts of the tree still follow the earlier names and folder shapes.

Runnable verbs describe behavior rather than forming a closed vocabulary: `check` validates without
writing; `gen` creates an artifact; `update` intentionally replaces a committed baseline; `capture`
records evidence; `analyze` reads evidence; `run` orchestrates; and `start`, `stop`, `serve`,
`open`, or `show` manage lifecycle and presentation. Precise domain verbs remain valid. `audit`
names the `audit-burndown` capability and `audit:*` npm namespace, not an executable action.

Existing multi-mode executables stay intact and are named for their primary action. Naming does not
justify splitting an implementation. Internal output identifiers and directories are behavior, not
organization, and are unchanged by a file move.

## Libraries: one shared, many owned

`tools/lib/` is the **dependency foundation** — it must never import from a capability folder. A
module belongs there only when independent capabilities consume it and no narrower domain owns it:
`proc.mjs` (the common process/CLI helpers — `run`/`capture`/`fail`, `sh()` for a rejecting
shell-based command runner, env and arg handling, the OS opener), `net.mjs` (`waitForUrl()` polls a
URL until ready), `playwright.mjs` (resolves the Chromium binary), `vite-server.mjs` (spawns a
throwaway vite dev/preview server in a detached process group so `stop()` can't orphan the vite
grandchild, while `release()` hands that group to the OS instead — which is why it takes only the
`RELEASABLE_STDIO` sinks it exports and throws on anything this process would take with it),
`html.mjs` (escaping/render primitives for the report producers), `smoke.mjs` (the
`check()`/`fatal()`/`summarize()` pass-fail reporter), and `coloring-book-assets.mjs`.

Everything else lives in the `lib/` of the capability that owns it, and another tool may import it
across the boundary — cross-tool reuse is not a reason to erase ownership into `tools/lib/`:
`tools/mobile/android/lib/android-toolchain.mjs` resolves the SDK and AVD locations per platform
(override the SDK with `ANDROID_HOME` or `ANDROID_SDK_ROOT`); `tools/mobile/lib/maestro.mjs` owns
the Maestro location, and `tools/mobile/lib/static-export.mjs` owns what the native static export
drops — the web-only static file list plus the head-tag rewrite that keeps `strip-static-assets.mjs`
from leaving a tag pointing at a file it deleted; `tools/release/lib/release-frontmatter.mjs` the
release frontmatter/semver parsing; `tools/api-smoke/lib/admin-client.mjs` the `/api/admin` login +
token-CRUD request plumbing; `tools/app-driver/lib/app-driver.mjs` the browser gesture/selector API.

Check both before writing new glue. A new helper joins the purpose-named module that owns its
concern (or gets a new purpose-named file) — never a `utils`/`misc`/`helpers` grab-bag.

Moving a tool between depths is the operation that breaks this tree quietly: a stale `vi.mock()`
path mocks nothing without erroring, and a repo-root walk with the wrong number of `..` still
resolves — just somewhere else. `tools/tests/tool-specifier-resolution.test.mjs` fails on either,
and on a `tools/lib/` module that reaches back into a capability folder.

## Writing a tool

* Every script must run on macOS and Linux (ADR-0017) — the project dropped Windows dev support
  (ADR-0062). Keep them plain Node `.mjs` for consistency, and put the macOS-vs-Linux differences
  that remain (SDK paths, `open` vs `xdg-open`) behind a branch in `tools/lib/` rather than
  scattering them. Scripts bound to one platform by nature (`run-simulator-smoke-test.mjs` needs
  Xcode) must fail fast with a clear message elsewhere.
* Every CLI script gates execution behind `isMain(import.meta.url)` (`tools/lib/proc.mjs`) and
  exports a distinctly named entry function.
* Script options are flags via `parseArgs`; an env var is at most a documented fallback.
* Multi-item CLI runs: validate inputs up front with a path-specific one-line error and a non-zero
  exit; wrap per-item work in try/catch and report failures at the end without discarding completed
  results; never overwrite a baseline/output artifact from a run that had errors; name polling
  budgets.
* TypeScript-flavored scripts run via `node --experimental-strip-types` (see the
  `check:coloring-assets` npm script).
* Env vars in npm scripts are set inline (`VAR=value cmd`) — no `cross-env`, since scripts run only
  on macOS/Linux.
* **The AI/`sharp` asset-generation pipeline moved to `tools/asset-gen/`**
  (`tools/asset-gen/docs/architecture.md`): the AI style covers, light/dark coloring-page fills,
  thumbnails, and format/line-art utilities (`gen-style-covers`, `gen-coloring-chalk`,
  `gen-light-fills`, `gen-night-fills`, `gen-thumbnails`, `gen-book-proof-sheet`,
  `convert-png-to-webp`). See `tools/asset-gen/README.md` + `tools/asset-gen/CLAUDE.md`. The
  **coloring-page pipeline** (pen/chalk outlines → fills → punch, gates, per-category runbook) lives
  in `tools/asset-gen/docs/pipeline.md` — read it before generating more.
* `tools/audit-burndown/` is the scripted bulk burndown of `docs/AUDIT.md` (the runner-specific
  `burn-down-audits` skill — read the one for the active agent before touching these). Its Claude
  package under `.claude/` and Codex package under `.agents/` are direct sources maintained
  independently; do not edit it through Ruler or sync one provider from the other.
  `run-burndown.mjs` drives one isolated Claude Code or Codex session per role per finding (verify →
  implement → adversarial review → fix); `lib/agent-runner.mjs` owns native auth, invocation,
  session-resume, model defaults, and output normalization; `pop-finding.mjs` is the **only** thing
  that reads or edits `docs/AUDIT.md` at that scale; `lib/burndown-core.mjs` holds the shared state
  helpers, which deliberately return status instead of exiting. `prompts/*.md` are runner-neutral
  role prompts. Entry points are the `audit:*` npm scripts. A run is a `createBurndownRun({ config,
  effects })` instance — the counters it shares
  (`done`/`dropped`/`deferred`/`consecutive`/`sincePush`) live there, each lifecycle step is a named
  helper, and `effects` is the whole outside-world surface the tests substitute — git, shell, the
  binary probe, the agent runner, the log, and `halt` — so both `preflight()` and `execute()` are
  drivable from a test; `readConfig(env)` resolves every knob from the supplied `env` — including
  the `launch-command` line recorded at startup and the `AUDIT_FILE` backlog path the run pops,
  deletes, stages, and counts, both of which the run reads from `config` rather than from
  `process.env`, so they cannot name different files — and `main()` runs only under `isMain`, so
  importing the driver starts nothing. The backlog surgery, the runner seam, and the driver's own
  sequencing are locked by `tools/audit-burndown/tests/*.test.mjs` (`npm run test:tools`, in CI).
* `tools/ruler/lib/direct-provider-skills.mjs` declares the provider packages and notes that are
  edited in place. `tools/ruler/apply-ruler.mjs` snapshots and restores those paths around Ruler's
  atomic skill-tree replacement, including on failure. `tools/ruler/apply-skill-forks.mjs` then
  replaces complete generated packages for any Ruler-managed exceptional skills. The focused
  `tools/ruler/tests/*.test.mjs` files lock both seams.
* `tools/check-skill-reference-syntax.mjs` (`npm run check:skill-refs`, and
  `tools/tests/skill-reference-syntax.test.mjs` in the CI tools tier) guards the other half of that
  split: a skill named with Claude Code's `/name` or Codex's `$name` outside the tree that runner
  owns. Its vocabulary is the registered skill names, so a rename needs no edit here; what it does
  carry are the deliberate exemptions — the two names that are also live app routes (`api`,
  `design`), and the runner-specific and historical paths. In a `.mjs` it matches over a copy with
  every code region blanked to spaces, because the sigil only ever means a skill inside a string or
  comment and everywhere else means a regex literal or a division. Narrowing the match instead —
  demanding whitespace before the sigil — is the tempting shortcut, and it silently drops every
  message that opens the name with punctuation instead, which is how the release tooling's
  parenthesized errors read before this change.
* The app-driving generators — `gen:store-assets` (`tools/marketing-assets/gen-store-assets.mjs`),
  `gen:promotional-image` (`tools/marketing-assets/gen-promotional-image.mjs`), and the
  evaluation/review entries at the `tools/store-drawings/` root (`evaluate-drawing-fidelity.mjs`,
  `gen-brush-review.mjs`) — drive the live app by selector through
  `tools/app-driver/lib/app-driver.mjs` and only run on demand, so that module rots silently when
  app markup, element IDs, or show/hide mechanics change (drawer, palette, dialogs).
  `test:driver:smoke` (in the CI test job) boots the app and exercises the driver's entry path to
  catch that — after such a change, run it, and remember the driver has bitten twice before (a
  dropped `sleep` import; `expandDrawer` broke when the drawer's buttons became always-in-DOM, so
  its probe checks visibility, not presence).
