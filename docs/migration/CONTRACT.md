# Migration contract

## Scope and decision status

Select the drawing product architecture across web, Android, and iOS through the Codex/Claude pair,
and replace UI and client behavior where the selected design requires it. The registered retention
outcomes may retain the current Svelte/Capacitor product; report that as retention rather than a
completed UI replacement. Deliver the complete new drawing product, hosted API contracts, and
substantive drawing fidelity. Keep the current product runnable until each target is ready. Retain
SvelteKit/Netlify for hosted APIs, admin, and informational routes unless a concrete requirement
warrants a separately reviewed change; see
[ADR-0001](../adrs/0001-sveltekit-dual-adapter-strategy.md).

### Authoritative fresh-start scope

On 2026-10-08 the maintainer gave this direct instruction:

> A fresh start is acceptable for the roughly ten beta users. Prioritize the new drawing product
> rather than legacy settings/data migration or old-app UI parity. Retain reliable new-app
> saving/exporting, permissions, lifecycle, security and release quality. Reconcile the
> authoritative contract accordingly. No framework is selected.

This scope applies to the full campaign: web browser tabs and installed PWAs, Android and iOS.
Public hosting does not create a platform exception or establish a separate non-beta audience beyond
the maintainer's stated roughly ten beta users. It replaces earlier mandatory legacy-transfer and
exact old-UI parity requirements in the migration documents. Historical source inventories, failed
attempts, accepted units and review provenance retain their original identities and claim limits.
Retirement is a scope disposition, not a passing validation result or permission to change the
shipping app before target cutover.

In the remaining rules, continuity means applicable new-app data/lifecycle reliability and native
update installability. Fidelity and visual semantics retain substantive drawing/output requirements;
they do not require copying old chrome. Matched comparisons still use equivalent required content
and workloads, and a concrete product change must be reviewed before changing their fixtures.

| Requirement                                                                                                   | Current disposition                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy settings, preferences, secure credentials, held pictures, installed packs and native admin credentials | Import and preservation are retired requirements for the fresh-start transition. No source-by-source data fixture, old WebView reader, credential hardening transaction or old held-picture import is required solely to transfer beta data.                                                                    |
| Legacy download jobs and background sessions                                                                  | Preservation and successor mapping are retired. A same-identity replacement must still stop or safely reconcile surviving work so stale callbacks, files or sessions cannot corrupt the new app or bypass its policies.                                                                                         |
| Old UI layout and flows                                                                                       | Exact sections, layout, choreography, settings choices and interaction paths are design references. The new product may choose different UI and flows without reproducing old UI parity.                                                                                                                        |
| Substantive product capabilities                                                                              | Full drawing fidelity, crayon/Magic, input, history/undo, coloring, ordering, audio and applicable full-product functions remain in the acceptance inventory. A concrete feature change needs a pair-reviewed product decision and an explicit inventory disposition; fresh start is no blanket feature waiver. |
| New-app data and services                                                                                     | Reliable saves/exports, exact failed-save recovery, permissions, secure credentials, offline behavior, lifecycle, accessibility and failure handling remain required for the selected product. Later updates protect data created by that product.                                                              |
| Hosted web/API/admin                                                                                          | Applicable startup, CSP, PWA, browser, navigation, admin and server contracts remain. Supported installed clients retain their API/CORS contracts while they depend on them.                                                                                                                                    |
| Native distribution                                                                                           | Existing app identity, signing lineage, monotonic release versions, supported floors, channel installability, privacy and release quality remain required. Same-identity updates may initialize fresh app data; clean installs alone do not prove update installability.                                        |
| Architecture and evidence                                                                                     | No framework is selected. Fair alternatives, source/toolchain security, calibrated matched comparisons, burden rules, physical final gates, independent review and exact-head release evidence remain required.                                                                                                 |

