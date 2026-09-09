# Critique rounds

Each round: three independent reviewers with different lenses, briefed to break the draft rather
than approve it. The lenses were a performance engineer at another company walking up to the package
cold; the engineer who ran Splotch's 2026 campaigns, checking the draft against the real code line
by line; and a principal engineer reviewing the extraction against the repo's decision records.
Findings are summarised by theme with what changed; declined findings carry the reason.

## Round 1 — 97 findings across three reviews

### Structural findings that changed the surface

* **The split-capture channel has no script channel** (operator). Procedure postconditions and the
  between-pass eraser prime cannot be "evaluated by the harness"; the page polls a plan and posts
  back. `MeasurementChannel` became a union of `scripted` and `plan-polled`; a `PrimeProcedure` with
  apply, verify-only, settle, repair-and-record and a between-pass acknowledgement replaced a
  boolean; postconditions are evaluated in the channel that ran the steps.
* **`evidence: Record<string, unknown>` was where the semantics lived** (architecture). Evidence,
  summaries and reports are now typed per scenario kind, so the package's standard acceptance rules
  and Splotch's read the same fields with no casts.
* **The procedure vocabulary could not compile the real flows** (architecture, outsider).
  `retryUntil` gained `checkFirst`, a settle and a timeout, matching the menu-dismiss bug the live
  bootstrap records; `ifPresent` joined `ifVisible` because the compact-shell branch tests presence;
  `tap` declares what happens on an untrusted channel; `evaluate` takes a branded `PageFunction`,
  says whether it awaits, and records into the procedure result rather than a window global;
  `press`, `type`, `hover`, `wheel`, `drag` and `nth` were added.
* **Single-pointer, typeless gesture plans** (outsider). Plans are now per-source `PointerSequence`s
  with a pointer type and optional pressure; transports declare `maxPointers`.
* **Required hooks were Splotch's engine** (outsider). `committedMode` moved into the tools contract
  and is required only when tools are declared; draw and commit attribution became optional;
  `resting` accepts a quiet window for apps that never fully rest.
* **A closed refresh-regime type** (outsider). The set is open; the app declares its bands and the
  package ships a default table.
* **Orientation was a first-class axis while theme was a dimension** (architecture, outsider).
  Orientation is a dimension with a transport-owned setter and lock release; the second guard and
  every first-class orientation field were deleted.
* **Literal types were declared and never consumed** (architecture). `defineScenario` takes the app;
  control, tool and dimension names are checked; target ids, ledger statuses and refusal codes are
  closed unions; the Splotch example's `Record<string, string>` with `!` is gone.
* **Calibration leaked into the package as defaults** (architecture). The two fidelity constants and
  the transport's "calibrated" claim were removed; expectations split into universal and per-runtime
  checks with a basis and a negative control; `calibrate` was added and refuses to propose without a
  control; the verdict keeps the legacy field names the corpus already carries.
* **The scoring inputs did not match the corpus** (architecture, operator). `InputSummary`,
  `ActionSample`, `PhaseSummary` and the fidelity verdict now carry the shipped field names; the
  drawing gate reads paint latency and in-contact starvation; the regime verdict distinguishes
  matched from scoreable and is four-way.
* **Acceptance order and ledger vocabulary were wrong** (operator, architecture). The standard rules
  follow the runner's order (repeats before plan; prime failure names anomalous or shortfall); the
  ledger status set is closed with an exit-code column; `uncalibrated-runtime` spends an attempt and
  is terminal until the campaign's fidelity table changes.
* **Exit codes contradicted each other across four files** (outsider, architecture). One `EXIT`
  constant; guards run before measurement and exit 2, verdicts after and exit 1; the four ledger
  states are glossed once in `guards.md`.
* **No cancellation, observation or effects seam** (architecture). `signal`, `onEvent`, named
  timeouts and injected effects are on the request.
* **The surface was too large, and three kinds were Splotch code in strings** (architecture).
  `EngineScenario`, `CustomScenario` and `MountScenario` were cut, the engine family became three
  Splotch scripts over `openChannel`, `renderMatrix` and `stalenessOutcome` went back to Splotch,
  and the package has three entry points.
