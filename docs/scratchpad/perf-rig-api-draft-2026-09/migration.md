# Migration: landing the seam without breaking a script

The extraction is not one move. It is a sequence in which each step leaves every `perf:*` script
behaving identically and ends with a proof that it did. ADR-0053's escalation path applies: an
in-repo folder becomes a nested, independently installed package, and only then a separate repo.

## Phase 0 — declare the contract in place

Write `tools/perf/app-contract.mjs` (the `AppContract` for Splotch) and repoint every module that
holds a selector, hook, mark name, package id or storage key at it: `campaign-state.mjs`,
`undo-driver.mjs`, `eraser-fill.mjs`, `capture-xcuitest-screen.mjs`'s `BRUSH_BUTTON_BY_MODE`,
`app-driver.mjs`'s selector map (its missing `eraser` entry is the first drift this closes), and the
probe templates. Nothing else changes. The existing drift-guard tests keep pointing at components;
they now also pin the contract.

**Proof.** `npm run test:tools` green; a physical iPad drawing cell and an Android split cell
recapture byte-identical `report` tables against the previous run on the same build.

## Phase 1 — the procedure vocabulary and the bootstrap compiler

Rewrite `page-bootstrap.mjs` as a compiler over the contract: the seventeen-step sequence stays, but
every selector, hook, and setup procedure it embeds is read from the contract's declared procedures.
The theme procedure, the mode selection, the menu dismissal and the eraser prime become `Procedure`
data in the contract; the Appium and Playwright paths compile the same data.
`bootstrap-theme.test.mjs` (which executes the generated script in happy-dom) becomes the compiler's
test.

**Proof.** The rendered bootstrap for Splotch is byte-comparable to the hand-written one except for
declared substitutions; the executed-in-happy-dom tests pass unchanged.

## Phase 2 — split the three-role modules

`capture-xcuitest-screen.mjs` and `capture-xcuitest-actions.mjs` are entry points, plan owners and
the Appium client for five other runners. Move the client, the context selection, the native bounds
and the cache eviction into `tools/perf/lib/appium-client.mjs`; move `runActionSweep` into a runner
over a declared `ActionsScenario`; leave the two entry points thin. `campaign-plan.mjs` splits into
the target registry (Splotch), the plan expander (generic), and the artifact-field readers (Splotch
acceptance rules).

**Proof.** `xcuitest-actions.test.mjs` and `campaign-plan.test.mjs` pass; `perf:campaign --dry-run`
prints an identical queue for every target.

## Phase 3 — the nested package

Create `tools/perf-rig/` with its own `package.json` and lockfile, not a workspace member, its
`node_modules` off Capacitor's resolution path (ADR-0053's middle rung). Move the "moves" and the
generic halves of the "splits" from `boundary.md` into it, vendoring the eleven `tools/lib`
functions. `tools/perf` imports it by relative path. Every `perf:*` script name is unchanged.

**Proof.** `perf:campaign` for one physical target end to end; `perf:rescore` over the tracked
corpus reproduces every committed verdict (`action-frame-stamps.test.mjs`'s golden ledger and
`matrix-fidelity-rederivation.test.mjs` are the byte-identity checks).

## Phase 4 — the separate repo

Publish the nested package from its own repository; `tools/perf` consumes it as a pinned
`devDependencies` entry (ADR-0070; Netlify skips it under `--prod`). Add the drift guard that holds
the pinned version against the artifact schema and probe-host protocol the Splotch tests were
written for. Register any transitive install script in `allowBuilds` (ADR-0119).

**Proof.** The same recaptures as phase 3, plus `npm run lint:dead` and `format:check` green with
the dependency in place, and `netlify.toml`'s ignore rule confirmed not to trigger a rebuild on the
lockfile change.

## What stays in `tools/perf` at the end

The app contract; targets, gates and fidelity expectations; the scenario definitions; the campaign
definition and its acceptance rules; the matrix model and manifest fold; the staleness surface; the
tracked evidence corpus and every test calibrated against it; `engine-gates.js`,
`first-stroke-experiments.js`, the crayon proof sheet and the appearance screenshot tool; the forty
npm scripts, each a few lines.

## Risks named up front

* **The release-seam guard derives its forbidden tokens from the app's own source files.** Moving
  mark emission behind a package helper would silently drop tokens from that guard. The contract
  declares mark names; the app keeps emitting them inline.
* **Two spellings of the Settings control** (`#settingsButton` in app-driver, the aria-label in
  campaign-state) collapse into one contract entry in phase 0, which is a behaviour change for
  whichever tool was reading the other.
* **The corpus is the hard boundary.** Every calibration-bearing number stays Splotch-side and every
  test that reads `perf-profiles/evidence` or `scrapbook/performance` stays; the package ships no
  synthetic corpus, because ADR-0139 rejected fixtures that go stale against a runtime.
* **The blast radius of the last tools move was ~370 files**, mostly paths encoded in workflows,
  hooks, allowlists and generated instruction trees. Phases 0–2 move no files; phase 3 moves them
  once.