The next product milestone is an observable drawing candidate: runnable paper, real ink, controls,
undo and exported output, with exact source and claim limits. Follow it with full fidelity and
service slices, matched foundation evidence, integrated tuning and target release gates. Legacy-only
transfer work is not a prerequisite. Existing source-acceptance dependencies still apply to the
units that consume them; scope reconciliation does not accept a pending unit. Physical hardware
gates comparison and release, rather than ordinary feature construction and development builds.

### Functional development priority

The maintainer's course correction effective 2026-10-09 03:00 UTC prioritizes useful native product
construction with running feedback. The development checkpoint is an installable phone build within
48 hours, by 2026-10-11 03:00 UTC. If a phone or signing requirement prevents installation, record
the concrete blocker and provide a runnable emulator/simulator build, local demonstration and
substantial implemented source. A time target does not establish delivery or acceptance.

Build the next working feature before expanding qualification. Start with drawing, color and brush
controls, undo, clear, PNG export and basic local save/reopen. Continue through substantive
crayon/Magic, coloring, history/page operations, settings/audio and reliable services. Keep drawing,
history, UI, storage and platform responsibilities clear; resolve real needs without speculative
abstraction. Maintain a short feature inventory with exact source and observed running behavior.

Upfront validation addresses concrete build, correctness or security requirements needed for the
next feature. Use supported development workflows and already trusted inputs where practical. Name
any remaining blocker, its specific risk and shortest bounded resolution. Exhaustive source
materialization qualification, optimized builds on both OSes, complete performance instrumentation
and matched physical comparisons are not prerequisites to ordinary development. Preserve prior
attempts and their limitations; defer work that does not unblock the next running feature.

Keep the shipping app runnable and experiments isolated. Development observations do not select a
framework, pass Phase 1, authorize production ownership changes or complete the campaign. Full
fidelity, fair alternatives, applicable web/API/admin contracts, source/dependency security,
integrated tuning, physical performance gates, signing/channel updates and final independent
Codex/Claude review remain required for reviewed cutover or valid retention. Original reviewer
identities, consumed rounds and remaining budgets persist; changing the sequence grants no new
review capacity and does not reopen an exhausted unit.

### Abandoned credential security

Fresh initialization on every target must not expose or reactivate known abandoned sensitive
credentials, or indefinitely leave them under weaker protection. Name the affected credential
locations and protections, then remove/invalidate applicable abandoned entries or retain them only
behind a reviewed protection/risk disposition. Prove interrupted cleanup and late restoration cannot
expose or reactivate them; failures need a safe, explicit outcome. Keep installation allowance
identity and server authorization intact.

This is a narrow security requirement, not legacy credential transfer or data parity. It does not
reopen the old source-by-source transfer matrix, full L0 import workload or iOS reader work, and it
does not require broad deletion of isolated inert drawings or coloring-pack data. Retained inert
data alone does not establish a new secret exposure. Any additional deletion requirement needs a
concrete affected security or lifecycle boundary and a reviewed disposition.

The architecture review at ef3d1eb2070c1bd0dee620ed42a2b14201c2a9b4 reached conditional agreement:
React Native mobile plus a shared web-capable UI is the leading candidate. The mobile performance
case is changing the rendering pipeline; the web-sharing case is recurring maintenance. Neither
implies a browser performance benefit from rewriting Svelte in ordinary React DOM first.

| Option                                          | Why it remains relevant                                                                                      | Evidence needed to select or reject it                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React Native with shared web UI                 | Native UI/graphics path and direct TypeScript behavioral reuse; fits the intended shared product vocabulary. | Released runtime/dependency/floor compatibility, faithful graphics/input/audio, native upgrade bindings, and web contract feasibility.                     |
| Capacitor with native drawing                   | Preserves the existing single Svelte product UI while removing browser drawing-surface costs.                | Whether the remaining transition costs originate in drawing surfaces or in surrounding WebView UI; interaction, export, lifecycle, and bridge feasibility. |
| Flutter                                         | Integrated rendering pipeline and one product UI vocabulary.                                                 | Web host/DOM-canvas integration, floors, parity, and recurring Dart/TypeScript behavioral ownership versus RN dependency coordination.                     |
| React DOM or retained Svelte web with RN mobile | Provides a web fallback and a useful interim deployment state.                                               | Cost of two visual implementations, and whether adapters for shared web primitives actually save recurring maintenance.                                    |
| Separate Swift/Kotlin/web UIs                   | Allows independent OS-specific implementation.                                                               | A demonstrated benefit sufficient to justify three recurring UI owners and behavior synchronization.                                                       |