* **No compatibility contract across the seam** (architecture). `COMPAT` names the artifact schema,
  probe row schemas, frame-stamp epoch, scoring epoch and protocol token, with the policy in the
  README; the nested rung is the first implemented step so the policy is moot until a second
  consumer exists.
* **Dependencies were undeclared** (architecture). `package.json` names `ws` as the one dependency,
  `playwright-core` as an optional peer with a version drift guard, host tools as `doctor`
  discoveries, and the install-script posture under ADR-0119.

### Findings that changed the Splotch side

* Fifteen action groups with stable ids and template labels, so `--actions=` focuses by group and
  allowances key on ids; allowance values copied from the shipped ledgers with their ADRs; the
  rotation first-frame rule carries the desktop engine; the compact-shell label spelled as the
  scorer expects.
* One Settings selector, the first-show scenario routed through controls.
* The desktop frames path declared as `probe-synthetic` input; desktop campaign variants carry their
  viewport pair.
* Native build and install commands on the native contract, so `perf:android` and the bundled
  captures are endpoints rather than exceptions.
* A legacy-artifact upgrader owned by Splotch, since the package refuses unknown schemas.
* The reference cell declares which items must be queued and rides the first variant; per-cell
  instrument files; the campaign carries the fidelity table.

### Declined, with reasons

* **Type the `evaluate` body's arguments and result** (architecture). The compiler cannot check a
  string; the phantom types document intent and the source is fingerprinted. Declined beyond that.
* **Drop `first-show`** (architecture). It has one caller, but no other shape expresses a first
  presentation against a reopen, and routed through controls it names no selector. Kept.
* **Network mocks and fixtures inside the package** (outsider). A fixture is a `page.prepare`
  procedure or a build seam; the package stays out of the app's data. `path` accepts a fixture
  argument; nothing more.
* **Shadow-root-piercing selectors** (outsider). Semantics are the lowest common denominator on
  purpose so a procedure means one thing on three channels; an app with a shadow-DOM toolbar exposes
  a hook. Documented in `procedure.d.ts`.
* **A registration path for transports** (architecture). Declared out of scope for v1; the driver
  interfaces are marked internal.
* **Removing the desktop `evidenceRole` distinction** (operator). The matrix's five fidelity labels
  are Splotch's to render; the package keeps gated versus advisory and the app maps the rest.

## Round 2 — verification pass, 40 findings

The same three lenses re-read the revised draft against their round-one reports and the real code.
The outsider marked 19 of 30 resolved, the operator 22 of 35, the architecture reviewer 23 of 32; no
round-one blocker survived in the types. What round two found was the half-wired seams the rewrite
left, and two transcription errors against the shipped code.

### What changed

* **The artifact is a discriminated union** (architecture). `CaptureArtifactOf<K>` with a top-level
  `kind`, `CaptureArtifact` as the mapped union, a flat `AcceptanceRule` and a `ruleFor` narrower;
  narrowing the kind narrows the report, evidence and summaries with it.
* **The scoring pipeline composes** (architecture, outsider). Samples and summaries carry the action
  id; `summariseActions` takes the resolved plan and the gate, and `firstFrameNaFor` and
  `allowancesFor` are exported so a corpus test and a doc guard derive the callback from the same
  data. The summary shapes are transcribed from the shipped scorers rather than paraphrased.
* **The Splotch fidelity table was wrong on two runtimes** (operator, blocker). Both iOS runtimes
  are hand-calibrated for pressure and contact geometry; desktop is uncalibrated. Transcribed from
  `RUNTIME_EXPECTATIONS`, with the drift test moved to migration phase 0.
* **Action ids are one per measured direction** (operator). `theme.to-dark`, `theme.to-light`, the
  compact enable and disable, and the rotation directions are separate ids inside a
  `SequenceAction`, so an allowance for one direction cannot loosen the other; the group order is
  the shipped order and `idle` is always emitted first; per-section rows and the compact-shell
  variants enumerate from context.
* **Dimension values have literal types** (architecture, outsider). `DimensionSelection<A>` and
  `DimensionValueOf` flow from the contract into options, variants and requirements.
