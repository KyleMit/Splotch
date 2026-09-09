# Migration: landing the seam without breaking a script

The extraction is not one move. It is a sequence in which each step leaves every `perf:*` script
behaving identically and ends with a proof that it did. ADR-0053's escalation path applies and the
order matters: the contract lands in place, then a nested, independently installed package under
`tools/`, and only then a separate repository. The nested rung is the first implemented step because
it keeps every drift guard, corpus test and script in one commit while forcing the self-containment
a separate repo needs; versioning across the seam collapses to "same commit" until there is a second
consumer or a reason for an independent release cadence.

## Phase 0 — declare the contract in place

Write `tools/perf/app-contract.mjs` (the `AppContract` for Splotch, the shape of `splotch/app.ts`)
and repoint every module that holds a selector, hook, mark name, package id or storage key at it:
`campaign-state.mjs`, `undo-driver.mjs`, `eraser-fill.mjs`, `capture-xcuitest-screen.mjs`'s
`BRUSH_BUTTON_BY_MODE`, `app-driver.mjs`'s selector map (its missing `eraser` entry and the second
spelling of the Settings trigger are the first drift this closes), and the probe files. Nothing else
changes. Add two Splotch drift tests: every mark name and window global the contract names is a
member of `check-release-seams.mjs`'s derived token list, and every selector in the contract matches
its component.

**Proof.** `npm run test:tools` green; `perf:rescore` over the tracked corpus is a no-op diff; the
golden action-verdict ledger is unchanged.

## Phase 1 — the procedure vocabulary and the bootstrap compiler

Rewrite `page-bootstrap.mjs` as a compiler over the contract: the seventeen-step sequence stays, but
the tool selection, menu dismissal, theme procedure and eraser prime become `Procedure`,
`ParameterisedProcedure` and `PrimeProcedure` data, and the between-pass prime becomes the plan-poll
handshake the `plan-polled` channel type declares. The Appium and Playwright paths compile the same
data. `bootstrap-theme.test.mjs`, which executes the generated script in happy-dom, becomes the
compiler's test, and the semantics the reviews pinned (`retryUntil` tests before its first body run,
presence versus layout, the twenty-second theme budget, verify-only priming after the settle) are
asserted there.

**Proof.** The executed-in-happy-dom tests pass. A channel-protocol test drives the compiled
bootstrap against a fake plan-polled channel and asserts the order `capture-device-frames.mjs` runs
today: bootstrap, `awaitReady` (with the one relaunch when nothing reports), the host's pre-input
guards over the readiness record (committed tool, resolved theme, page orientation), bounds from
`ReadinessReport.geometry`, dispatch with a prime acknowledgement between passes, `awaitPulse`,
finish, `awaitReport`; and asserts that readiness carries geometry, every dimension, the committed
tool and the initial prime entry. A physical Android split pen cell and an eraser cell each
recapture with `report` tables comparable to the previous run on the same build.

## Phase 2 — probes rendered from the contract

Ship the three probes as templates rendered from the contract, with the configuration prelude
separate so the instrument fingerprint excludes per-cell config. `real-screen.test.mjs` asserts
against the rendered source.

**Proof.** The rendered frames probe passes `real-screen.test.mjs`'s selector assertions against
`renderProbe('frames', splotch).source`; a happy-dom execution reaches `finish()` with all six
tables and `meta.schema` equal to `FRAMES_PROBE_SCHEMA.version`; `action-probe.test.mjs` runs
against the rendered actions probe.

## Phase 3 — split the three-role modules and type the evidence

`capture-xcuitest-screen.mjs` and `capture-xcuitest-actions.mjs` are entry points, plan owners and
the WebDriver client for five other runners. Move the client, context selection, native bounds and
cache eviction into the `appium` transport and `ActionDriver`; move `runActionSweep` into a runner
over a resolved `ActionsScenario` plan; leave the two entry points thin. Split `campaign-plan.mjs`
into the target registry (Splotch), the plan expander (package) and the artifact-field readers
(typed evidence read by `STANDARD_ACCEPTANCE`). Write `splotch/legacy-artifacts.ts`'s upgrader for
the readers that need a v1 envelope, and keep a thin binding at `tools/perf/lib/input-fidelity.mjs`
that closes over Splotch's expectations so the one- and two-argument calls the corpus tests make
keep their meaning. The golden action-verdict ledger gains a `scoringEpoch` header.