The current app already shares one UI. A migration can increase maintenance temporarily and can
increase it permanently if the shared web vocabulary fails. Evaluate that cost honestly. Preserve
the tuned Canvas2D web renderer where practical; the earlier appearance-changing WebGL experiment
does not rule out all native GPU drawing or all future web graphics designs
([ADR-0153](../adrs/0153-reject-webgl-crayon-renderer.md)).

## Phase 0 exit: auditable problem and parity contract

Before choosing the implementation foundation, record:

1. A per-target map of remaining problems and their causal evidence. Distinguish measured drawing
   work, UI scheduling/style/layout, image/surface allocation, rendering, and composition.
   Historical drawing timings do not characterize every current interaction. Identify which claims
   require a focused trace or experiment.
2. The applicable [product](ACCEPTANCE.md), [web](WEB-CONTRACT.md), and [upgrade](UPGRADES.md)
   requirements, with reference implementations and reproducible scenarios. Every replacement test
   is pending until it runs against the replacement. Preserve observable behavior; permit different
   rendering and state mechanics.
3. A baseline inventory per target and suite: capture date, product commit, build and instrument,
   device/OS, regime, input fidelity, scoreability, source availability, and known dispositions.
   Reuse valid evidence. Recapture stale or missing controls where needed; do not invent a
   prerequisite to recalibrate every shipping target.
4. A native measurement mapping and validation plan, including what cannot be compared directly.
   Calibrate new observables and input transports before using them for comparative conclusions.
5. Phase 1 implementation plans for the smallest checks that settle structural risk. Claude reviews
   the contract and consequential foundation plans, including alternative costs and pivot
   conditions, before foundation selection. Incremental isolated feature construction follows the
   functional development priority; routine edits do not require a separate planning review.

The [baseline inventory](BASELINE.md) records banked source/build provenance, input regimes,
dispositions, missing witnesses and section-specific age limits. Current physical controls remain
pending; an available historical source is not a capture of the campaign head.

The committed
[deployment matrix](../../scrapbook/performance/2026-07-31-deployment-target-matrix/index.md) is
banked evidence from several commits, not a benchmark of the campaign head. Native drawing and undo
already pass their banked gates; remaining discrete actions are a principal motivation. Generated
fidelity labels have lagged the runtime expectations. Per-run fidelity and refresh regime determine
drawing scoreability; actions and undo have separate scoring. Audit
[runtime expectations](../../tools/perf/lib/input-fidelity.mjs),
[scoreability](../../tools/perf/gen-performance-matrix.mjs), and
[ADR-0144](../adrs/0144-coalescing-is-a-witness-not-a-check.md), rather than treating a report chip
as proof that a target has no valid baseline.

## Phase 1 exit: selected architecture with its expensive assumptions tested

Review and run the checks below in independently reviewed units. Complete bounded shipping-app
attribution and behavior-preserving remedies before interpreting native comparisons. Functional
native construction can proceed while that evidence is pending. Diagnostic suppressions may
deliberately omit output or readiness and cannot qualify as product candidates. Costs removed in
place remain regression workloads but no longer count as architectural failure elimination. Keep
this work bounded rather than reopening an indefinite web-tuning campaign.

Candidate package topology, native drawing features and development builds can proceed while
physical controls are unavailable. Simulator/emulator checks establish mechanics and structural
feasibility. Validated observers, fresh physical controls and registered thresholds are
prerequisites for comparative timing, not for independent compilation.

Review and run bounded checks for:

