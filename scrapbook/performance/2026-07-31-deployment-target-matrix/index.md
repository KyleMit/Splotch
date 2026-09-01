# Deployment-target performance matrix — 2026-08-29

This deployment-target snapshot combines the campaign evidence declared in `sources.json`.
`e4877a1065dc3441df0c023141fbf3ef66787dff` is the measured product commit. Every normalized result
retains its target, mode, commit, and declared evidence state; focused action captures, when
present, replace only their declared scenarios within that mode, and only alongside a full sweep at
the same product commit.

The [interactive matrix](./index.html) is the quickest comparison. [`data.json`](./data.json)
contains every normalized drawing run and grouped action result, and
[`sources.json`](./sources.json) records the ordered source campaign.

Regenerate the JSON, Markdown, and HTML after updating the source manifest with:

```sh
npm run gen:performance-matrix -- \
  scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json
```

## Acceptance gates

Drawing passes at paint P95 ≤ 20 ms, P99 ≤ 33 ms, max ≤ 50 ms, and cumulative lost frame time ≤ 1%
of in-contact time. Undo passes at engine P95 ≤ 20 ms, next-frame P95 ≤ 33 ms, and next-frame max ≤
50 ms. A discrete action passes at first-frame P95 ≤ 33.5 ms, post-action frame P95 ≤ 20 ms, and
post-action frame max ≤ 33.5 ms. Rotation first frames on iPad Safari are not applicable rather than
gated: under ADR-0142's `resize` anchor the value reads 0–2 ms by construction there, so those cells
render N/A and rotation is scored by the post-action frame gates alone.

Cells held to a different lost-frame budget, and why (ADR-0137):

* **Crayon on `ipad-device-web`** — 1.5%. Crayon deposits wax through pattern-filled strokes that
  Safari prices per path-length, so the web build cannot merge them across pointermoves (the native
  WKWebView prices per op and merges per frame instead — ADR-0137 as amended), so it pays a per-move
  cost every other brush coalesces away, and mirror-by-blit already took it from 2.11%. Across all
  four orientation/theme modes its median is 1.11-1.17%, but a single capture of landscape-light
  measured 1.40% and re-measured to 1.17% over three samples. A matrix cell IS a single capture, so
  this is set above the observed single-sample excursion rather than above the median.
* **Crayon on `ipad-device-native`** — 1.5%. Per-frame crayon op merging (ADR-0137 as amended,
  issue 1236) brought the native WKWebView from a 2.14% published cell to Safari parity: three
  same-session samples on 2026-08-25 measured 0.96/1.11/1.44%, median 1.11% — inside the web cell's
  own 1.11-1.17% median band with the same shape of single-sample excursion. The same residual
  per-move wax cost now binds both runtimes, so the same 1.5% single-capture budget applies, set by
  the same above-the-excursion rule.

## Capture limitations

* The 2026-08-29 campaign measured product commit e4877a1065dc3441df0c023141fbf3ef66787dff. Later
  capture-time commits add only representative performance evidence, so their product staleness
  digest is equivalent.
* All four orientation/theme modes were recaptured for physical iPad web/native, physical Android
  web, and all three Mac engines in the 2026-08-29 campaign. Android physical native refreshed
  drawing in all four modes, but not undo or actions. The four simulator/emulator targets remain
  product-surface current from commit 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 because the matrix
  staleness digest finds no intervening product change; that verdict does not claim their
  instruments were revalidated after the 2026-08-28 capture.
* Android physical native undo remains preserved at 6961e50b685d441e88b37d20d3f38a27136572fb, while
  actions retain their prior per-mode provenance (6961e50b685d441e88b37d20d3f38a27136572fb in
  portrait and ce88c8e587ac45847c419e05ef7a79d282bc747a in landscape). This is blocked historical
  evidence, not current-equivalent carryover: the native action runner rejects the physical Android
  UDID through its iOS XCUITest path before capture. Those action sweeps predate ADR-0142's resize
  anchor, so their rotation first-frame numbers are not comparable with any other rotation row in
  this matrix. #1387 tracks teaching that sweep the compact Android shell and transport contract.
* Android physical web and native drawing use the ADR-0135 split input/measurement transport. Fresh
  artifacts record the driving cadence, input fidelity, and page identity used to decide whether a
  result is scoreable. Browser page identity is proven by URL; split-native page identity is
  unprovable because the installed app loads the remote probe-host URL, so those captures instead
  require native foreground-package attestation.
* The campaign accepted every faithful red drawing gate and did not rerun a valid result to turn it
  green. Capture retries were reserved for transport or harness failures; the completed 2026-08-29
  target ledgers record no such retries for the iPad, Android web, or desktop runs.
* Physical iPad capture needs a root-owned RemoteXPC tunnel before iOS 26 XCUITest discovery sees
  the device. See docs/PROFILING-IPAD.md.
* A landscape phone renders the compact Settings shell, which offers quick toggles and a pointer to
  portrait instead of the section list. Compare action modes against the same recorded
  settingsShell; a different label set between portrait and landscape is a shell difference, not a
  regression.
* Firefox is Gecko, which no Splotch deployment target ships; read it as the third desktop browser a
  parent might open splotch.art in, never as evidence about WebKit or Blink.
* Desktop captures used exact 1366×915 or 915×1366 CSS viewports at DPR 2 — iPad Pro 12.9 geometry,
  so the canvas area matches the physical-iPad rows. Playwright retains the requested page viewport
  regardless of the browser window size.
* Simulator, desktop, native-shell, and automated Android results are advisory. Physical iPad web is
  the only Safari-calibrated release-gate transport.
* Raw perf-profiles are local scratch and are mostly untracked. ADR-0138 tracks one representative
  whole capture per target and brush under perf-profiles/evidence/, while current normalized
  per-mode sections are marked captured-untracked and remain subject to npm run
  check:matrix-staleness.
* Android emulator web omitted the `open coloring book` action row in portrait-dark and both
  landscape modes because the persisted picker state reopened already drilled into the selected
  book. Those three omissions are not passes and must not be read as improvement; the action runner
  now returns to the book list as setup before measuring selection so future sweeps keep a stable
  row set.
* Android emulator native drawing used the split input/measurement transport, whose retained
  2026-08-28 artifacts record pageIdentity as unprovable because the installed app loads the remote
  probe-host URL. The capture did launch the package explicitly, but those artifacts predate the
  foreground-package attestation added after review; treat their origin as advisory. New Android
  split-native captures are rejected unless dumpsys proves art.splotch.app is the resumed package.
