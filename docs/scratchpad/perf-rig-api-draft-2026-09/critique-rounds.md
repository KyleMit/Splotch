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

## Round 2 — verification pass

The second round asked the same three lenses to verify the round-one fixes against the revised draft
and the real code, and to find what the fixes broke. Its findings and the changes they produced are
recorded below.