* A React Native native graphics path: chosen released versions compile on both OSes; input,
  representative drawing appearance, geometry, export, native audio, and service bindings have a
  feasible ownership model. Dependency and OS-floor choices are explicit. Do not infer a floor from
  upstream `main` or make Skia's newest backend mandatory for every RN design.
* Matched mechanism checks for both React Native UI/native paper and retained Svelte UI/native
  paper: exercise the motivating action families identified by current Phase 0 controls, including
  the complete applicable drawing-screen state and declared prior journey over live paper. Record
  visible/retained content, geometry, images, layers, surfaces and views; missing workload
  invalidates timing, while legitimate topology differences remain part of the mechanism. Use
  equivalent visible state, validated observables, and preregistered thresholds. Diagnose whether
  each arm removes the attributed surface or surrounding-UI cost; compile and feature feasibility
  alone cannot select RN.
* Native drawing inside Capacitor: test the strongest mechanism by which it could remove the
  identified surface/transition cost, while retaining the Svelte UI. Compare using the same
  validated instrument where possible. A structural inability to preserve a required interaction is
  evidence; a rough prototype's untuned timing is not a final product verdict.
* A shared web vocabulary: React Native Web or React Strict DOM can satisfy prerendered startup,
  accepted pre-hydration ink, renderer ownership, CSP, themes, browser Back, accessibility, and PWA
  contracts. Assess real adapter and bundle costs. The hosted backend remains independent.
* New-app service and update feasibility: saves, secure credentials, permissions, lifecycle and
  failure recovery have real consumers; installation identity and entitlements match; stale prior
  work cannot corrupt the fresh app. Legacy-data import is not a foundation prerequisite.

Apply the same mechanism and fidelity bar to both native candidates, and allow bounded tuning before
interpreting early timing. Where fresh controls retain motivating costs, a candidate is eligible
only when its matched checks remove the motivating cost and satisfy fidelity, continuity, and
applicable web contracts. Among eligible candidates, prefer native paper inside Capacitor when its
host/input/layer glue has the lower recurring burden, unless RN demonstrates an additional mechanism
benefit that exceeds a preregistered materiality threshold and justifies the additional burden.
Select RN when it has the lower demonstrated burden or meets that exception; otherwise select the
viable hybrid. If neither candidate removes the motivating cost after its valid matched mechanism
checks and bounded tuning, enter the bounded residual-cost branch below; an unfinished candidate or
an unproved observer is not a measured failure of that candidate. Define materiality from
current-control variability, the owning action budgets, visible readiness, and the cost of the extra
ownership before seeing candidate results. For example, residual surrounding-WebView cost can
justify RN only when its matched improvement crosses that registered threshold. A failed required
contract must be repaired or the candidate yields. These checks select a foundation; the integrated,
tuned application's final performance verdict remains a later gate.

A same-backend RN/native-paper island inside Capacitor can isolate the surrounding UI's cost without
becoming the intended production hybrid. Judge recurring burden on viable production designs,
separating initial migration work, toolchain/dependency ownership, bridge/lifecycle maintenance and
runtime cost. Prototype only uncertain estimates that could change the choice. The causal island
neither proves strict burden dominance nor forces the hybrid to retain every experimental
dependency.

Before remedies or candidate comparison results, register conservative burden ranges over a common
24-month planning horizon from the foundation decision. Name recurring maintenance obligations and
their demonstrated current frequency, initial migration/validation work, a separate risk reserve and
assumptions about deployment delay. Use the same reviewed effort units and ranges for all arms,
crediting savings only after the relevant owner can actually be retired within that horizon. Record
measured facts separately from estimates; dependency counts, token counts, calendar waiting and
unsupported forecasts are not measured maintenance savings. The horizon is a decision policy, not a
measured payback forecast; use coarse engineering-effort ranges rather than fictitious precise
hours.