* The three Mac engines are not driven at the same input cadence: Chromium and Firefox deliver about
  120 contact moves per second while Playwright WebKit delivers about 60. Both are stable, but the
  three desktop rows are not strictly comparable to one another.
* 16 cells carry historical results preserved from data.json rather than re-read raw captures:
  Per-mode raw captures land in gitignored perf-profiles scratch. ADR-0138 deliberately tracks one
  whole representative capture per target and brush instead of every orientation-theme cell, so
  historical sections stay preserved while the 2026-08-28 simulator/emulator and 2026-08-29
  physical/desktop recapture sections are marked captured-untracked. Both states regenerate from the
  last normalized data.json, but only captured-untracked sections continue to claim currency and
  remain subject to check:matrix-staleness. Preserved cells: Android physical · web · portrait-light
  (undo); Android physical · web · portrait-dark (undo); Android physical · web · landscape-light
  (undo); Android physical · web · landscape-dark (undo); Android physical · native · portrait-light
  (undo, actions); Android physical · native · portrait-dark (undo, actions); Android physical ·
  native · landscape-light (undo, actions); Android physical · native · landscape-dark (undo,
  actions); Android emulator · web · portrait-light (undo); Android emulator · web · portrait-dark
  (undo); Android emulator · web · landscape-light (undo); Android emulator · web · landscape-dark
  (undo); Android emulator · native · portrait-light (undo); Android emulator · native ·
  portrait-dark (undo); Android emulator · native · landscape-light (undo); Android emulator ·
  native · landscape-dark (undo).
* 32 cells were captured for this campaign but their per-mode raw inputs remain untracked under
  ADR-0138; regeneration carries their normalized sections from data.json, while
  check:matrix-staleness still verifies their capture commits. Representative whole captures remain
  tracked under perf-profiles/evidence/. Untracked-source cells: iPad physical · native ·
  portrait-light (drawing, undo, actions); iPad physical · native · portrait-dark (drawing, undo,
  actions); iPad physical · native · landscape-light (drawing, undo, actions); iPad physical ·
  native · landscape-dark (drawing, undo, actions); iPad simulator · web · portrait-light (drawing,
  undo, actions); iPad simulator · web · portrait-dark (drawing, undo, actions); iPad simulator ·
  web · landscape-light (drawing, undo, actions); iPad simulator · web · landscape-dark (drawing,
  undo, actions); iPad simulator · native · portrait-light (drawing, undo, actions); iPad simulator
  · native · portrait-dark (drawing, undo, actions); iPad simulator · native · landscape-light
  (drawing, undo, actions); iPad simulator · native · landscape-dark (drawing, undo, actions);
  Android physical · web · portrait-light (drawing, actions); Android physical · web · portrait-dark
  (drawing, actions); Android physical · web · landscape-light (drawing, actions); Android physical
  · web · landscape-dark (drawing, actions); Android physical · native · portrait-light (drawing);
  Android physical · native · portrait-dark (drawing); Android physical · native · landscape-light
  (drawing); Android physical · native · landscape-dark (drawing); Android emulator · web ·
  portrait-light (drawing, actions); Android emulator · web · portrait-dark (drawing, actions);
  Android emulator · web · landscape-light (drawing, actions); Android emulator · web ·
  landscape-dark (drawing, actions); Android emulator · native · portrait-light (drawing, actions);
  Android emulator · native · portrait-dark (drawing, actions); Android emulator · native ·
  landscape-light (drawing, actions); Android emulator · native · landscape-dark (drawing, actions);
  Mac · Firefox · portrait-light (drawing, undo, actions); Mac · Firefox · portrait-dark (drawing,
  undo, actions); Mac · Firefox · landscape-light (drawing, undo, actions); Mac · Firefox ·
  landscape-dark (drawing, undo, actions).

## Candidate actions

| Priority | Action                                   | Rationale                                                                                                                                                             | Applicability                                      | Status                                                                                                                  |
| -------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| P0       | Sound-source and Clear gesture matrix    | Exercise Drawing/Delete sound toggles, volume drag, and Clear cancel/reverse/success paths with audio enabled and disabled.                                           | All web/native targets                             | Partial: drawing-sound toggle and successful Clear captured; delete sound, volume, and cancelled/reversed Clear remain. |
| P0       | Coloring-backed brush matrix             | Measure Pen, Crayon, Magic, and Eraser on active coloring art, including reversal, undo, clear, theme swap, and rotation.                                             | All targets                                        | Partial: page phases and selection/clear captured; dense ink/theme/rotation combinations remain.                        |
| P0       | Continuous Settings gestures             | Exercise pane/sidebar scrolling, phone drill/back, quick switches, button-size and volume sliders, and individual tool toggles.                                       | All targets; touch variants on mobile              | Not captured; current suite measures section navigation and selected toggles.                                           |
| P0       | Coloring picker cold/warm and race paths | Separate cold open from warm reopen, page-grid scroll, back, double-tap guard, active-page clear, and progressive pack arrival.                                       | All targets                                        | Partial: open/book/scroll/select/clear captured; cold/warm and race variants remain.                                    |
| P1       | Deterministic AI interaction flow        | Gate local frames for style choice, generating/minimize/restore, drawing while waiting, completion, refusal, retry, and result decode without gating network latency. | Physical targets plus one simulator control per OS | Not captured.                                                                                                           |
| P1       | Parental Gate flow                       | Measure guarded open, wrong-answer regeneration, backspace, correct solve, close, Parent Center retarget, and policy confirmation.                                    | All native targets; representative web targets     | Partial: Parent Center entry captured; full gate interaction remains.                                                   |
| P1       | Screenshot cold versus warm              | Separate pointerdown preparation, save readiness, repeated warm save, active-coloring export, and native OS handoff.                                                  | All targets                                        | Partial: one intercepted save action captured.                                                                          |
| P1       | Theme swaps on realistic content         | Compare blank, dense Pen/Crayon, and active coloring/Magic swaps to expose decode, style, and raster costs.                                                           | All targets                                        | Partial: Settings theme round-trip captured without dense content.                                                      |
| P1       | Rotation state matrix                    | Add Settings-open, picker-open, active coloring with ink, AI waiting, and slider-active rotations.                                                                    | Rotatable mobile targets                           | Partial: blank and generic-ink rotations captured where platform setup allowed.                                         |
| P2       | True custom-color drag                   | Measure drag-across/explore/lift selection, gap snapping, and cancellation instead of a single click.                                                                 | Touch and pointer targets                          | Not captured.                                                                                                           |
| P2       | Settings pinch text zoom                 | Exercise CSS zoom over the fully mounted Settings surface and reset on section change/close.                                                                          | Physical touch targets                             | Not captured.                                                                                                           |
| P2       | Apple Pencil gestures                    | Measure Pencil double-tap brush/eraser switching and Pencil/Scribble Clear guards.                                                                                    | Physical iPad                                      | Not captured by this campaign.                                                                                          |
| P2       | Platform-only shell gestures             | Cover Android web fullscreen/install-banner paths and desktop Ctrl+Z undo.                                                                                            | Android web and desktop web                        | Not captured.                                                                                                           |
| P2       | Lifecycle recovery                       | Background/foreground during dense drawing, AI generation, and coloring-pack work to validate recovery and context restoration.                                       | Physical and emulated mobile targets               | Not captured.                                                                                                           |

