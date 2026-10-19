# RN device parity campaign

Refs #2690 and [tracking issue #2978](https://github.com/KyleMit/Splotch/issues/2978). Epic #2690
stays open for the owner's cutover decision. Issue #2917 records the earlier campaign's disposition;
its closure is not evidence of complete device parity.

This is an **inventory with an execution plan, not accepted parity**. It preserves every historical
requirement and proposed observable subcell. `execution-plan.md` groups the requirements into
representative protocols, and `protocol-mapping.csv` routes each requirement to its protocols,
targets and arms, or to an explicit classification. Target qualification, current-code
reconciliation inside each protocol, and final-head evidence are unfinished. There are no accepted
final-head device passes in this inventory: **zero device, simulator and browser cells are
verified.** The first desk protocol, AC-1, verified 24 logic requirements by two-sided automated
contract and failed one (`results/ac-1-2026-10-19.md`). The DS-2 slice
(`results/ds2-slice-2026-10-19.md`) failed five more rows, each linked to its defect issue. The
LIFE-1, SAVE-1, A11Y-2 and Android DS-1 slices in `results/` changed no row and found no `rn`
defect. Diagnostic build inspections are recorded separately.

## Execution plan

The plan defines 23 protocols in nine families, ordered by user impact. The drawing screen comes
first, with DS-1, its chrome visual matrix, spelled out in full. Routine visual and layout coverage
runs on fresh iOS 26.5 simulators (notched iPhone, iPad mini, 13-inch iPad) and on API 34 and API 36
emulators. A native target pairs the RN candidate with the reconstructed v1.6.0 reference on the
same runtime; RN web pairs with production web source. Physical devices are reserved for
physical-only properties and one drawing-screen sanity check.