Mandatory burden categories are UI/behavior synchronization; dependency/toolchain/floor upkeep;
native bindings, ordering, lifecycle and upgrades; web host/security/PWA adapters; and tests,
physical evidence and release/privacy maintenance. Runtime and resource contracts remain separate
gates. A burden-only migration must remove at least one demonstrated recurring maintenance
obligation without an uncompensated regression in those categories. Its lower-bound recurring saving
must exceed the upper-bound remaining initial migration/validation effort plus the risk reserve.
Document any added obligation and its concrete compensation; no saving can compensate for a failed
mandatory product, release or continuity contract. Uncertain, overlapping or unsupported
estimate-only differences favor lower-change retention.

Past experimental effort remains recorded as campaign cost but is not a future saving or a reason to
proceed. Update remaining-effort ranges only with reviewed scope or feasibility evidence, preserving
the original ranges and reasons; do not revise the horizon or reserve to qualify a preferred result.

A production hybrid inherits paper-level evidence only when it retains the same input collector,
paint backend and paper-consumer semantics. Host glue still needs its own interaction and coherence
checks. A changed backend or consumer needs bounded output, crayon/Magic, ordering and mechanism
checks before eligibility; cost estimates cannot substitute for that evidence. Record measured and
estimated burden entries for both arms.

The matched RN drawing screen uses the native build of the selected shared vocabulary, or separately
measures every surviving vocabulary. Register it in the scenario manifest; a raw-RN fixture cannot
certify the theme/style costs of a production RSD screen.

Where motivating costs remain and neither candidate removes them, allow at most two reviewed causal
units per affected OS and workload family. Each unit names a falsifiable owner/mechanism question, a
bounded intervention and its stopping condition before results. Escalate this branch to Flutter or
separate native UI only when evidence attributes the failed mechanism to the shared foundation, and
a feasible alternative has a concrete bypass with supported floors, installation identity and
continuity still possible. Otherwise record retention of the shipping architecture, with the
residual costs outstanding as release work. This retention is not a performance benefit, does not
make either failed candidate eligible, and cannot complete the campaign while any final physical,
release, acceptance or continuity gate remains unmet.

If fresh controls show no current motivating failures, including after bounded in-place remedies,
compare structurally viable, faithful and continuous designs satisfying applicable web contracts
under the registered burden-only materiality rule, including current Svelte/Capacitor retention as
an explicit outcome. Claim no additional architecture performance benefit without a separately
preregistered comparison. Passing remedied workloads remain regression obligations.

For each OS, attempt a calibrated system-trace observer and a calibrated display observer in at most
two reviewed implementation cycles per observer family. Hardware unavailability does not count as
failed calibration. If neither can observe the registered outcome, name the failed OS, outcome and
coverage gap, record comparison as unproved, and record a scoped provisional ADR. It permits only
isolated candidate work in PHASE-1 units 3 and 5–9, with each unit's reviewed scope and stopping
condition; it permits no production ownership move or cutover. It is not Phase 1 exit or final
architecture selection, and evidence from it certifies neither the other OS nor a cross-platform
selection. Independently valid evidence on the other OS retains its own scope.

A reviewed new observer mechanism, or an actual hardware/tooling change that addresses the named
coverage failure, may reopen one further bounded cycle per failed OS and registered outcome, shared
across the observer families. Register its coverage predicates, rejecting controls and stopping
condition before running it. A renamed metric, cosmetic rerun or relaxed predicate cannot reopen the
budget; another unrelated tool revision does not automatically grant another cycle. Without
qualifying re-entry, or if that cycle also fails, record the shipping architecture as retained and
comparison unproved, with required evidence still pending. Where motivating costs remain, final
selection still requires ordinary measured eligibility. Retention and an exhausted research budget
cannot complete the migration or waive its final gates.

Evaluate Flutter or separate platform UI plans in more depth if a leading path fails a structural
requirement or its recurring burden dominates. Select the architecture in an ADR with alternatives,
evidence, consequences, released dependencies, floors, and remaining risks. Amend only the ADRs
whose implementation decisions the chosen architecture actually replaces; retain their product
contracts. No dependency floor increase is an unrecorded side effect.