## Commit provenance

| Target                                           | Drawing                                  | Undo                                     | Action source commits                    |
| ------------------------------------------------ | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| 1. iPad physical · web · Portrait · Light        | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 1. iPad physical · web · Portrait · Dark         | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 1. iPad physical · web · Landscape · Light       | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 1. iPad physical · web · Landscape · Dark        | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 2. iPad physical · native · Portrait · Light     | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 |
| 2. iPad physical · native · Portrait · Dark      | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 |
| 2. iPad physical · native · Landscape · Light    | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 |
| 2. iPad physical · native · Landscape · Dark     | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 |
| 3. iPad simulator · web · Portrait · Light       | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 3. iPad simulator · web · Portrait · Dark        | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 3. iPad simulator · web · Landscape · Light      | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 3. iPad simulator · web · Landscape · Dark       | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 4. iPad simulator · native · Portrait · Light    | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 4. iPad simulator · native · Portrait · Dark     | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 4. iPad simulator · native · Landscape · Light   | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 4. iPad simulator · native · Landscape · Dark    | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 5. Android physical · web · Portrait · Light     | e4877a1065dc3441df0c023141fbf3ef66787dff | 6961e50b685d441e88b37d20d3f38a27136572fb | e4877a1065dc3441df0c023141fbf3ef66787dff |
| 5. Android physical · web · Portrait · Dark      | e4877a1065dc3441df0c023141fbf3ef66787dff | 6961e50b685d441e88b37d20d3f38a27136572fb | e4877a1065dc3441df0c023141fbf3ef66787dff |
| 5. Android physical · web · Landscape · Light    | e4877a1065dc3441df0c023141fbf3ef66787dff | 6961e50b685d441e88b37d20d3f38a27136572fb | e4877a1065dc3441df0c023141fbf3ef66787dff |
| 5. Android physical · web · Landscape · Dark     | e4877a1065dc3441df0c023141fbf3ef66787dff | 6961e50b685d441e88b37d20d3f38a27136572fb | e4877a1065dc3441df0c023141fbf3ef66787dff |
| 6. Android physical · native · Portrait · Light  | f956fe8f9dbbdb50d7479a4b0c801f923ccc4408 | 6961e50b685d441e88b37d20d3f38a27136572fb | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 6. Android physical · native · Portrait · Dark   | f956fe8f9dbbdb50d7479a4b0c801f923ccc4408 | 6961e50b685d441e88b37d20d3f38a27136572fb | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 6. Android physical · native · Landscape · Light | f956fe8f9dbbdb50d7479a4b0c801f923ccc4408 | 6961e50b685d441e88b37d20d3f38a27136572fb | ce88c8e587ac45847c419e05ef7a79d282bc747a |
| 6. Android physical · native · Landscape · Dark  | f956fe8f9dbbdb50d7479a4b0c801f923ccc4408 | 6961e50b685d441e88b37d20d3f38a27136572fb | ce88c8e587ac45847c419e05ef7a79d282bc747a |
| 7. Android emulator · web · Portrait · Light     | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 6961e50b685d441e88b37d20d3f38a27136572fb | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 7. Android emulator · web · Portrait · Dark      | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 6961e50b685d441e88b37d20d3f38a27136572fb | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 7. Android emulator · web · Landscape · Light    | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 6961e50b685d441e88b37d20d3f38a27136572fb | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 7. Android emulator · web · Landscape · Dark     | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 6961e50b685d441e88b37d20d3f38a27136572fb | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 8. Android emulator · native · Portrait · Light  | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 6961e50b685d441e88b37d20d3f38a27136572fb | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 8. Android emulator · native · Portrait · Dark   | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 6961e50b685d441e88b37d20d3f38a27136572fb | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 8. Android emulator · native · Landscape · Light | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 6961e50b685d441e88b37d20d3f38a27136572fb | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 8. Android emulator · native · Landscape · Dark  | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 | 6961e50b685d441e88b37d20d3f38a27136572fb | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 9. Mac · Chrome · Portrait · Light               | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 9. Mac · Chrome · Portrait · Dark                | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 9. Mac · Chrome · Landscape · Light              | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 9. Mac · Chrome · Landscape · Dark               | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 10. Mac · Safari · Portrait · Light              | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 10. Mac · Safari · Portrait · Dark               | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 10. Mac · Safari · Landscape · Light             | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 10. Mac · Safari · Landscape · Dark              | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 11. Mac · Firefox · Portrait · Light             | 93209cd151780f353917d72fef78dc3d11048015 | 93209cd151780f353917d72fef78dc3d11048015 | 93209cd151780f353917d72fef78dc3d11048015 |
| 11. Mac · Firefox · Portrait · Dark              | 93209cd151780f353917d72fef78dc3d11048015 | 93209cd151780f353917d72fef78dc3d11048015 | 93209cd151780f353917d72fef78dc3d11048015 |
| 11. Mac · Firefox · Landscape · Light            | 93209cd151780f353917d72fef78dc3d11048015 | 93209cd151780f353917d72fef78dc3d11048015 | 93209cd151780f353917d72fef78dc3d11048015 |
| 11. Mac · Firefox · Landscape · Dark             | 93209cd151780f353917d72fef78dc3d11048015 | 93209cd151780f353917d72fef78dc3d11048015 | 93209cd151780f353917d72fef78dc3d11048015 |