| Classification   | Requirements | Status today                                             |
| ---------------- | -----------: | -------------------------------------------------------- |
| `protocol`       |         1234 | `unverified`; 14 `blocked`; 5 `failed` by the DS-2 slice |
| `physical-only`  |          128 | `unverified`; 3 `blocked` without a physical iPhone      |
| `automated-test` |           25 | AC-1: 24 `verified`, 1 `failed` (L0161, #3008)           |
| `settled`        |           18 | Accepted owner decisions, never defects                  |
| `out-of-scope`   |          136 | Each with a stated reason                                |
| **Total**        |         1541 | **24 `verified`** (logic contracts only)                 |

A mapping to a protocol or test is not a pass. A row becomes `verified` only when its protocols have
run on all their targets and arms at one candidate head and the public result record is linked.

## Inventory and provenance

| Inventory              | Original rows | Stable IDs                                             |
| ---------------------- | ------------: | ------------------------------------------------------ |
| Acceptance table       |            59 | T1-1 through T1-14, T2-1 through T2-26, P1 through P19 |
| Behavior inventory     |           355 | B0001 through B0355, preserving original CSV row order |
| Logic inventory        |           275 | L0001 through L0275, preserving original CSV row order |
| Shipping E2E titles    |           787 | E0001 through E0787, preserving original CSV row order |
| Historical differences |            65 | X1 through X65                                         |

`requirements.csv` retains the original wording, source location, historical classification,
candidate mappings and exact aliases. An old test name or implementation claim is a reconciliation
lead, not an accepted two-sided contract. `acceptance-subcells.csv` proposes 4,798 observable cells
before pruning source-proven skips and deduplicating shared evidence. Each subcell takes the
protocols of its requirement, and a protocol's own states replace the generic setup and expected
fields. `execution-plan.md` counts the 1,209 physical cells on routine rows that the targets policy
supersedes.

`source-ownership.csv` is deliberately conservative: any changed path matching a requirement's
prefix invalidates its dependent source-sensitive evidence. This initial map includes broad shared
rendering, platform, build and instrumentation dependencies. It does not justify retaining evidence
after unrelated-looking changes inside those prefixes. Narrowing a dependency requires source
inspection and a recorded rationale. `targets.csv` records target availability separately from a
passed cell. `epic-reconciliation.csv` reconciles the 90 direct closed children against the API;
comment threads were retrieved, but semantic reconciliation remains in progress. The new tracking
issue is an API-linked open child; there are 91 direct children (90 historical closed children plus
#2978). The tracking issue has the open readability child #2985, giving 92 recursive children.
Neither count establishes device acceptance.

The historical inventory source is 64a9ca53a1361afde8d4104b661bbec93892b2c0. This draft candidate is
3906800dbef51ed69f5648bb5c5bc5b8ef596925. Later candidate heads require dependency invalidation. The
acceptance source is the
[59-row table](https://github.com/KyleMit/Splotch/issues/2690#issuecomment-6207540788). Its edited
limitation dispositions are not carried forward as verified states.

## Comparator qualification

Production web was independently identified through its public version response and the published
Netlify production deployment: version 1.6.2682, source dd6b86a2343d400bb654bc664020c09768e6c7f5.
Native store metadata identifies version 1.6.0. The repository tag
d8b86469f63c57a06a9de45664a42eea15b99eb0 is followed by copy-only source
6572ed535f243d06e3f7bcaa5986218cac006d86. A stricter independent Claude reproduction matched the web
payload in both signed repository release artifacts to that child source. Each 224-file comparison
has 219 files equal after explicit build-version, derived namespace and one-to-one reference-name
substitution, four derived CSP-hash differences and one chunk verified with a scope-aware
import-order/minifier-alias check. The tag build is a negative control: the three release-note
phrase edits remain different. The child contains those copy edits. This binds the repository
assets' web layer; native executable/resource provenance and the actual store upload remain
unproved. Safe local archive/export metadata and public history did not yield an upload receipt or
store-delivered binary. Surviving local distribution candidates equal the repository assets, which
is still insufficient to establish actual store source. Neither the approved historical control nor
a same-version retained install is promoted to store equivalence. Artifact receipts and the
reproducible matcher remain private.

The approved historical control 54f56ba892827a336b37087dcaeb3e0c7860fd84 differs from main in 151
shipping-source files. It is not independently established as production equivalence. Source
classification found server/recovery changes and credential-storage error behavior changes, as well
as extractions and instrumentation; detailed classification is still being reconciled. It cannot
stand in for production behavior in those areas.

An unchanged version-tag source Release build launches on a fresh iPad mini simulator using iPadOS
26.5. That establishes launch admission only. Its build used the available SDK and a verified ad hoc
simulator signature; it does not establish store-binary equivalence on physical hardware or complete
comparison on another runtime. No scene-lifecycle compatibility patch has been applied.

The hosted recovery-v1 route returns 404 and its required CORS headers are absent. Legacy generate
and picture-report preflight routes respond, and empty report forms reach existing validation; this
is zero-generation capability probing, not proof of generation or report acceptance. Recovery
integration stays blocked on a deployment decision. A preview could provide separately labeled
integration evidence only after explicit approval. Production is not deployed or rerouted.

`shipping-source-classification.csv` accounts for all 151 changed `web/src` paths between the
deployed web source and the approved historical control. It separates tests/fixtures,
server/recovery changes, credential failure behavior, renderer instrumentation, lifecycle changes
and provisional extractions. Every equivalence conclusion remains explicitly unproved; a shared
module or generic extraction label is not a two-sided production oracle.

A fresh full Android Release APK at candidate 1e84110dbd06e5d14e3fce9f4927988a8cf129eb passed
artifact qualification with the existing candidate signer: probe package identity, cryptographic
signature, non-debuggable Release manifest, Hermes bundle and source binding. All 578 application
source-map code files, 53 audio assets and 90 native build inputs match Git. This build is ARM64
only. It declares minimum API24 and target API36, with `WRITE_EXTERNAL_STORAGE` through API28 and
the corresponding implied legacy read permission. This corrects the stale development guide. The
artifact qualification alone establishes no save, accessibility, runtime or performance result. The
API29 diagnostic below provides separate observations; API24/26 storage remains pending. The earlier
recovered APK remains a separately labeled historical control.

A fresh API29 diagnostic used the current qualified APK and a direct accessibility-action driver.
The official runtime archive checksum and all 14 installed runtime files were verified. Actual
`ACTION_CLICK` opened Settings and AI Settings, operated the drawer and Undo, and invoked Save;
wrong foreground and disabled Undo were refused. Three separate contacts produced three distinct
Undo units. Save published an app-owned, non-pending MediaStore PNG; its device/host bytes and
actual ink were verified. The 583-second batch restored blank ink and the original collapsed drawer
before releasing the owned emulator. That driver was a diagnostic prototype. The reusable-source
successor completed independent review and merged through #2987. Shipping pairing, auto-save/Clear,
API24/26 paths and final matrix acceptance remain pending. Raw text descendants are not
interchangeable with the uniquely named activatable button; both action lists and actual activation
are recorded.

The reusable driver at e5a69978819c6a3ef38c8d74779ab7c7a6bfa51b builds with the existing signer; all
three source inputs match Git. A 141-second fresh-API29 requalification verifies wrong-foreground
refusal, duplicate-name refusal without input, and explicitly class-selected switch activation on
and off. The default does not silently discard repeated names. AI was restored off and the app
returned to drawing before the owned emulator was released. Older APIs explicitly report the
driver's display observation as unknown; separate host checks prove Display0 before every input. The
failed launch-transition and stale-label helper takes remain preserved and diagnosed. No AI request
was made. These are instrumentation diagnostics, not physical, speech or final-matrix acceptance.
Both review rounds are posted from the same Claude conversation; the exact head passed all 17
applicable hosted checks and merged through #2987. One non-blocking candidate-summary truncation nit
is explicitly recorded on the PR. A separate inspect remains necessary when that summary is partial.
No third review round was started.

## Target-to-feature plan

This table records each target's emphasis and qualification state. `execution-plan.md` assigns each
requirement to targets under the owner's targets policy, and `targets.csv` lists every target class
the mapping uses.

| Target class                     | Required emphasis                                                                                       | Present qualification                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Notched iPhone simulator         | Compact/wide transitions, safe areas, maximum font, dialogs, both orientations/themes                   | Fresh target admitted for causal-unit diagnostics; final matrix pending      |
| iPad mini and 13-inch simulators | Full T1 axes, T2 in natural orientation, tablet navigation, all selected widths                         | Mini diagnostic setup available; 13-inch pending                             |
| Physical iPad                    | Real contacts/palm, held-contact rotation, speech, Photos, audio, idle, launch/drawing/Undo             | Operator grant/window and faithful mutable shipping comparator pending       |
| Physical Galaxy                  | Display0 public behavior, TalkBack, Save/files, system navigation, idle constraints, paired performance | Ownership, artifact and driver qualification pending; stay-awake remains 15  |
| API34 emulator                   | Display0 qualification, current Android behavior, permissions and system navigation                     | Fresh emulator admission pending                                             |
| API36 phone and tablet emulators | Routine native coverage with edge-to-edge enforced, tablet layout                                       | Fresh emulator admission pending                                             |
| API29 emulator                   | Actual accessibility activation, scoped-storage Save and auto-save/Clear files                          | Admitted for private activation/storage diagnostics; final matrix pending    |
| API26 and API24 emulators        | Exact APK permission/maxSdk inspection, request/deny/grant and actual old-storage files                 | Official API24 image installed; fresh emulator/storage qualification pending |
| RN web in Chromium               | Full web visual/behavior cells, install banner/guide, actual installation, offline/update, folder save  | Current export passes startup/precache checks; browser acceptance pending    |
| Firefox and Edge                 | Real browser compatibility, core drawing/settings/routes and relevant web contracts                     | Exact browser/version qualification pending                                  |
| Actual Safari                    | Safari-specific behavior, installation and folder-save exclusions where applicable                      | Current Safari qualification pending; Safari16.4 environment unavailable     |
| iOS/iPadOS16.4 floor             | Launch, drawing, Settings, Save and source-declared support                                             | Blocked on compatible official runtime/toolchain availability                |

The checked compatibility floor includes Android API24, iOS/iPadOS16.4, Chrome/Edge111, Firefox114
and Safari16.4. Declared configuration is not a successful floor smoke. Modern Playwright WebKit
does not establish Safari16.4 behavior. The official iOS16.4 download still redirects to Apple
authentication after retry, and the active Xcode catalog excludes it. The owner can download a
compatible Xcode/runtime later using an existing login; credentials are not read. No additional
physical devices are available. Physical-iPhone silent-control cells stay blocked until an
appropriate target exists; a simulator is not substituted. The owner's physical-only list does not
include the keyboard, so hardware-keyboard cells run as KEY-1 on the iPad simulators and the Android
emulator. Driver key events there travel the platform's hardware-key path.

The proposed cells include explicit form-factor/orientation skip candidates. Confirm their public
shell and measured breakpoint before treating the conditional skip as final. Original ledger fields
containing an em dash are retained as not-applicable fields, never counted as passes. Shipping-only
admin, beta, design and development titles remain pending applicability reconciliation, including
the RN-web route disposition; they are not silently dropped.

## Evidence admission and inspection

Before capture, each observable needs concrete setup, one action or timed sequence, expected state,
assertions, source/build/OS, target class, theme/orientation/style, font, Button Size, motion,
permissions, network and comparator provenance. Every device input checks actual foreground identity
immediately beforehand. Android device work binds to Display0. Public controls and live geometry
establish the setup; internal state is not forced to obtain a pass.

Visual protocols identify settled phases, geometry anchors and masks in advance. The initial
geometry tolerance is two logical pixels/points for aligned chrome anchors, with at most one
physical-pixel rasterization fringe after scale normalization. A different text wrap, clipped
control, untappable region, incorrect selection or changed ink is a failure, not an antialiasing
allowance. Text and painted texture also require original-image inspection. Grain/mixing protocols
must specify their own source-derived checks before capture; a generic pixel-diff score is not
sufficient. Status-bar space, home indicators and relevant ink are never masked. Only unrelated
dynamic clock/battery content may be masked, with the exact mask recorded privately.

Motion comparison records actual frame timestamps. A timing difference of at most two recorded
frames is an initial capture tolerance, not a replacement for source-defined duration and logic
contracts. Debounce, coalescing, retries, 429 handling, retention, gate invalidation and storage
limits need two-sided automated contracts or direct behavioral assertions. Unit tests that only
repeat an unintended divergence do not qualify. Physical speech requires observed output in a
private recording or available speech/caption facility; labels and traits alone are insufficient.

Statuses are pending, blocked, failed, verified, stale/invalidated, not-applicable-with-rationale,
or explicitly accepted difference. A verified cell needs admitted builds, complete behavioral
assertions, every required original comparison inspected, inspector records, and recoverable private
evidence. A failed take is retained. A retry requires a diagnosed cause, changed code/helper, or
corrected setup. Every input/capture/result checkpoints its cell. No acceptance batch exceeds 600
seconds; additional batches and operator windows continue until the required scope is covered or
concrete blockers remain.

The current raw proposal has 3,360 T1 cells, 952 T2 cells and 486 P cells. A naive two-arm still for
every T1/T2 cell would mean 8,624 originals, plus behavioral videos/records. This is a planning
upper bound before explicit skips and evidence-sharing; it is not a completed capture count. The
protocol pass now sizes its own work. DS-1 alone is 128 independent batches: 2,592 stills and 128
cold-launch recordings across six simulators and emulators and two web viewports. Physical work is
not ready for an operator window yet.

## Operator and AI prerequisites

The consolidated checklist will cover the automation grant; real contacts and held rotation;
keyboard if available; assistive speech and focus/adjustment; actual audio/silent controls; Photos
deny, system Settings grant and return/retry; idle and system navigation; and any existing on-device
credential entry. The owner is not asked to time gestures or confirm screenshots. Once Ready is
requested and received, launch the owned physical WDA session within 30 seconds. Restore mutable
settings after experiments. Retained installs remain read-only.

Live AI is gated by zero-cost capability checks, public entry and harmless synthetic payload
admission. The persistent cumulative counter remains one possible generation charged out of ten,
zero returned pictures and zero accepted reports. No campaign generation has been dispatched.
Charges happen atomically before dispatch, ambiguity stays charged, and the counter never resets by
session or device. Nine possible generations remain, only for P12/P13/T1-12. Plan one successful
generation and real picture-report per native platform plus applicable RN-web coverage, reserving
the remainder for diagnosed retries. A real picture-report writes to the moderation queue; a problem
report is not a substitute. Attempt 33 and refusal/timeout/retry/retention layouts use explicit
fixtures through production components/adapters, not paid calls. Fixtures cannot prove live
generation or report delivery. Existing keys/access codes are entered directly on the named device,
with no credential reading, capture or provisioning.

Accepted decisions remain accepted, including P19 data loss/no upgrade rehearsal, landscape palette
trim, theme retinting, iOS blur/Android dim, static Flat fade, removed caps/gallery/Export PNG,
ungated AI switches/key save, deferred React Compiler, and the recorded resize/runtime boundaries.
These are decisions, not newly passed tests. Issue #2941's shared network/Data Saver defect has
separate acceptance from migration regressions. Issue #2921 requires actual physical stroke and Undo
cardinality, including a meaningful joined-request negative control, before drawing/history or
performance results are trusted.

## Merged causal units and pending evidence

The physical gesture request boundary (#2979), independent PageArt test-fixture race (#2980), native
adjustable slider semantics (#2981), reading safe-area/public-return behavior (#2982), Settings
title wrapping and web focus (#2983), maximum-font active-page chip containment (#2986), and guarded
Android accessibility-action diagnostics (#2987) are merged. Each exact implementation head
completed independent Claude review and applicable hosted CI. The draft candidate includes merge
3906800dbef51ed69f5648bb5c5bc5b8ef596925. The latter unit changes only diagnostic tooling,
documentation and script metadata; application/native inputs and dependency metadata are
byte-identical to the qualified 1e84110dbd06e5d14e3fce9f4927988a8cf129eb application. Its diagnostic
observations keep that original source binding. These fixes do not establish their physical
acceptance cells: actual stroke cardinality, spoken slider value/adjustment/focus and physical
reading-page interaction remain pending.

Private diagnostic inspections include adjustable slider, reading-page, Settings title and selected
page-chip comparisons. The chip's ordinary-font before/after originals are byte-identical; its
maximum-font frame grows to contain the complete label. Long dialog titles, Settings choices, picker
captions and live font-reduction behavior remain under #2985, an API child of #2978. They are
unresolved product work. Source invalidation has advanced the ledger without promoting any
diagnostic observation to a final candidate matrix pass. The epic still has 91 direct children and
92 recursive children.

## Stopping checkpoint and next work

At the owner's request, this campaign is stopping at a recoverable unit boundary. The inventory
still contains zero final-matrix verified cells. Android diagnostic PR #2987 completed its two
independent review rounds and exact-head CI and is merged into the migration branch. The coverage PR
#2984 remains a draft, preserving unfinished reconciliation rather than implying acceptance. Private
originals, signed artifacts, build receipts and review records have local byte-verified recovery;
detailed recovery locations and device records stay private.

Resume by refreshing remote heads and the API-linked issue/comment inventory. The operational
protocols now exist in `execution-plan.md`. Next, admit the simulator, emulator and browser targets
and both arms, then run DS-1 and the rest of the drawing-screen family, reconciling each requirement
against current source as its protocol runs. Finish #2985's remaining font defects in causal units,
and extend the admitted Android driver to API24/26 storage, API29 auto-save/Clear and API34
Display0. Establish physical driver cardinality and prepare the consolidated operator windows before
accepting physical drawing, speech, sound, rotation or idle cells. Actual store-source identity,
compatible iOS16.4/Safari16.4 environments and hosted recovery capability remain concrete blockers.
Required live AI/report flows, final matrix comparisons and faithful paired performance are
unfinished. The cumulative AI count remains one possible generation, zero pictures and zero reports.

## Merge and completion boundary

Each causal fix gets independent Claude review, at most two substantive rounds in the same
conversation, and all applicable hosted CI on its exact head. Full suites, native builds,
device/performance work and Claude reviews serialize in the host-exclusive slot. Startup budgets,
ADR-0178's renderer and ADR-0179's lazy boundaries remain fixed. Source changes invalidate affected
cells mechanically; preserved evidence needs an explicit source-dependency justification.

Final reporting requires every applicable subcell and behavior, reviewed CI-green merged fixes,
required physical probes, live AI/report acceptance, explicit accepted differences, faithful
comparator qualifications, final performance and private inspection counts. Missing hardware,
unobserved physical properties, unavailable server capability or an unfaithful comparator stay
blocked. Historical performance numbers are advisory and are not finger-to-ink evidence. Strong
performance claims require admitted Release-versus-Release arms and the documented twelve-Undo
workload, with thresholds defined before measurement.

All media, traces, device records and detailed artifact receipts remain private locally with
byte-verified recovery. Public records contain provenance, counts, states and inspectors. The
protected operator TSV is never staged, reverted or published. Only owned processes, sessions,
forwards and reservations are released. Main, production, retained apps and the cutover decision
remain untouched.