## Measurement and performance contract

The [profiling mechanics](../PROFILING-MECHANICS.md) and
[capture campaign rules](../PROFILING-CAMPAIGNS.md) define the current instrument. A native surface
has no DOM pointer/rAF pipeline. Define equivalents for delivered input, engine work, render
submission, frame scheduling, visible output, action readiness, undo, and presentation where
observable. A callback clock is not automatically compositor presentation evidence.

Before comparative timing, define the same activation, first-visible-response, required-motion
continuity and first coherent usable-result predicates within each OS. Calibrate actual observers on
the shipping app and extend their coverage to the native paper producer. Browser scheduled-rAF gates
retain their original diagnostic meaning; they cannot score a native producer hidden behind a
responsive WebView. Window render/issue metrics and a single drawable's presentation time are not
whole-screen content evidence. Validate system traces and any display recording/observer, including
clock joins, missed coverage and observer cost; unavailable evidence remains pending. Negative
controls must expose stale paper, delayed content/readiness and incoherent scenes while other
callbacks remain responsive.

Use matched devices, workload geometry, input cadence, brush semantics, resolution, themes,
orientation, prior state, and canonical action sequence. Retain failed first-valid samples and
repeat distributions; do not recapture until green. Show successful painted/erased output and state
changes so a blank or delayed renderer cannot pass by doing no work. Record exact commits/builds,
instrument versions, raw artifacts, trace overhead, and temperature/background conditions.

Validate driven-versus-real input and the measured refresh regime. New high-refresh behavior needs
its own characterized regime, not automatic reuse of browser allowances. Compare untraced, lightly
observed, and traced controls to quantify observer effects. Reuse platform traces where they answer
the question. Add probes only for missing observables, with truthful names and negative controls.

Portable budgets are owned by [drawing gates](../../tools/perf/lib/drawing-gates.mjs),
[undo statistics](../../tools/perf/lib/undo-action-stats.mjs), and
[action statistics](../../tools/perf/lib/action-stats.mjs). Browser-specific exceptions and input
witness dispositions do not automatically transfer to a native renderer. A changed metric, regime,
or budget requires a reviewed decision and evidence, never a weakened test to make a candidate
green.

Retain the physical iPad per-release stroke-commit obligation in
[ADR-0173](../adrs/0173-physical-ipad-holds-the-commit-contract.md), owned by
[commit reduction](../../tools/perf/lib/commit-contract.mjs). Its two deposition arms run in the web
engine harness; the `glaze-direct` arm does not prove installed-native performance. A replacement
commit owner requires a reviewed equivalent workload and observable, with missing samples refused
rather than reported as zero, before signed artifacts are published.

Early measurements diagnose mechanisms and feasibility. Overall performance is judged after the
complete UI is integrated and tuned. Where fresh controls retain primary native problems, a
migration must demonstrate repeatable improvement under the registered criteria. When fresh controls
show no motivating failures, apply the registered no-residual rule without an additional unproved
architecture-performance claim. Retention with unresolved costs or unproved comparison evidence does
not enter that no-residual branch: those costs and evidence remain outstanding release work and the
final performance gate remains unmet. Every outcome requires no unexplained regression in passing
workloads and complete-app startup, memory, thermal, long-session, lifecycle,
input-to-visible-result and action-readiness evidence. Define success thresholds for each causal
comparison before inspecting its results.

Account for app-attributable renderer and GPU resources as well as the application process. The
Capacitor reference includes its Android WebView renderer or iOS WebContent processes; a native
candidate can move those costs into its app process. Name the instruments, capture the same session
states, and report process breakdowns and attributable graphics allocations without double-counting
shared GPU/system processes. Where attribution is unavailable, report the limitation and comparable
whole-device observations separately; an app-process-only footprint cannot establish a memory win.
Apply the same ownership and matched-condition discipline to energy and thermal comparisons.