## Drawing

Each cell is blank-paper paint `P95 / P99 / max` in milliseconds, followed by the cumulative
lost-frame share of in-contact time. Every target retains separate portrait/landscape and light/dark
rows.

A cell aggregates however many captures its manifest lists — in this snapshot, one per cell
(`runCount` in `data.json` records the basis, and each plot tooltip states it). A gate verdict from
a single capture is one draw from that cell's run-to-run spread, so read a marginal PASS or FAIL as
provisional rather than established: ADR-0136 treats a number from the lost-frame gate as
provisional until it has been compared against the previous run of the same cell, and ADR-0137 sizes
its exceptions from worst single captures for the same reason. The campaign's one attempt to measure
a cell's spread directly (issue 1290) was retracted twice — first as host load, then as cross-run
contamination — so the spread itself remains unmeasured; a clean repeat study belongs to the
campaign-end recapture, on a quiet host.

| Target                                           | Pen                           | Crayon                     | Magic                                | Eraser                              |
| ------------------------------------------------ | ----------------------------- | -------------------------- | ------------------------------------ | ----------------------------------- |
| 1. iPad physical · web · Portrait · Light        | 16 / 21 / 36 · L0.9%          | 15 / 16 / 31 · L0.3%       | 15 / 20 / 35 · L0.7%                 | 16 / 17 / 35 · L0.9%                |
| 1. iPad physical · web · Portrait · Dark         | 16 / 22 / 35 · L0.9%          | 15 / 16 / 25 · L0.1%       | 15 / 20 / 35 · L0.7%                 | 16 / 18 / 41 · L0.9%                |
| 1. iPad physical · web · Landscape · Light       | 15 / 22 / 36 · L0.7%          | 15 / 16 / 26 · L0.2%       | 16 / 19 / 34 · L0.6%                 | 15 / 22 / 35 · L0.8%                |
| 1. iPad physical · web · Landscape · Dark        | 16 / 21 / 36 · L0.8%          | 15 / 17 / 32 · L0.2%       | 15 / 21 / 36 · L0.6%                 | 16 / 20 / 35 · L0.7%                |
| 2. iPad physical · native · Portrait · Light     | 15 / 16 / 23 · L0%            | 15 / 17 / 39 · L0.1%       | 16 / 17 / 35 · L0.1%                 | **FAIL 16 / 17 / 381 · L5.5%**      |
| 2. iPad physical · native · Portrait · Dark      | 15 / 16 / 26 · L0%            | 15 / 16 / 39 · L0.0%       | 15 / 16 / 37 · L0.0%                 | **FAIL 16 / 17 / 379 · L5.5%**      |
| 2. iPad physical · native · Landscape · Light    | 16 / 16 / 34 · L0.0%          | 15 / 16 / 40 · L0.0%       | 15 / 16 / 44 · L0.0%                 | **FAIL 15 / 17 / 373 · L5.3%**      |
| 2. iPad physical · native · Landscape · Dark     | 15 / 17 / 32 · L0.0%          | 15 / 16 / 31 · L0.0%       | 15 / 16 / 23 · L0%                   | **FAIL 16 / 17 / 376 · L5.3%**      |
| 3. iPad simulator · web · Portrait · Light       | 16 / 20 / 26 · L0.3%          | 11 / 15 / 32 · L0.3%       | 12 / 14 / 18 · L0.1%                 | 11 / 14 / 24 · L0.8%                |
| 3. iPad simulator · web · Portrait · Dark        | 14 / 18 / 21 · L0.5%          | 16 / 20 / 24 · L0.3%       | 16 / 19 / 24 · L0.1%                 | 15 / 19 / 27 · L0.8%                |
| 3. iPad simulator · web · Landscape · Light      | 16 / 18 / 23 · L0.2%          | 14 / 18 / 24 · L0.1%       | 16 / 18 / 23 · L0.0%                 | **FAIL 14 / 18 / 72 · L0.7%**       |
| 3. iPad simulator · web · Landscape · Dark       | 14 / 18 / 22 · L0.2%          | 11 / 15 / 27 · L0.1%       | 10 / 13 / 16 · L0%                   | 7 / 9 / 28 · L0.6%                  |
| 4. iPad simulator · native · Portrait · Light    | 15 / 17 / 21 · L0%            | 16 / 17 / 20 · L0%         | 15 / 16 / 25 · L0%                   | 11 / 15 / 27 · L0.7%                |
| 4. iPad simulator · native · Portrait · Dark     | 11 / 15 / 18 · L0%            | 11 / 16 / 24 · L0%         | 5 / 7 / 13 · L0%                     | 16 / 17 / 34 · L0.7%                |
| 4. iPad simulator · native · Landscape · Light   | 16 / 16 / 20 · L0%            | 15 / 18 / 21 · L0.0%       | 16 / 18 / 23 · L0.1%                 | 16 / 18 / 30 · L0.6%                |
| 4. iPad simulator · native · Landscape · Dark    | **FAIL 11 / 15 / 87 · L0.3%** | 15 / 16 / 22 · L0%         | 11 / 13 / 32 · L0.0%                 | 12 / 14 / 27 · L0.7%                |
| 5. Android physical · web · Portrait · Light     | 7.8 / 8.2 / 16.2 · L0.6%      | 7.9 / 8.2 / 11.6 · L0.8%   | 7.7 / 8.1 / 14.9 · L0.7%             | 7.8 / 8.2 / 11.2 · L1%              |
| 5. Android physical · web · Portrait · Dark      | 7.9 / 8.2 / 16.5 · L0.8%      | 7.9 / 8.2 / 12.9 · L0.8%   | 7.9 / 8.2 / 16 · L0.8%               | **FAIL 7.7 / 8.2 / 9.2 · L1.3%**    |
| 5. Android physical · web · Landscape · Light    | 7.7 / 8.2 / 15.3 · L0.5%      | 7.8 / 8.2 / 16.4 · L0.4%   | 8 / 8.2 / 12.9 · L0.7%               | 7.9 / 8.2 / 16 · L0.8%              |
| 5. Android physical · web · Landscape · Dark     | 7.7 / 8.1 / 11.7 · L0.6%      | 7.7 / 8.2 / 14.6 · L0.5%   | 7.9 / 8.2 / 14.3 · L0.6%             | 7.9 / 8.2 / 11.9 · L0.7%            |
| 6. Android physical · native · Portrait · Light  | 7.8 / 8 / 14.3 · L0.0%        | 7.8 / 8 / 8.2 · L0%        | 7.9 / 8 / 13.1 · L0.0%               | 7.7 / 7.9 / 15.1 · L0.4%            |
| 6. Android physical · native · Portrait · Dark   | 7.8 / 7.9 / 15.5 · L0.0%      | 7.7 / 7.9 / 14.2 · L0.0%   | 7.8 / 7.9 / 13.2 · L0.1%             | 7.7 / 7.8 / 23.4 · L0.4%            |
| 6. Android physical · native · Landscape · Light | 7.7 / 7.9 / 23.1 · L0.1%      | 7.7 / 7.9 / 23 · L0.0%     | 7.9 / 8.1 / 49 · L0.4%               | **FAIL 7.7 / 7.9 / 55.8 · L1.0%**   |
| 6. Android physical · native · Landscape · Dark  | 7.7 / 7.8 / 22.1 · L0.5%      | 7.6 / 7.7 / 14.8 · L0.1%   | 7.7 / 7.9 / 15.4 · L0.0%             | 7.6 / 7.8 / 23.5 · L0.4%            |
| 7. Android emulator · web · Portrait · Light     | 16.5 / 16.6 / 16.6 · L0.1%    | 16.5 / 16.6 / 33.2 · L0.2% | **FAIL 16.5 / 16.6 / 198.5 · L0.4%** | 16.5 / 16.6 / 16.6 · L0.4%          |
| 7. Android emulator · web · Portrait · Dark      | 14.5 / 16.4 / 32.1 · L0.6%    | 15.5 / 16.4 / 16.5 · L0.1% | 15.4 / 16.4 / 16.4 · L0.3%           | **FAIL 16.1 / 16.4 / 47.7 · L1.1%** |
| 7. Android emulator · web · Landscape · Light    | 16.4 / 16.5 / 16.5 · L0.0%    | 16.3 / 16.4 / 16.4 · L0.3% | **FAIL 16.2 / 16.5 / 196.8 · L0.4%** | 16.4 / 16.4 / 16.5 · L0.4%          |
| 7. Android emulator · web · Landscape · Dark     | 16.1 / 16.4 / 16.4 · L0.6%    | 16.1 / 16.4 / 16.4 · L0.3% | 16.3 / 16.6 / 16.7 · L0%             | 16.3 / 16.6 / 16.7 · L0.2%          |
| 8. Android emulator · native · Portrait · Light  | 16.4 / 16.5 / 16.5 · L0%      | 16.5 / 16.5 / 16.5 · L0%   | 16.4 / 16.4 / 16.5 · L0%             | 16.4 / 16.5 / 21.5 · L0.1%          |
| 8. Android emulator · native · Portrait · Dark   | 16.5 / 16.6 / 16.6 · L0%      | 16.4 / 16.4 / 16.4 · L0%   | 16.4 / 16.4 / 16.5 · L0%             | 16.4 / 16.5 / 21.4 · L0.1%          |
| 8. Android emulator · native · Landscape · Light | 16.5 / 16.5 / 16.5 · L0%      | 16.5 / 16.5 / 16.5 · L0%   | 16.4 / 16.5 / 16.5 · L0%             | 16.5 / 16.5 / 21.4 · L0.1%          |
| 8. Android emulator · native · Landscape · Dark  | 16.5 / 16.5 / 16.6 · L0%      | 16.5 / 16.5 / 16.5 · L0%   | 16.5 / 16.5 / 16.5 · L0%             | 16.4 / 16.5 / 21.4 · L0.1%          |
| 9. Mac · Chrome · Portrait · Light               | 9.6 / 10 / 10.2 · L0%         | 9.3 / 9.9 / 10.1 · L0%     | 9.6 / 10 / 10.3 · L0%                | 9.7 / 10.2 / 10.3 · L0%             |
| 9. Mac · Chrome · Portrait · Dark                | 9.7 / 10 / 10.1 · L0%         | 9.5 / 9.9 / 10.2 · L0%     | 9.6 / 9.9 / 10 · L0%                 | 9.8 / 10 / 10.2 · L0%               |
| 9. Mac · Chrome · Landscape · Light              | 9.6 / 10 / 10.2 · L0%         | 9.4 / 10 / 10.2 · L0%      | 9.4 / 10 / 10.3 · L0%                | 9.8 / 10.2 / 16.1 · L0.1%           |
| 9. Mac · Chrome · Landscape · Dark               | 9.5 / 9.9 / 10.1 · L0%        | 9.6 / 10 / 10.2 · L0%      | 9.6 / 9.9 / 10 · L0%                 | 9.6 / 10.1 / 10.2 · L0%             |
| 10. Mac · Safari · Portrait · Light              | 18 / 18 / 18 · L0%            | 18 / 18 / 18 · L0%         | 18 / 18 / 19 · L0%                   | 18 / 18 / 18 · L0%                  |
| 10. Mac · Safari · Portrait · Dark               | 18 / 18 / 19 · L0%            | 18 / 18 / 18 · L0%         | 18 / 18 / 18 · L0%                   | 18 / 18 / 19 · L0%                  |
| 10. Mac · Safari · Landscape · Light             | 18 / 18 / 18 · L0%            | 18 / 18 / 19 · L0%         | 18 / 18 / 18 · L0%                   | 17 / 18 / 18 · L0%                  |
| 10. Mac · Safari · Landscape · Dark              | 18 / 18 / 18 · L0%            | 18 / 18 / 18 · L0%         | 18 / 18 / 18 · L0%                   | 18 / 18 / 19 · L0%                  |
| 11. Mac · Firefox · Portrait · Light             | 9.0 / 9.7 / 10.0 · L0%        | 8.9 / 9.5 / 10.1 · L0%     | 9 / 9.7 / 10.1 · L0%                 | 9.2 / 9.9 / 10.3 · L0%              |
| 11. Mac · Firefox · Portrait · Dark              | 9.2 / 9.9 / 10.3 · L0%        | 8.9 / 9.6 / 10.3 · L0%     | 9.1 / 9.8 / 10.1 · L0%               | 9.1 / 9.7 / 10.1 · L0%              |
| 11. Mac · Firefox · Landscape · Light            | 9.0 / 9.8 / 10.1 · L0%        | 9.0 / 9.5 / 10.1 · L0%     | 9.2 / 9.8 / 10.2 · L0%               | 9 / 10.1 / 10.1 · L0%               |
| 11. Mac · Firefox · Landscape · Dark             | 9.0 / 9.7 / 10.1 · L0%        | 8.9 / 9.7 / 10.0 · L0%     | 9 / 9.7 / 10.0 · L0%                 | 9.0 / 9.8 / 10.1 · L0%              |