**Proof.** `xcuitest-actions.test.mjs` and `campaign-plan.test.mjs` pass; `perf:campaign --dry-run`
prints an identical queue for every target, under the same target ids and artifact paths; a
corpus-to-type test re-runs `summariseFrames` and `summariseActions` over every tracked capture
under `perf-profiles/evidence` and fails on any key the declarations do not name (the transcription
check the reviews ran by hand); the resolved action plan for each shell and both starting
orientations is compared, sample by sample including preparation steps, against the recorded
`applicableLabels` of the tracked sweeps; `input-fidelity.test.mjs` and
`action-frame-stamps.test.mjs` pass with their bodies unchanged and their imports pointing at the
binding; the golden ledger's epoch equals `COMPAT.scoringEpoch`.

## Phase 4 — the nested package

Create `tools/perf-rig/` with its own `package.json` and lockfile, not a workspace member, its
`node_modules` off Capacitor's resolution path. Move the "moves" and the generic halves of the
"splits" from `boundary.md` into it, vendoring the eleven `tools/lib` functions with a drift-guard
test naming the extraction as the reason for the copy. `tools/perf` imports it by relative path or a
`link:` dependency registered explicitly under `allowBuilds`. Extend
`tool-specifier-resolution.test.mjs` to refuse the package importing `tools/lib` or `web/src`, add
`tools/perf-rig/**` to knip's project globs and the tools vitest include depth, and add a drift
guard that the package's `playwright-core` resolves to the same version as the root
`@playwright/test`. Every `perf:*` script name is unchanged.

**Proof.** `perf:campaign` for one physical target end to end; a resume against a pre-extraction
ledger, read through `LEGACY_LEDGER_STATUS`, run with `acceptInstrumentChange` and banking every
previously valid cell as `instrument-change-accepted` with zero recaptures; `cap sync` leaves
`android/capacitor.settings.gradle` and the SPM manifest byte-identical; `npm run lint:dead`,
`format:check` and `test:tools` green.

## Phase 5 — the separate repo

Publish from its own repository when there is a second consumer or an independent release cadence;
`tools/perf` consumes it as an exact-pinned `devDependencies` entry (ADR-0070; Netlify skips it
under `--prod`). The `COMPAT` policy applies from this point: schema or row change is a major, a new
guard or status is a minor, a scoring change bumps `scoringEpoch` and regenerates the golden ledgers
in the same Splotch change. Confirm `netlify.toml`'s ignore rule does not trigger a rebuild on the
lockfile change.

## What stays in `tools/perf` at the end

The app contract; targets, gates and fidelity expectations; the scenario definitions; the campaign
definition and its acceptance rules; the matrix model, renderer and manifest fold; the staleness
checker; the tracked evidence corpus, the legacy upgrader and every test calibrated against the
corpus; the three engine scripts, `engine-gates.js`, `first-stroke-experiments.js`, the crayon proof
sheet and the appearance screenshot tool; the forty npm scripts, each a few lines.

## Risks named up front

* **The release-seam guard derives its forbidden tokens from the app's own source files.** Mark
  emission stays inline in the app; the contract only names the marks, and the phase 0 drift test
  holds the two together.
* **The corpus is the hard boundary.** Every calibration-bearing number stays Splotch-side; the
  package ships no fidelity default, because ADR-0139 rejected fixtures that go stale against a
  runtime.
* **The blast radius of the last tools move was about 370 files**, mostly paths in workflows, hooks,
  allowlists and generated instruction trees. Phases 0 to 3 move no files; phase 4 moves them once.
* **This extraction is not rename-only.** The bootstrap becomes compiled output, the probes become
  rendered templates and the ledger vocabulary closes. ADR-0111's one-capability-per-PR discipline
  applies per phase, each with the proof above.