Intermediate architecture comparisons require no new unexplained regression in the matched passing
workloads and retain existing failures as outstanding work. That parity floor cannot approve cutover
or complete the migration. An inherited release-row red still needs a faithful recapture or a scoped
verified disposition under the final policy.

Physical web/native iPad and Android rows approve release; simulators/emulators provide diagnosis
and build coverage. Preserve the completion policy in
[ADR-0156](../adrs/0156-physical-rows-gate-releases-advisory-rows-never-count.md) and
[ADR-0175](../adrs/0175-matrix-sections-report-capture-age-not-currency.md): no unexplained
scoreable release-gate reds and evidence inside the owning age limit. Explain every exception with
verified evidence; an unavailable instrument does not establish product success.

## Incremental implementation and target cutover

Establish isolated candidate entries and runnable builds during Phase 1. After final architecture
selection, move product ownership in bounded increments. Share portable TypeScript behavior, assets,
and tokens where selected; keep render surfaces, native services, and web semantics behind explicit
adapters. A setting or DOM subtree has one active owner. Do not make the current Svelte facade a
native dependency: it imports SvelteKit/rune state and owns browser canvas objects.

After foundation selection, for each bounded ownership increment, the lead writes an implementation
plan with alternatives and done-when evidence; Claude reviews it. Isolated pre-selection routine
feature construction follows the functional development priority and each unit's integration review
gate. Implement, run appropriate checks and real-app validation, then open the unit PR promptly and
obtain Claude's diff/evidence review. Resolve material findings, verify the exact head's applicable
CI, and merge into the integration branch. Review the phase outcome before adding the next
foundation. Preserve a durable work ledger and all rejected assumptions.

Web, Android, and iOS have independent readiness gates. Keep a shipping reference and staged
candidate until that target earns applicable product acceptance and measured readiness. Validate
same-identity updates from the applicable distributed source/channel inventory in
[UPGRADES.md](UPGRADES.md), including safe fresh initialization, rather than relying solely on clean
installs or different-ID development apps. Record each distribution channel's signing proof and
allocate candidate build numbers through the existing release owner alongside main's release train.
Inventory evolving main features and review their new-product disposition before claiming complete
acceptance. Keep old hosted API/CORS/download contracts working while supported installed clients
still depend on them.

## Migration completion

The campaign is complete only when all of the following have evidence at the reviewed cutover or
retention decision:

1. The selected product UI is the shipping implementation on every target; retained UI and
   hosted/server responsibilities are explicit. Every applicable acceptance scenario maps to passing
   tests of that implementation or reproducible physical/manual evidence. Retained UI is not
   reported as replaced. No feature is silently deferred.
2. Both same-identity native update paths satisfy the active identity, signing/channel and
   fresh-initialization contract. New-app offline, rejected permissions, failed saves, interrupted
   work, and lifecycle recovery pass. Floor-device behavior and all introduced
   dependencies/permissions are accounted for.
3. Full integrated and tuned performance satisfies the measurement contract, including fresh
   physical release-gate evidence and improvements where primary native problems remain in fresh
   controls. A genuine no-residual outcome follows its registered rule and claims no unproved
   architecture benefit. Retention with residual costs or unproved comparison evidence records an
   architecture disposition only; that release work remains unresolved and cannot complete the
   campaign. Current passing behavior and visual semantics are preserved.
4. Applicable CI/build/security/asset gates pass, signed native artifacts are version-verified,
   deployment smokes pass, and release/store metadata and dependency/privacy records reflect the
   actual product. Store publication and external approval state are recorded separately from
   artifact/build evidence; a pending store approval cannot be described as a completed release.
5. Each target's cutover or retention decision is reviewed, the final integration is merged to
   `main`, hosted deployment is verified, and retired UI/code/test owners are removed or explicitly
   retained for the selected product or a concrete supported-client responsibility. Architecture and
   agent instructions describe the shipped code.
6. Codex and Claude independently assess the complete evidence inventory and agree that there is no
   remaining required work. Their final review names the exact commits/artifacts and any external
   publication state. Agreement without the preceding evidence cannot close the campaign.
