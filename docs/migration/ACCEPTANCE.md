# Migration acceptance scope

**Status: proposed contract; replacement-native validation pending.**

This document defines acceptance work. It records requirements and existing evidence sources, not a
passing verdict for a replacement application. Architecture alternatives remain open until Phase 1.
Every replacement-native validation below is pending.

The authoritative product glossary is [Architecture: UI elements](../ARCHITECTURE.md#ui-elements).
Implementation plans expand these requirement families into concrete cases before changing them. A
material behavioral difference needs a reviewed decision and a corresponding contract update.

## Test classification

Classify every existing test relevant to a migrated area before replacing its implementation.

| Classification           | Treatment                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Portable requirement     | Preserve the observable behavior; reuse domain fixtures and assertions where practical.                                |
| Web-specific requirement | Retain coverage on web, including browser, PWA, keyboard, routing, and server behavior.                                |
| Implementation guard     | Replace a DOM, Svelte, Canvas, or Capacitor mechanism check with a guard for the same risk in the chosen architecture. |
| Retired requirement      | Record the reason, affected targets, replacement coverage, and reviewed decision.                                      |

Do not count an unchanged web test as proof of replacement-native behavior. The current
[Maestro smoke](../../.maestro/smoke.yaml) asserts launch and a visible Settings control. It does
not navigate product flows or establish drawing, persistence, accessibility, or lifecycle parity.
The [testing guide](../TESTING.md) owns the existing suite roles and CI boundaries.

## Product scenarios and applicability

Web includes supported browser tabs and installed PWAs. Android and iOS mean shipping app targets;
device-specific capabilities remain conditional. Test both orientations and themes where the
behavior applies, including compact phone and wider tablet layouts.

| Requirement family               | Acceptance scenario                                                                                                                                                                                                                                                              | Targets                                                                            | Existing sources                                                                                                                                                                                                                                        | Replacement-native validation                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Core drawing                     | Pen, textured crayon, Magic, and eraser paint their intended output; taps leave dots; smoothing, color, and width retain their supported semantics. Pointer pressure is ignored for brush width and appearance.                                                                  | Web, Android, iOS                                                                  | [Engine smoke](../../web/tests/engine-smoke.spec.ts), [crayon](../../web/tests/engine-crayon.spec.ts), [eraser](../../web/tests/engine-eraser.spec.ts), [engine input](../../web/src/lib/drawing/engine.ts)                                             | Pending                                                |
| Multitouch                       | Simultaneous fingers paint independently, share the intended undo group, and never turn drawing into pinch zoom.                                                                                                                                                                 | Web, Android, iOS                                                                  | [Multitouch](../../web/tests/multitouch.spec.ts), [stroke grouping](../../web/src/lib/drawing/strokeOps.ts)                                                                                                                                             | Pending                                                |
| Input interruptions              | Hover never paints; a drag started on UI does not become ink; cancellation, edge exit, late lift, and resumed input cannot draw spurious connecting lines or leave an active pointer.                                                                                            | Web, Android, iOS, with platform-specific input                                    | [Pointer recovery](../../web/tests/engine-pointer-recovery.spec.ts), [edge swipe](../../web/tests/engine-edge-swipe.spec.ts), [lifecycle](../../web/tests/engine-lifecycle.spec.ts)                                                                     | Pending                                                |
| Brush and pointer feedback       | Brush impact rings, Magic coloring, and eraser halos follow their supported input; lift, cancellation, UI interruption, and reduced-motion changes release feedback without leaving an overlay behind.                                                                           | Web, Android, iOS, with platform-specific input                                    | [Brush ring](../../web/tests/brush-ring.spec.ts), [halo lift](../../web/tests/halo-lift.spec.ts), [motion](../../web/tests/reduce-motion-scoped-cues.spec.ts)                                                                                           | Pending                                                |
| Color selection                  | Palette swatches, custom colors, hexagon gap snapping, and drag-explore/lift-select preserve the selected color; web keyboard activation remains available.                                                                                                                      | Web, Android, iOS; keyboard activation on web                                      | [Palette and picker](../../web/tests/flows-palette-brush.spec.ts), [color state](../../web/src/lib/state/colors.svelte.test.ts), [gap snapping](../../web/src/lib/actions/hexSnapGesture.test.ts)                                                       | Pending                                                |
| Crayon appearance                | Paper tooth, repeated same-color buildup, backtracking, and subtractive color mixing remain recognizable; interleaved erasing cannot resurrect wax.                                                                                                                              | Web, Android, iOS                                                                  | [Crayon scenarios](../../web/tests/engine-crayon.spec.ts), [appearance-changing GPU alternative](../adrs/0153-reject-webgl-crayon-renderer.md)                                                                                                          | Pending                                                |
| Undo and clear                   | Undo preserves in-progress work, restores erased pixels and cleared content, and settles empty state; clear cannot resurrect pending or wiped ink; blank clear adds no meaningless history step.                                                                                 | Web, Android, iOS                                                                  | [Engine undo](../../web/tests/engine-undo.spec.ts), [undo flows](../../web/tests/flows-undo-persistence.spec.ts)                                                                                                                                        | Pending                                                |
| Clear gesture and cues           | Drag-to-clear preserves the Clear Accept Zone ring, Preview Line, Page Turn Overlay, cancellation, and triple-tap coachmark; a clear across rotation flies into the current dock, with applicable reduced-motion behavior.                                                       | Web, Android, iOS                                                                  | [Clear ring](../../web/tests/clear-ring.spec.ts), [tutorial](../../web/tests/clear-tutorial.spec.ts), [clear motion](../../web/tests/drawing-motion-clear.spec.ts), [gesture](../../web/src/lib/actions/dragToClear.test.ts)                            | Pending                                                |
| Bounded history                  | Ordinary large strokes retain the advertised history depth within the owning budget; pathological coverage reduces retained depth deliberately; compaction cannot stall the next gesture or change replayed appearance.                                                          | Web, Android, iOS                                                                  | [History scenarios](../../web/tests/flows-tile-history.spec.ts), [history decision](../adrs/0086-tiled-dirty-region-snapshots-for-frame-bounded-undo.md)                                                                                                | Pending                                                |
| Paper and rotation               | Ink and art remain one upright, contain-fit sheet after rotation; letterbox margins reject new starts; a blank paper adopts the viewport; undo restores recorded paper geometry.                                                                                                 | Web, Android, iOS                                                                  | [Rotation](../../web/tests/engine-rotation.spec.ts), [undo after rotation](../../web/tests/engine-undo.spec.ts), [paper decision](../adrs/0050-locked-paper-view-on-rotation.md)                                                                        | Pending                                                |
| Coloring and Magic               | Starter content works offline; Magic reveals fill without duplicated outlines; page removal/change and theme changes recode live ink coherently; undo restores the appropriate page and ink.                                                                                     | Web, Android, iOS                                                                  | [Magic](../../web/tests/flows-magic-brush.spec.ts), [recode](../../web/tests/flows-magic-recode.spec.ts), [coloring off/undo](../../web/tests/flows-coloring-book-off-undo.spec.ts)                                                                     | Pending                                                |
| Pending art ownership            | Superseded page/theme loads cannot paint stale fills or steal history/export ownership; rotation uses locked paper orientation; selected art and export remain coherent during decode.                                                                                           | Web, Android, iOS                                                                  | [Supersession](../../web/tests/flows-magic-supersession.spec.ts), [coloring decode](../../web/tests/flows-coloring-book.spec.ts), [export](../../web/tests/engine-export.spec.ts)                                                                       | Pending                                                |
| Coloring catalog                 | Book/page navigation, active-page controls, scroll cues, repeated taps, and resize remain usable; incoming downloaded books do not move a held target or alter the open selection unexpectedly.                                                                                  | Web, Android, iOS                                                                  | [Picker](../../web/tests/flows-coloring-book-picker.spec.ts), [active page](../../web/tests/flows-coloring-book-active-page.spec.ts), [downloads](../../web/tests/coloring-pack-download.spec.ts)                                                       | Pending                                                |
| Pack installation                | Disabled coloring prevents downloads while keeping installed content; engagement starts allowed work; verified publication, cancellation, reconnect, removal, background completion, and concurrent updates preserve valid content.                                              | Web, Android, iOS, with platform-specific storage/work                             | [Download policy](../../web/tests/coloring-pack-download-gate.spec.ts), [manager](../../web/src/lib/coloringPacks/manager.test.ts), [concurrency](../../web/src/lib/coloringPacks/webStore.concurrency.test.ts), [native guide](../MOBILE/native.md)    | Pending                                                |
| Screenshot and delete-save       | Capture the complete appearance at the reviewed preparation/activation cut; export-before-clear preserves that drawing; rapid taps deduplicate; save-on-delete and user saves reach the applicable destination.                                                                  | Web, Android, iOS                                                                  | [Screenshot](../../web/tests/flows-screenshot.spec.ts), [export races](../../web/tests/engine-export.spec.ts), [save targets](../adrs/0037-photo-save-targets-per-platform.md)                                                                          | Pending                                                |
| Save failure recovery            | Denials and failures hold the exact unsaved pictures, announce the problem, retry only remaining pictures, survive termination where currently persisted, and offer applicable native Settings recovery.                                                                         | Web, Android, iOS                                                                  | [Save failure state](../../web/src/lib/state/saveFailure.svelte.test.ts), [announcement](../../web/tests/save-failure-announcement.spec.ts), [save decision](../adrs/0037-photo-save-targets-per-platform.md)                                           | Pending                                                |
| AI generation                    | Preserve managed, BYOK, and free request contracts; upload actual drawing content; handle loading, success, safety refusal, offline, timeout, retry, minimized completion, and continued drawing.                                                                                | Web, Android, iOS                                                                  | [Request](../../web/src/lib/drawing/aiImage.request.test.ts), [result](../../web/tests/ai-result.spec.ts), [minimize](../../web/tests/ai-minimize.spec.ts), [failure paths](../../web/tests/failure-paths.spec.ts)                                      | Pending                                                |
| AI Style Prompt                  | Theme-appropriate style covers and names remain available; preview export failure disables selection and announces recovery; choosing a style hands its captured drawing to generation; dismissal invalidates late preview work.                                                 | Web, Android, iOS                                                                  | [Style prompt](../../web/src/lib/components/AiImagePrompt.svelte), [preview failures](../../web/src/lib/components/AiImagePrompt.previewFailure.test.ts), [styles](../../web/src/lib/ai/styles.test.ts)                                                 | Pending                                                |
| AI saving and reports            | Auto-save/deduplication, result download/zoom, report disclosures, gated confirmation, cancellation, signed free-tier reporting, stalled responses, and retries preserve the original result and evidence.                                                                       | Web, Android, iOS                                                                  | [Auto-save](../../web/src/lib/drawing/aiAutoSave.test.ts), [report](../../web/tests/ai-report.spec.ts), [result accessibility](../../web/tests/ai-result-a11y.spec.ts)                                                                                  | Pending                                                |
| Parental policies                | Settings opens directly; sensitive operations honor independent policies and platform defaults; wrong answers and lockouts persist for their declared lifetime; dismissal never unlocks; retargeting keeps one challenge.                                                        | Web, Android, iOS; iOS external-link constraint applies                            | [Gate](../../web/tests/flows-parental-gate.spec.ts), [lockout](../../web/tests/flows-parental-gate-lockout.spec.ts), [Parent Center](../../web/tests/flows-parent-center.spec.ts), [warning](../../web/tests/flows-parent-center-warning.spec.ts)       | Pending                                                |
| Settings and tools               | Preserve sections, compact/wide shells, quick toggles, drawer visibility, optional-brush combinations, independent pen/eraser widths, persisted selection, and understandable unavailable states.                                                                                | Web, Android, iOS                                                                  | [Settings](../../web/tests/flows-settings.spec.ts), [shell](../../web/tests/settings-shell.spec.ts), [optional brushes](../../web/tests/flows-optional-brushes.spec.ts), [persistence](../../web/tests/flows-undo-persistence.spec.ts)                  | Pending                                                |
| Settings Feedback                | Send Feedback retains validation and disclosures; submitted reports may finish across close/reopen, and late results cannot erase a newer draft or cancel a separately submitted report.                                                                                         | Web, Android, iOS                                                                  | [Settings reports](../../web/tests/flows-settings-report.spec.ts), [Settings flows](../../web/tests/flows-settings.spec.ts), [report fields](../../web/src/lib/components/settings/ReportForm.svelte)                                                   | Pending                                                |
| Adult enlargement                | Settings reading content supports its applicable pinch enlargement without zooming the drawing; single-finger scrolling survives; trailing clicks cannot toggle controls; wide section jumps retain zoom and phone section changes reset it.                                     | Web, Android, iOS, where current platform supports enlargement                     | [Settings zoom](../../web/tests/settings-zoom.spec.ts), [zoom contract](../adrs/0076-scope-toddler-zoom-lock-element-level.md)                                                                                                                          | Pending                                                |
| Layout and appearance            | Portrait and landscape palette layouts, compact Color Button, safe areas, system bars, flyouts, Raised/Flat styling, light/dark/system appearance, and Button Size remain usable without collisions.                                                                             | Web, Android, iOS                                                                  | [Safe areas](../../web/tests/safe-area-matrix.spec.ts), [phone toolbar](../../web/tests/phone-landscape-toolbar.spec.ts), [Actions Panel](../../web/tests/actions-panel-layout.spec.ts), [design](../ARCHITECTURE.md#ui-elements)                       | Pending                                                |
| Accessibility and motion         | Accessible names, focus restoration, status announcements, contrast, target sizes, keyboard access on web, and reduced-motion overrides retain their meaning; live preference changes do not replay settled cues.                                                                | Web, Android, iOS, with platform accessibility checks                              | [Accessibility](../../web/tests/a11y.spec.ts), [targets](../../web/tests/touch-targets.spec.ts), [motion](../../web/tests/reduce-motion.spec.ts), [scoped cues](../../web/tests/reduce-motion-scoped-cues.spec.ts)                                      | Pending                                                |
| Audio and feedback               | Enabled sounds remain audible, disabled sources stay silent, lift ends drawing sound promptly, resume does not trigger catch-up playback, and unavailable actions retain their applicable feedback.                                                                              | Web, Android, iOS; human audio validation required                                 | [Sound](../../web/src/lib/audio/drawingSound.test.ts), [lift teardown](../../web/src/lib/audio/drawingSound.stop.test.ts), [drawing decision](../adrs/0085-tiled-live-canvas-for-ipad-webkit.md)                                                        | Pending                                                |
| Lifecycle                        | Supported navigation, remount, background/resume, and delayed layout preserve drawing/history; stale pointers cannot continue painting and no zero-size resume destroys content.                                                                                                 | Web, Android, iOS                                                                  | [Engine lifecycle](../../web/tests/engine-lifecycle.spec.ts), [resume](../../web/tests/flows-resume-layout.spec.ts), [offline navigation](../../web/tests/failure-paths.spec.ts)                                                                        | Pending                                                |
| Back, links, and orientation     | Close the topmost dialog through its own path; preserve gated handoffs; drawing guards apply to standalone display mode or coarse-pointer browser tabs, including iOS Safari; repeated Android Back cannot accidentally abandon ink; orientation follows available capabilities. | Web browser history/fullscreen; Android system Back; iOS applicable rotation/links | [Web Back](../../web/tests/web-back.spec.ts), [system Back](../../web/src/lib/boot/systemBackHandler.svelte.test.ts), [fullscreen lock](../../web/tests/orientation-lock-fullscreen.spec.ts), [orientation](../../web/tests/orientation-picker.spec.ts) | Pending                                                |
| First usable frame and recovery  | Stored appearance/tool choices do not flash incorrectly; drawing becomes usable promptly; denied storage and render/asset failures leave drawing or an actionable recovery path available.                                                                                       | Web, Android, iOS                                                                  | [First paint](../../web/tests/first-paint.spec.ts), [early boot](../../web/tests/early-boot.spec.ts), [failure paths](../../web/tests/failure-paths.spec.ts), [error screen](../../web/tests/error-screen.spec.ts)                                      | Pending                                                |
| PWA, pages, and server contracts | Preserve supported offline launches, install/update behavior, public routes, privacy, changelog, feedback, admin, and hosted API contracts. Native retains its bundled informational pages.                                                                                      | Web; bundled informational pages on Android/iOS                                    | [PWA](../../web/tests/pwa-registration.spec.ts), [install](../../web/tests/install-banner.spec.ts), [route map](../ARCHITECTURE.md#websrcroutes), [dual adapters](../adrs/0001-sveltekit-dual-adapter-strategy.md)                                      | Pending for bundled pages; web work separately pending |

These sources are starting points, not an exhaustive test manifest. Implementation guards about CSS
promotion, hydration adoption, HTML backing counts, or Canvas operation scheduling do not require
the replacement to copy those mechanisms. Preserve the risk each guard protects.

## Native input, command and presentation boundaries

The existing [export preparation](../../web/src/lib/drawing/engine.ts) freezes appearance and stroke
snapshots synchronously before its compositor import. Save-on-delete invokes that preparation before
synchronous clear. The [Screenshot button](../../web/src/lib/components/ScreenshotButton.svelte)
first awaits its lazy module before preparation, so universal pointer-down capture is not
established current behavior. Preserve preparation and export-before-clear semantics; register
cold/warm, cancelled, cooldown and keyboard/accessibility activation cuts before porting them. A
stronger press-ingress snapshot guarantee needs an explicit reviewed behavioral decision and
corresponding cases rather than silently becoming parity.

Native input and semantic commands need a deterministic order at those cuts. Prove one real export
cut and one page/undo transaction before expanding the renderer: later ink cannot enter an earlier
snapshot, delayed pre-clear work cannot resurrect ink, and page undo after route return must use
current policy without a stale callback. Epochs reject stale work but bridge arrival order alone is
insufficient. Prove cancellation, duplicate messages, timeout/reconnect and overlapping
paper/control pointers in both native arms. Choose a bounded protocol rather than requiring a
general distributed-state framework.

Declare delivered-sample and batching policy, distinguishing platform resampling, estimated-property
updates and application predictions. Validate native touch ownership, including suppression of
redundant JS moves after claim, terminal cleanup and working controls/next gestures.
Historical/coalesced samples are existing parity, not an assumed native improvement. Platform-only
filtering unavailable on floor devices cannot be silently required.

Native first usable drawing is measured against
[early boot](../../web/src/lib/drawing/earlyBoot.ts), which accepts after the engine chunk evaluates
and before route hydration. Register cold-launch time to accepted and visible ink; rejected early
input does not erase that latency. If an attached native receiver buffers before its consumer, use
known geometry and persisted policy, bounded complete contacts, exactly-once attachment and explicit
cancellation on overflow/teardown. A receiver cannot buffer before it exists, and a pre-React host
is conditional rather than a prerequisite. Never silently replay half a buffered contact or
reinterpret its points across rotation or background recovery.

For theme, rotation, drawer and page transitions, register correct intermediate scene states and
verify paper/chrome content together. Apply the same coherence bar to hybrid and RN. Acknowledged
state and equal rectangles are not presented output. Delayed old coherent scenes and valid
transition states remain subject to readiness/continuity limits; an indefinite veil cannot turn a
hitch into success. Validate observer coverage before claiming no incorrect presented states.

## Lifecycle and upgrade promises

Ordinary drawing and undo currently have a demonstrated navigation, remount, and resume contract.
They are not promised to survive process termination or a cold launch. Do not infer durable drawing
persistence from the distinct persisted unsaved-picture recovery feature.

Acceptance must cover updates from each supported source release in the
[native upgrade inventory](UPGRADES.md), plus a clean installation. Include the oldest supported
store build, the latest store build at cutover, and releases shipped during the campaign. Record
which sources share a migration path before combining cases. Reinstalling with cleared data is not
an upgrade test.

* Preserve app identity, signing continuity, version progression, and supported installation paths.
* Inventory keys, namespaces, formats, and removal records from each supported release tree; the
  current [key list](../../web/src/lib/storageKeys.ts) is not a complete shipped-version inventory.
  Distinguish shipped stores from features added during the campaign.
* Recover native WebView localStorage at its legacy origin as the live settings copy, with
  Preferences as eviction fallback; preserve the release-specific reconciliation policy. Exercise
  stale Preferences with a newer local value, failed mirror writes, evicted local values, and
  incomplete removals. Where removal records exist, reconcile both copies and honor later writes
  that supersede a removal before importing. Preserve web localStorage choices separately.
* Preserve historical [secure-vault names and formats](../../web/src/lib/secureStorage.ts); failed
  migration must leave recoverable copies intact.
* Retain the existing installation identity and free-generation eligibility; migration must not
  reset the grant.
* Preserve installed coloring files, verification markers, storage paths, pending jobs, and
  background-session ownership.
* Recover [held unsaved pictures](../../web/src/lib/state/saveFailure.svelte.test.ts) and their
  retry state from each source release that contains that feature.
* Preserve web IndexedDB, chosen save-folder access where applicable, and PWA caches/update
  recovery.
* Exercise denied/full/unreadable storage and interrupted migration without silently discarding
  existing data.
* Verify restart, reconnect, and later hydration cannot overwrite newer credentials or resurrect
  removed settings.

The [native guide](../MOBILE/native.md),
[durable restore test](../../web/src/lib/storage.restore.integration.test.ts),
[reconciliation](../../web/src/lib/storage.hydrate.test.ts),
[removal recovery](../../web/src/lib/storage.test.ts), and
[credential hydration scenarios](../../web/src/lib/state/secureCredentialCoordinator.hydrate.test.ts)
anchor these responsibilities. All replacement-native upgrade checks are pending.

## Measurement acceptance

Overall performance acceptance follows complete application integration and a deliberate tuning
pass. Early checks establish renderer fidelity, input delivery, storage recovery, compatibility, and
instrument validity; they do not decide the entire migration from an unfinished prototype.

Release-runtime provenance and real portable-computation checks can expose native cost assumptions
before full paper investment. Browser-dependent drawing modules are not pure merely because they are
TypeScript; separate actual portable work from raster, JSI, decode and scheduling costs. Optimized
simulator comparisons diagnose mechanisms and cannot certify physical performance.

| Measurement responsibility | Required evidence                                                                                                                                                                                                                                                                                                  | Owner                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comparable workload        | Complete applicable drawing-screen state and declared prior journey, with matching visible/retained content, gesture geometry/density, resolution, brush behavior, theme, orientation and canonical action order; record topology descriptors without requiring identical architecture internals.                  | [Capture workflow](../../.agents/skills/capture-performance-matrix/SKILL.md), [campaign mechanics](../PROFILING-MECHANICS.md)                                                                                                       |
| Explicit clocks            | Separate input delivery, engine work, scheduling, callback execution, render submission and presentation where observable. Register common visible/readiness outcomes within each OS and calibrate actual coverage; a callback, window render or paper-only presentation cannot certify the whole coherent screen. | [Frame-clock meanings](../PROFILING-MECHANICS.md#the-action-probes-two-frame-clocks)                                                                                                                                                |
| Output validity            | Demonstrate painted/erased output and intended visible state; refill eraser fixtures so later passes remain meaningful. Timing from a blank renderer is invalid.                                                                                                                                                   | [Matrix validation](../../tools/perf/gen-performance-matrix.mjs), [drawing scenarios](../../web/tests/engine-smoke.spec.ts)                                                                                                         |
| Runtime calibration        | Calibrate replacement input and measurement paths against finger controls and negative controls; establish refresh regime and detect mixed/under-driven streams.                                                                                                                                                   | [Input fidelity](../../tools/perf/lib/input-fidelity.mjs), [refresh regimes](../../tools/perf/lib/refresh-regime.mjs), [finger floor](../adrs/0174-ipad-drawing-lost-frame-is-judged-against-the-real-finger-floor.md)              |
| Instrument overhead        | Compare untraced, light, and full tracing; keep transport latency separate from app metrics.                                                                                                                                                                                                                       | [Platform instruments](../PROFILING-MECHANICS.md#platform-instruments)                                                                                                                                                              |
| Provenance and repetition  | Record exact build/commit, device/OS, observed cadence, resolution, transport, raw tables, output validation, and repeated ranges/worst results; keep the first valid red.                                                                                                                                         | [Capture workflow](../../.agents/skills/capture-performance-matrix/SKILL.md), [capture age](../adrs/0175-matrix-sections-report-capture-age-not-currency.md)                                                                        |
| Owning budgets             | Preserve declared drawing, undo, action and per-release stroke-commit contracts. Browser-specific gates keep their original meaning; changed native metrics and readiness thresholds need reviewed calibration and preregistration. Exceptions do not transfer automatically.                                      | [Drawing gates](../../tools/perf/lib/drawing-gates.mjs), [undo gates](../../tools/perf/lib/undo-action-stats.mjs), [action gates](../../tools/perf/lib/action-stats.mjs), [stroke commit](../../tools/perf/lib/commit-contract.mjs) |
| Whole-session behavior     | Cover startup, transitions, drawing/lift gaps, history compaction, export, downloads, background/resume, long sessions, memory, and thermal behavior.                                                                                                                                                              | [Profiling](../PROFILING.md), [drawing work guards](../../web/tests/drawing-work-counters.spec.ts)                                                                                                                                  |
| Resource accounting        | Compare the app plus its WebView/WebContent renderer, native renderer/workers, and GPU resources using named instruments and a consistent memory basis. Declare shared-process/surface attribution limits and avoid double counting; energy/thermal comparisons include the same system scope and idle controls.   | [Platform instruments](../PROFILING-MECHANICS.md#platform-instruments), [memory limitations](../PROFILING-MECHANICS.md#measurement)                                                                                                 |
| Release evidence           | Physical deployment rows judge release; desktop is a regression tripwire; simulator/emulator evidence cannot approve physical performance.                                                                                                                                                                         | [Release roles](../adrs/0156-physical-rows-gate-releases-advisory-rows-never-count.md), [age/completion policy](../adrs/0175-matrix-sections-report-capture-age-not-currency.md)                                                    |
| Stroke-end release check   | Retain the physical-iPad per-release crayon commit check on both existing deposition arms; an arm without commit marks is NOT EVALUATED and fails the per-release check. Validate a reviewed replacement-native equivalent against the installed app.                                                              | [Commit contract](../adrs/0173-physical-ipad-holds-the-commit-contract.md), [scoring](../../tools/perf/lib/commit-contract.mjs)                                                                                                     |

The existing stroke-commit runner exercises both deposition arms in the physical iPad Safari/dev
harness. Its `glaze-direct` arm is not installed-native proof. A replacement commit metric needs
reviewed boundaries that preserve visible stroke-end behavior rather than deferring work outside the
measured interval. The per-release check and replacement-native equivalent are pending until their
actual builds and instruments are validated.

Replacement-native instrumentation, calibration, captures, and performance verdicts are pending.
Existing report fidelity labels must not substitute for the current per-capture scoring rules. A
changed native presentation rate needs its own characterized regime; browser-specific allowances and
recorded instrument dispositions remain scoped to their original evidence.

Architecture plans define primary metrics and reproducible session fixtures before implementation.
Final comparison preserves equivalent visible behavior and explains regressions. Where fresh
controls retain motivating native problems, a migration requires repeatable improvement in the
registered metrics. Where fresh controls show no motivating failures, the contract's no-residual
rule applies without an unproved architecture benefit. Retention with unresolved costs or unproved
comparison evidence leaves release work pending and the campaign incomplete. Frame-gate success
alone does not establish end-to-end readiness, lower memory or better startup.

## Evidence ledger for each migrated area

Before declaring an area complete, its implementation plan and independent review must record:

1. Applicable requirement rows and concrete success, failure, interruption, and upgrade cases.
2. Existing tests classified, with retained, replaced, or retired coverage identified.
3. Target-specific automated checks and physical/human checks required.
4. Exact reviewed build and artifacts, including representative visuals and raw performance
   evidence.
5. Any behavioral variance, untested requirement, exception, and remaining validation.

A pending requirement cannot become a pass through implementation completion, reviewer agreement, a
renamed metric, or a clean-launch smoke. Record actual evidence and its limitations.