## Undo

Undo timing is `engine P95 / next-frame P95 / next-frame max` in milliseconds.

| Target                                           | Timing            | Result | Product commit                           |
| ------------------------------------------------ | ----------------- | ------ | ---------------------------------------- |
| 1. iPad physical · web · Portrait · Light        | 2 / 12 / 12       | Pass   | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 1. iPad physical · web · Portrait · Dark         | 1 / 10 / 10       | Pass   | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 1. iPad physical · web · Landscape · Light       | 1 / 10 / 10       | Pass   | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 1. iPad physical · web · Landscape · Dark        | 1 / 11 / 11       | Pass   | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 2. iPad physical · native · Portrait · Light     | 2 / 13 / 13       | Pass   | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 |
| 2. iPad physical · native · Portrait · Dark      | 1 / 13 / 13       | Pass   | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 |
| 2. iPad physical · native · Landscape · Light    | 1 / 13 / 13       | Pass   | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 |
| 2. iPad physical · native · Landscape · Dark     | 1 / 12 / 12       | Pass   | 14f6a575bfda68737f9a98e25c862f22aed8d6c3 |
| 3. iPad simulator · web · Portrait · Light       | 1 / 14 / 14       | Pass   | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 3. iPad simulator · web · Portrait · Dark        | 1 / 16 / 16       | Pass   | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 3. iPad simulator · web · Landscape · Light      | 1 / 16 / 16       | Pass   | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 3. iPad simulator · web · Landscape · Dark       | 1 / 15 / 15       | Pass   | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 4. iPad simulator · native · Portrait · Light    | 0 / 15 / 15       | Pass   | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 4. iPad simulator · native · Portrait · Dark     | 1 / 14 / 14       | Pass   | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 4. iPad simulator · native · Landscape · Light   | 1 / 14 / 14       | Pass   | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 4. iPad simulator · native · Landscape · Dark    | 1 / 14 / 14       | Pass   | 13643a1f2cc5972cc4c9f996cdf1bf476c76dc77 |
| 5. Android physical · web · Portrait · Light     | 0.7 / 13.5 / 13.5 | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 5. Android physical · web · Portrait · Dark      | 0.7 / 28.2 / 28.2 | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 5. Android physical · web · Landscape · Light    | 0.9 / 9.8 / 9.8   | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 5. Android physical · web · Landscape · Dark     | 0.7 / 12.5 / 12.5 | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 6. Android physical · native · Portrait · Light  | 1.4 / 1.8 / 1.8   | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 6. Android physical · native · Portrait · Dark   | 1.4 / 1.4 / 1.4   | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 6. Android physical · native · Landscape · Light | 1 / 1.8 / 1.8     | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 6. Android physical · native · Landscape · Dark  | 1.3 / 5.5 / 5.5   | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 7. Android emulator · web · Portrait · Light     | 0.2 / 14.8 / 14.8 | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 7. Android emulator · web · Portrait · Dark      | 0.3 / 14.4 / 14.4 | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 7. Android emulator · web · Landscape · Light    | 0.8 / 14.9 / 14.9 | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 7. Android emulator · web · Landscape · Dark     | 0.2 / 15.6 / 15.6 | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 8. Android emulator · native · Portrait · Light  | 0.3 / 14.9 / 14.9 | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 8. Android emulator · native · Portrait · Dark   | 0.3 / 13.9 / 13.9 | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 8. Android emulator · native · Landscape · Light | 0.3 / 14.2 / 14.2 | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 8. Android emulator · native · Landscape · Dark  | 0.2 / 14.7 / 14.7 | Pass   | 6961e50b685d441e88b37d20d3f38a27136572fb |
| 9. Mac · Chrome · Portrait · Light               | 0.4 / 8.2 / 8.2   | Pass   | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 9. Mac · Chrome · Portrait · Dark                | 0.5 / 8.3 / 8.3   | Pass   | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 9. Mac · Chrome · Landscape · Light              | 0.4 / 6.9 / 6.9   | Pass   | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 9. Mac · Chrome · Landscape · Dark               | 0.3 / 7.3 / 7.3   | Pass   | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 10. Mac · Safari · Portrait · Light              | 1 / 10 / 10       | Pass   | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 10. Mac · Safari · Portrait · Dark               | 1 / 11 / 11       | Pass   | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 10. Mac · Safari · Landscape · Light             | 1 / 10 / 10       | Pass   | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 10. Mac · Safari · Landscape · Dark              | 1 / 17 / 17       | Pass   | c80fc3b240a3a7925257c9eea055cd83739c7eae |
| 11. Mac · Firefox · Portrait · Light             | 4 / 7.8 / 7.8     | Pass   | 93209cd151780f353917d72fef78dc3d11048015 |
| 11. Mac · Firefox · Portrait · Dark              | 5 / 7.7 / 7.7     | Pass   | 93209cd151780f353917d72fef78dc3d11048015 |
| 11. Mac · Firefox · Landscape · Light            | 6 / 5.3 / 5.3     | Pass   | 93209cd151780f353917d72fef78dc3d11048015 |
| 11. Mac · Firefox · Landscape · Dark             | 5 / 8.2 / 8.2     | Pass   | 93209cd151780f353917d72fef78dc3d11048015 |