* **Orientation is a transport capability** (architecture). `Dimension.set.via: 'transport'` names a
  capability; `ExternalAction` names a dimension; the driver reads and sets capabilities; the page
  geometry no longer carries an orientation of its own. The app's rotation lock is a
  read-release-restore triple whose release result feeds the restore, so an unlocked device is never
  locked on the way out.
* **Scenario steps reference controls** (architecture). `ScenarioStep<A>` targets are control names
  or a selector with a required reason; the second Settings spelling inside the draft is gone.
* **The plan-poll protocol is typed** (architecture). `PlanPatch`, `PrimeEntry` (the fields the
  fail-closed refill validator reads) and `PlanPolledReport<K>`; `TrustEntry.evaluatedBy` says
  whether the host or the page evaluated a guard.
* **Regimes reach the verdict** (outsider). Bands are declared on the app contract and threaded into
  the capture; `RegimeIdOf` derives the id union from the bands.
* **Verdicts can be tolerated by name** (outsider); `host-quiet` samples across the window and is a
  witness unless asked to gate; exit-2 refusals have a ledger status.
* **Literal-only fields are gone** (outsider, architecture). `retryUntil` always checks first; the
  prime protocol's fixed behaviours are documented, not declared.
* **The label template mini-language is gone** (architecture). A label is a string or a function of
  context, resolved once by `resolveActionPlan`.
* **The three entry points are real** (outsider, architecture). The root re-exports neither the
  campaign nor the rig; `HostOptions` lives in `capture.d.ts` and `RigDefinition` extends it; the
  WebDriverAgent signing inputs are host options, not app contract.
* **`package.json`**: no dependencies (the WebKit Inspector client uses the global `WebSocket`),
  `playwright-core` pinned to the root's range with a drift guard, no `allowBuilds` claim.
* **Migration proofs are producible**: the probe phase proves selector assertions and a happy-dom
  execution rather than a byte diff; the resume phase reads the legacy ledger through
  `LEGACY_LEDGER_STATUS`; the corpus tests keep their bodies through a thin binding at the old
  `input-fidelity` path; the golden ledger carries its scoring epoch.
* Leftovers: `perf-android-web` in `HARNESS_QUERY_PARAMS`, `pageIdentity` spelled `proven-by-*` as
  the runners write it, `RepeatedActionSample.startedAt`, the theme close wait at the bootstrap's
  budget, `RegimeMixture` transcribed and nullable, `ProbeConfig.tool` documented as a label,
  `doctor` declared as a library call, the operator steps declared, the iOS branches restored in the
  split scripts, `--max-attempts`, `--no-throttle` on the mount capture.

### Declined, with reasons

* **Keep the shipped ledger status names verbatim** (operator). `runtime-mismatch`, `verdict-absent`
  and `prime-failed` name what happened where the shipped ledger folds three causes into two
  statuses; `LEGACY_LEDGER_STATUS` maps a pre-extraction ledger on read, which is what the resume
  proof exercises.
* **Cut `first-show`** (architecture, restated). Kept; routed through controls it names no selector
  and no other shape expresses a first presentation against a reopen.
* **Fold `perf:campaign:sources` into the package** (operator). The fold's completeness and
  build-binding rules are the matrix manifest's; the script stays Splotch's and composes `shellOf`
  and the standard rules.

## Round 3 — what remains open

The round-three draft is what this folder holds. Three things are known to be unverified and are the
first work of the implementation: the bootstrap compiler's fidelity to the seventeen-step sequence
is asserted by a test that does not exist yet (migration phase 1 names it); the rendered probe's
equivalence to the committed probe is a claim until phase 2 executes it; and the legacy upgrader is
a signature. The reviews' remaining nits (a scoring-epoch reader in the golden ledger,
`ACTIONS_PROBE_SCHEMA` deriving `COMPAT.frameStampEpoch`, the vocabulary of `Control.activation`
versus the recorded `Activation`) are recorded here rather than left implicit.

## Round 4 — the PR review, 25 findings

