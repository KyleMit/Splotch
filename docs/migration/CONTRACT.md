# Migration contract

## Scope and decision status

Replace the drawing product UI and client behavior across web, Android, and iOS with the
architecture selected by the Codex/Claude pair. Preserve the complete product, existing-user data,
hosted API contracts, and visual character. Keep the current product runnable until each target is
ready. Retain SvelteKit/Netlify for hosted APIs, admin, and informational routes unless a concrete
requirement warrants a separately reviewed change; see
[ADR-0001](../adrs/0001-sveltekit-dual-adapter-strategy.md).

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
   the contract and plans, including alternative costs and pivot conditions, before code begins.

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

Review and run bounded checks for:

* A React Native native graphics path: chosen released versions compile on both OSes; input,
  representative drawing appearance, geometry, export, native audio, and service bindings have a
  feasible ownership model. Dependency and OS-floor choices are explicit. Do not infer a floor from
  upstream `main` or make Skia's newest backend mandatory for every RN design.
* Native drawing inside Capacitor: test the strongest mechanism by which it could remove the
  identified surface/transition cost, while retaining the Svelte UI. Compare using the same
  validated instrument where possible. A structural inability to preserve a required interaction is
  evidence; a rough prototype's untuned timing is not a final product verdict.
* A shared web vocabulary: React Native Web or React Strict DOM can satisfy prerendered startup,
  accepted pre-hydration ink, renderer ownership, CSP, themes, browser Back, accessibility, and PWA
  contracts. Assess real adapter and bundle costs. The hosted backend remains independent.
* Native continuity: legacy secure entries and preferences are readable without destructive writes;
  installation identity and entitlements match; pending WebView pictures can be recovered; download
  lifecycle identities have a preservation or reconciliation path.

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

Early measurements diagnose mechanisms and feasibility. Overall performance is judged after the
complete UI is integrated and tuned. Require repeatable improvement in the identified primary native
problems, no unexplained regression in passing workloads, and complete-app startup, memory, thermal,
long-session, lifecycle, input-to-visible-result, and action-readiness evidence. Define success
thresholds for each causal comparison before inspecting its results.

Physical web/native iPad and Android rows approve release; simulators/emulators provide diagnosis
and build coverage. Preserve the completion policy in
[ADR-0156](../adrs/0156-physical-rows-gate-releases-advisory-rows-never-count.md) and
[ADR-0175](../adrs/0175-matrix-sections-report-capture-age-not-currency.md): no unexplained
scoreable release-gate reds and evidence inside the owning age limit. Explain every exception with
verified evidence; an unavailable instrument does not establish product success.

## Incremental implementation and target cutover

After architecture selection, establish isolated candidate entries and runnable builds before moving
product ownership. Share portable TypeScript behavior, assets, and tokens where selected; keep
render surfaces, native services, and web semantics behind explicit adapters. A setting or DOM
subtree has one active owner. Do not make the current Svelte facade a native dependency: it imports
SvelteKit/rune state and owns browser canvas objects.

For each bounded increment, the lead writes an implementation plan with alternatives and done-when
evidence; Claude reviews it. Implement, run appropriate checks and real-app validation, then open
the unit PR promptly and obtain Claude's diff/evidence review. Resolve material findings, verify the
exact head's applicable CI, and merge into the integration branch. Review the phase outcome before
adding the next foundation. Preserve a durable work ledger and all rejected assumptions.

Web, Android, and iOS have independent readiness gates. Keep a shipping reference and staged
candidate until that target earns parity and measured readiness. Validate upgrades from previous
signed artifacts with the same app identity, not solely clean installs or different-ID development
apps. Inventory evolving main features and migrate them before declaring parity. Keep old hosted
API/CORS/download contracts working while supported installed clients still depend on them.

## Migration completion

The migration is complete only when all of the following have evidence at the reviewed cutover:

1. The selected product UI is the shipping implementation on every target; retained hosted/server
   responsibilities are explicit. Every applicable acceptance scenario maps to passing replacement
   tests or reproducible physical/manual evidence. No feature is silently deferred.
2. Both same-identity native upgrade paths preserve the upgrade inventory. Offline, rejected
   permissions, failed saves, interrupted work, and lifecycle recovery pass. Floor-device behavior
   and all introduced dependencies/permissions are accounted for.
3. Full integrated and tuned performance satisfies the measurement contract, including fresh
   physical release-gate evidence and improvements in the primary native problems. Current passing
   behavior and visual semantics are preserved.
4. Applicable CI/build/security/asset gates pass, signed native artifacts are version-verified,
   deployment smokes pass, and release/store metadata and dependency/privacy records reflect the
   actual product. Store publication and external approval state are recorded separately from
   artifact/build evidence; a pending store approval cannot be described as a completed release.
5. Each target's cutover is reviewed, the final integration is merged to `main`, hosted deployment
   is verified, and retired UI/code/test owners are removed or explicitly retained for a concrete
   supported-client responsibility. Architecture and agent instructions describe the shipped code.
6. Codex and Claude independently assess the complete evidence inventory and agree that there is no
   remaining required work. Their final review names the exact commits/artifacts and any external
   publication state. Agreement without the preceding evidence cannot close the campaign.