## Discrete actions

The idle-frame profiling control is excluded from the columns below and **consulted** rather than
merely dropped: it performs no interaction, so a mode where it fails its own gate cannot attribute
any action score to the product. Such a mode is marked `no control` and left out of the cross-mode
failure ranking. The post-action column is `P95 / max` in milliseconds. Full per-action timing and
provenance are available in the interactive matrix and normalized JSON.

| Target                                           | Passing | At final commit | Worst first P95 | Worst post P95 / max | Failed actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------ | ------- | --------------- | --------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. iPad physical · web · Portrait · Light        | 43 / 47 | 0 / 47          | 24              | 86 / 97              | open Settings; clear coloring page; clear drawing; with ink: PORTRAIT to LANDSCAPE rotation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 1. iPad physical · web · Portrait · Dark         | 42 / 47 | 0 / 47          | 27              | 88 / 91              | select custom color; open Settings; select coloring page; clear coloring page; with ink: PORTRAIT to LANDSCAPE rotation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1. iPad physical · web · Landscape · Light       | 46 / 48 | 0 / 48          | 20              | 81 / 90              | select coloring page; clear coloring page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1. iPad physical · web · Landscape · Dark        | 45 / 48 | 0 / 48          | 28              | 76 / 91              | open Settings; select coloring page; clear coloring page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2. iPad physical · native · Portrait · Light     | 47 / 48 | 0 / 48          | 22              | 19 / 90              | clear coloring page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2. iPad physical · native · Portrait · Dark      | 46 / 48 | 0 / 48          | 27              | 21 / 88              | disable drawing sounds; clear coloring page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2. iPad physical · native · Landscape · Light    | 47 / 49 | 0 / 49          | 22              | 83 / 90              | select coloring page; clear coloring page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2. iPad physical · native · Landscape · Dark     | 47 / 49 | 0 / 49          | 25              | 83 / 87              | select coloring page; clear coloring page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3. iPad simulator · web · Portrait · Light       | 35 / 47 | 0 / 47          | 26              | 54 / 55              | open custom color picker; open Settings; switch dark theme to light; switch light theme to dark; enable advanced controls; select coloring page; save screenshot; empty after clear: PORTRAIT to LANDSCAPE rotation; undo clear after blank rotation; empty after clear: LANDSCAPE to PORTRAIT rotation; with ink: PORTRAIT to LANDSCAPE rotation; with ink: LANDSCAPE to PORTRAIT rotation                                                                                                                                                                                                                  |
| 3. iPad simulator · web · Portrait · Dark        | 37 / 47 | 0 / 47          | 26              | 55 / 55              | open custom color picker; open Settings; switch dark theme to light; switch light theme to dark; enable drawing sounds; select coloring page; empty after clear: PORTRAIT to LANDSCAPE rotation; undo clear after blank rotation; empty after clear: LANDSCAPE to PORTRAIT rotation; with ink: PORTRAIT to LANDSCAPE rotation                                                                                                                                                                                                                                                                                |
| 3. iPad simulator · web · Landscape · Light      | 38 / 48 | 0 / 48          | 22              | 63 / 63              | open custom color picker; open Settings; switch dark theme to light; switch light theme to dark; select coloring page; clear coloring page; empty after clear: LANDSCAPE to PORTRAIT rotation; undo clear after blank rotation; with ink: LANDSCAPE to PORTRAIT rotation; with ink: PORTRAIT to LANDSCAPE rotation                                                                                                                                                                                                                                                                                           |
| 3. iPad simulator · web · Landscape · Dark       | 37 / 48 | 0 / 48          | 23              | 58 / 58              | open Settings; switch dark theme to light; switch light theme to dark; disable drawing sounds; enable drawing sounds; select coloring page; empty after clear: LANDSCAPE to PORTRAIT rotation; undo clear after blank rotation; empty after clear: PORTRAIT to LANDSCAPE rotation; with ink: LANDSCAPE to PORTRAIT rotation; with ink: PORTRAIT to LANDSCAPE rotation                                                                                                                                                                                                                                        |
| 4. iPad simulator · native · Portrait · Light    | 38 / 48 | 0 / 48          | 33              | 67 / 67              | open custom color picker; open Settings; switch dark theme to light; switch light theme to dark; enable advanced controls; select coloring page; clear coloring page; undo clear after blank rotation; clear restored drawing after blank rotation; with ink: LANDSCAPE to PORTRAIT rotation                                                                                                                                                                                                                                                                                                                 |
| 4. iPad simulator · native · Portrait · Dark     | 37 / 48 | 0 / 48          | 15              | 32 / 41              | open custom color picker; open Settings; switch dark theme to light; switch light theme to dark; select coloring page; clear coloring page; clear drawing; undo clear after blank rotation; clear restored drawing after blank rotation; empty after clear: LANDSCAPE to PORTRAIT rotation; with ink: LANDSCAPE to PORTRAIT rotation                                                                                                                                                                                                                                                                         |
| 4. iPad simulator · native · Landscape · Light   | 37 / 49 | 0 / 49          | 16              | 56 / 56              | open custom color picker; open Settings; switch dark theme to light; switch light theme to dark; enable drawing sounds; select coloring page; clear coloring page; empty after clear: LANDSCAPE to PORTRAIT rotation; undo clear after blank rotation; clear restored drawing after blank rotation; with ink: LANDSCAPE to PORTRAIT rotation; with ink: PORTRAIT to LANDSCAPE rotation                                                                                                                                                                                                                       |
| 4. iPad simulator · native · Landscape · Dark    | 37 / 49 | 0 / 49          | 17              | 64 / 64              | open custom color picker; select custom color; open Settings; switch dark theme to light; switch light theme to dark; select coloring page; clear coloring page; clear drawing; empty after clear: LANDSCAPE to PORTRAIT rotation; undo clear after blank rotation; with ink: LANDSCAPE to PORTRAIT rotation; with ink: PORTRAIT to LANDSCAPE rotation                                                                                                                                                                                                                                                       |
| 5. Android physical · web · Portrait · Light     | 48 / 48 | 48 / 48         | 29.6            | 16.9 / 33.4          | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 5. Android physical · web · Portrait · Dark      | 44 / 48 | 48 / 48         | 24.8            | 33.4 / 33.6          | scroll coloring pages; select coloring page; with ink: PORTRAIT to LANDSCAPE rotation; with ink: LANDSCAPE to PORTRAIT rotation                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5. Android physical · web · Landscape · Light    | 33 / 34 | 34 / 34         | 31.2            | 33.3 / 33.4          | select coloring page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 5. Android physical · web · Landscape · Dark     | 33 / 34 | 34 / 34         | 24.2            | 33.3 / 33.4          | disable advanced controls in the compact shell                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 6. Android physical · native · Portrait · Light  | 45 / 49 | 49 / 49         | 44.9            | 16.7 / 66.7          | empty after clear: PORTRAIT to LANDSCAPE rotation; empty after clear: LANDSCAPE to PORTRAIT rotation; with ink: PORTRAIT to LANDSCAPE rotation; with ink: LANDSCAPE to PORTRAIT rotation                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 6. Android physical · native · Portrait · Dark   | 45 / 49 | 49 / 49         | 61.2            | 16.9 / 50.1          | empty after clear: PORTRAIT to LANDSCAPE rotation; empty after clear: LANDSCAPE to PORTRAIT rotation; with ink: PORTRAIT to LANDSCAPE rotation; with ink: LANDSCAPE to PORTRAIT rotation                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 6. Android physical · native · Landscape · Light | 31 / 35 | 0 / 35          | 40.7            | 16.7 / 58.4          | empty after clear: LANDSCAPE to PORTRAIT rotation; empty after clear: PORTRAIT to LANDSCAPE rotation; with ink: LANDSCAPE to PORTRAIT rotation; with ink: PORTRAIT to LANDSCAPE rotation                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 6. Android physical · native · Landscape · Dark  | 31 / 35 | 0 / 35          | 89.7            | 16.6 / 91.8          | empty after clear: LANDSCAPE to PORTRAIT rotation; empty after clear: PORTRAIT to LANDSCAPE rotation; with ink: LANDSCAPE to PORTRAIT rotation; with ink: PORTRAIT to LANDSCAPE rotation                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 7. Android emulator · web · Portrait · Light     | 26 / 49 | 0 / 49          | 30.8            | 83.4 / 116.6         | expand action drawer; open custom color picker; select custom color; open brush menu; select pen brush; open Settings; open Settings section: Sound; open Settings section: Tool Drawer; open Settings section: Saving; open Settings section: What's New; open Settings section: About; switch dark theme to light; switch light theme to dark; disable drawing sounds; enable drawing sounds; disable advanced controls; enable advanced controls; disable screenshot action button; enable screenshot action button; open coloring books; open coloring book; scroll coloring pages; select coloring page |
| 7. Android emulator · web · Portrait · Dark      | 46 / 48 | 0 / 48          | 14.9            | 33.4 / 33.4          | with ink: PORTRAIT to LANDSCAPE rotation; with ink: LANDSCAPE to PORTRAIT rotation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 7. Android emulator · web · Landscape · Light    | 27 / 34 | 0 / 34          | 16.6            | 50.1 / 83.4          | select custom color; open Settings; enable Night Mode in the compact shell; disable Night Mode in the compact shell; open coloring books; select coloring page; with ink: PORTRAIT to LANDSCAPE rotation                                                                                                                                                                                                                                                                                                                                                                                                     |
| 7. Android emulator · web · Landscape · Dark     | 24 / 34 | 0 / 34          | 16.2            | 83.2 / 116.6         | change ink color; open custom color picker; open Settings; disable Night Mode in the compact shell; enable Night Mode in the compact shell; disable advanced controls in the compact shell; enable advanced controls in the compact shell; open coloring books; select coloring page; with ink: PORTRAIT to LANDSCAPE rotation                                                                                                                                                                                                                                                                               |
| 8. Android emulator · native · Portrait · Light  | 38 / 49 | 0 / 49          | 20.5            | 66.7 / 83.3          | open Settings section: What's New; switch dark theme to light; switch light theme to dark; disable drawing sounds; enable drawing sounds; disable auto-save on delete; disable advanced controls; enable advanced controls; enable screenshot action button; open coloring books; open coloring book                                                                                                                                                                                                                                                                                                         |
| 8. Android emulator · native · Portrait · Dark   | 39 / 49 | 0 / 49          | 16.7            | 83.3 / 116.6         | open Settings section: What's New; switch dark theme to light; switch light theme to dark; disable drawing sounds; enable drawing sounds; disable advanced controls; enable advanced controls; enable screenshot action button; open coloring books; open coloring book                                                                                                                                                                                                                                                                                                                                      |
| 8. Android emulator · native · Landscape · Light | 35 / 35 | 0 / 35          | 16              | 16.8 / 16.8          | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 8. Android emulator · native · Landscape · Dark  | 34 / 35 | 0 / 35          | 16.6            | 33.4 / 33.4          | open coloring book                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 9. Mac · Chrome · Portrait · Light               | 48 / 48 | 0 / 48          | 11.1            | 10.4 / 16.7          | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 9. Mac · Chrome · Portrait · Dark                | 48 / 48 | 0 / 48          | 10              | 10.3 / 17.5          | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 9. Mac · Chrome · Landscape · Light              | 49 / 49 | 0 / 49          | 9.9             | 10.3 / 10.4          | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 9. Mac · Chrome · Landscape · Dark               | 49 / 49 | 0 / 49          | 10.9            | 10.3 / 10.4          | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 10. Mac · Safari · Portrait · Light              | 47 / 48 | 0 / 48          | 23              | 23 / 27              | select coloring page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 10. Mac · Safari · Portrait · Dark               | 47 / 48 | 0 / 48          | 22              | 22 / 27              | select coloring page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 10. Mac · Safari · Landscape · Light             | 49 / 49 | 0 / 49          | 23              | 19 / 24              | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 10. Mac · Safari · Landscape · Dark              | 48 / 49 | 0 / 49          | 24              | 19 / 35              | empty after clear: LANDSCAPE to PORTRAIT rotation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 11. Mac · Firefox · Portrait · Light             | 48 / 48 | 0 / 48          | 12.7            | 10.3 / 18.2          | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 11. Mac · Firefox · Portrait · Dark              | 48 / 48 | 0 / 48          | 12.0            | 18.2 / 25.6          | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 11. Mac · Firefox · Landscape · Light            | 49 / 49 | 0 / 49          | 13.2            | 10.3 / 25.0          | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 11. Mac · Firefox · Landscape · Dark             | 49 / 49 | 0 / 49          | 12.3            | 10.3 / 25.1          | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Method

Action sources are applied in manifest order within one target mode. A focused capture replaces only
its declared labels in that mode, and only when the mode also carries a full sweep at the same
product commit (`unconfirmed-focused-action` refuses the fold otherwise); all other labels retain
their earlier measurement and provenance. Drawing raw tables and action samples are re-scored with
the current metric definitions when this report is generated; stored derived summaries are not
trusted. Physical iPad web remains the Safari-calibrated release gate. Simulator, desktop,
native-shell, and automated Android input are advisory comparisons.