The first review posted on the pull request read all forty files against the shipped code with
compiler probes, happy-dom evaluations of the draft's expressions, and the scorers re-run over the
tracked corpus. Twenty-three findings were blocking and every one held against the code; the two
suggestions were taken too.

### What changed

* **The action sweep is transcribed, not summarised** (blocking, seven findings). Group membership
  is separate from position: `ActionsScenario.sequence` is a list of blocks, so Settings opens once,
  its sections, theme and controls are measured inside it, and it closes once, in the order
  `runActionSweep` runs. Every preparation between samples is a step in the data: the drawer state,
  the brush menu reopened before each selection, the trusted stroke before screenshot, undo, clear
  and rotation, the parental gate closed after Parent Center, dialogs closed before Settings.
  Toggles are a measured kind with a baseline and both directions (`${id}.enable` / `${id}.disable`
  by the resulting state), so a light baseline in the compact shell measures enable then disable;
  the sectioned theme round trip always prepares dark and measures to-light then to-dark. The
  coloring scroll is a measured `scroll` action before page selection with its not-applicable
  condition. Rotation keeps desktop (the Playwright client swaps the viewport) and both with-ink
  legs. Settings rows bind to their real section ids through a control family whose readiness
  follows the observed shell variant; the Parent Center row is a member, not a separate control with
  an id the app does not have. Wrapping composes setup and teardown rather than overwriting them.
* **Transcription errors against the shipped code** (blocking). The drawer state reads attribute
  presence, as `toggleAttribute` writes it. The first-frame exemption matches `rotation.empty.*` and
  `rotation.with-ink.*` only; the clicks after a rotation stay gated. The fixed-geometry generator
  is copied constant for constant and produces identical actions to `trustedGestureActions` on the
  same bounds. First-show waits for each shell's presented content, not the open flag.
* **The rotation lock keeps its orientation** (blocking). `LockState` is `platform-owned` or
  `{ locked: value | null }`; the read is a `Query` with preparation steps that put the lock
  controls on the page before it is answered; release and restore re-select the orientation the lock
  held.
* **Summary and probe shapes match the corpus** (blocking). Field names were corrected by re-running
  the scorers over the tracked iPad and Android captures; a key check finds no undeclared field, and
  migration phase 3 makes it a Splotch test. The schema-2 frames report keeps `{w, h}`.
* **Page delivery is separate from shell** (blocking). ADR-0135's Android native split capture is
  `remote-preview` delivery into the packaged WebView; `packaged-origin` applies to packaged
  delivery only, build variants declare which deliveries they serve, and the nonce guard is not
  applicable to a fixed packaged URL.
* **Target ids are the registry's** (blocking). `ipad-device-web`, `android-device-native` and
  siblings survive; `shell` and `pageDelivery` carry the vocabulary the ids once tried to.
* **A refusal has an envelope** (blocking). `RefusedCapture` carries the resolved plan, the trust
  ledger and what the page reported, never a fabricated report; `CaptureResult` and `readArtifact`
  are unions on `outcome`; acceptance records `guard-refused` before any rule runs and `rescore`
  lists refusals unscored.
* **`report-integrity` is a verdict** (blocking): the mailbox and upload validation the runners
  perform (schema, nonce, page, user agent, table counts, bytes), run first, with `channelEvidence`.
* **Verdicts apply by scenario kind** (blocking). The table gained a kinds column so a beatless
  session or a first-show records the drawing verdicts as not applicable.
* **Readiness is typed** (blocking). The plan-polled channel exposes `awaitReady` and `awaitPulse`;
  `ReadinessReport` carries geometry, every dimension, the committed tool and the initial prime; the
  phase-1 proof drives bootstrap, ready, guards, dispatch, pulse, finish, report in that order.
* **Policy inputs reach both entry points** (blocking). `CaptureRequest.fidelity`, `doctor`'s
  `fidelity`, `CampaignDefinition.gates`.
* **Diagnostics are library calls** (blocking): `verifyInput`, `verifyRotation`, `probeOverhead`,
  `analyzeFrames`, `analyzeChromeTrace`, `analyzeWebInspector`, each taking the marks contract or
  the gesture plan and fidelity table as arguments.
* **Undo evidence is scoped by the cell** (blocking): a cell whose scenario repeats undo rejects
  absent or incomplete evidence.
* **The legacy alias table is a literal** (suggestion): one entry, with the exit-suffix cases the
  parser test pins.
* **The literal-type escape paths are closed** (suggestion): `ExternalAction` is distributed over
  the dimension so its setter returns that dimension's values, `ScenarioOverrides<A>` types the
  tool, and a control family's member is checked; a compiler probe with `@ts-expect-error` on each
  passes.

### The strategy critique, and what it changed

The review's strongest alternative is a function-based plugin seam around the existing procedural
runner, with typed driver operations and bundled page functions, on the grounds that one consumer
already has working control flow and a general DSL, template renderer and new evidence model
together create a second instrument whose equivalence must be proved. The draft keeps the DSL,
because the split channel has no script channel at all and the same interaction has to run through
Playwright, Appium and an injected same-origin script, and because the round-four findings are
evidence for the point rather than against it: a bare group list could not be checked against the
shipped sweep, and the transcribed data can. What the critique did change is the gate order the
migration commits to: the executable parity checks (the channel-protocol test in phase 1, the
corpus-to-type and plan-parity tests in phase 3) are the first gate, the declarations stay a draft
until they pass, and the nested rung earns its keep only by proving import isolation and unchanged
capture and resume behaviour in the same repository (phase 4's proof). The reviewer's note that CSP
does not by itself force a declarative DSL is accepted and the README's wording is corrected: CSP
means the compiled bootstrap must be deployable page code; the missing script channel is what
requires a compiler.

### What remains open

The parity tests are still tests that do not exist; they are named per phase in `migration.md`.
`ControlAction.ready` on the palette swatch cannot name the swatch that was clicked, so the
`palette.change` completion is weaker than the shipped `classList.contains('active')` on the picked
element; a per-activation `self` reference in expressions is a candidate vocabulary addition.

## Round 5 — the follow-up review, 8 findings

The second posted review checked the round-four fixes against the shipped code with the same
instruments and found seven blockers and one suggestion in their follow-through; every one held.

* **The compact theme predicate compared the fallback, not the theme** (blocking). `??` binds looser
  than `===`; the expression is parenthesised, reproduced and confirmed in happy-dom with an
  explicit override and with the system fallback.
* **`VariantOf` resolved to `never`** (blocking). The variant is a fourth parameter of `AppContract`
  carried by `defineApp`, like the tools; probes for all three declared variants pass and an
  undeclared one is an error.
* **A page-decided condition was decided at plan time** (blocking). `ControlAction.when` is decided
  when the action's turn comes; the coloring catalogue is normalised in the open-books action's
  teardown, so the book choice is read on an open dialog.
* **Measured Settings rows lost their WebDriver element click** (blocking). `ActivationRequest`
  distinguishes the native tap, the native accessibility element, the WebDriver element click and
  the in-page click, and the rows, the Settings close, the coloring book and page, the coloring
  clear and the packaged screenshot request what the shipped sweep requests; the run-wide override
  is the script click it records.
* **The lock proof read the pre-transition controls** (blocking). Release and restore prove their
  state through a retry that reopens the Appearance controls, as `waitForRotationLockState` does,
  because changing the lock can change the shell.
* **Delivery contradicted the endpoint** (blocking). Delivery follows the request's measurement
  channel (`http-upload` is remote delivery into a packaged shell; every other channel is packaged),
  with an override and a line in the dry-run plan; the per-kind map on the target is gone.
* **The nonce guard claimed proof for remote delivery** (blocking). It is not applicable to either
  fixed native URL; identity stays with the served-build and entry-module checks.
* **The parity oracle could not see preparation** (suggestion). The resolved plan lists every
  operation in order with its activation, the executed plan records how conditions resolved, and the
  phase-3 oracle is an execution trace of the shipped sweep under a fake client; the tracked labels
  remain a coverage check.

The strategy verdict stands as round four recorded it: the DSL is kept while executable equivalence
gates the adoption of each part, and this round's findings (a precedence slip, a plan-time decision,
a lost activation request) are exactly the class the trace oracle now exists to catch.
