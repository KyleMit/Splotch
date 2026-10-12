# max-lines headroom plan (2026-09-24)

Target: every file at least 75 counted lines under its hard cap; 425 is the soft cap under the
default 500. Each entry: an isolated proposer, then an independent adversarial reviewer. The
recommendation below is the reviewer's final.

| File                                                         | Now / cap | Proposer  | Reviewer | Projected |
| ------------------------------------------------------------ | --------- | --------- | -------- | --------- |
| `web/src/lib/components/ActionsPanel.svelte`                 | 650 / 650 | split     | revise   | 400       |
| `web/src/lib/drawing/engine.ts`                              | 954 / 954 | raise-cap | endorse  | 954       |
| `web/src/lib/drawing/tiledRenderer.ts`                       | 500 / 500 | split     | revise   | 414       |
| `web/tests/flows-settings.spec.ts`                           | 498 / 500 | split     | revise   | 366       |
| `web/src/lib/actionButtonLayout.test.ts`                     | 497 / 500 | split     | endorse  | 353       |
| `web/src/lib/drawing/aiImage.test.ts`                        | 497 / 500 | split     | endorse  | 400       |
| `web/src/lib/drawing/magicBrush.test.ts`                     | 497 / 500 | split     | endorse  | 260       |
| `web/src/lib/actions/scribbleTap.test.ts`                    | 496 / 500 | split     | revise   | 378       |
| `web/src/routes/design/+page.svelte`                         | 496 / 500 | split     | revise   | 384       |
| `web/src/lib/drawing/crayonBrush.ts`                         | 493 / 500 | split     | endorse  | 407       |
| `web/src/lib/drawing/magicBrush.ts`                          | 493 / 500 | split     | endorse  | 353       |
| `web/src/lib/storage.test.ts`                                | 492 / 500 | split     | endorse  | 337       |
| `web/src/routes/privacy/+page.svelte`                        | 490 / 500 | split     | endorse  | 412       |
| `web/src/lib/drawing/tiledRenderer.test.ts`                  | 488 / 500 | split     | endorse  | 371       |
| `web/tests/flows-undo-persistence.spec.ts`                   | 487 / 500 | split     | endorse  | 328       |
| `web/src/lib/components/styleguide/ChromeSections.svelte`    | 486 / 500 | split     | endorse  | 295       |
| `web/tests/ai-result.spec.ts`                                | 484 / 500 | split     | endorse  | 300       |
| `web/src/lib/components/ColoringBook.svelte`                 | 483 / 500 | split     | endorse  | 387       |
| `web/tests/flows-parental-gate.spec.ts`                      | 478 / 500 | split     | endorse  | 344       |
| `web/src/lib/audio/drawingSound.test.ts`                     | 476 / 500 | split     | endorse  | 352       |
| `web/src/lib/coloringPacks/webStore.test.ts`                 | 476 / 500 | split     | endorse  | 290       |
| `web/tests/reduce-motion.spec.ts`                            | 474 / 500 | split     | revise   | 377       |
| `web/tests/coloring-pack-download.spec.ts`                   | 467 / 500 | split     | endorse  | 339       |
| `web/src/lib/components/SettingsModal.svelte`                | 466 / 500 | split     | endorse  | 268       |
| `web/src/lib/components/ColorPalette.svelte`                 | 461 / 500 | split     | endorse  | 305       |
| `web/src/lib/components/ColorPicker.svelte`                  | 461 / 500 | split     | endorse  | 390       |
| `web/tests/flows-palette-brush.spec.ts`                      | 455 / 500 | split     | endorse  | 329       |
| `web/src/app.html.test.ts`                                   | 454 / 500 | split     | endorse  | 256       |
| `web/src/lib/components/design/SegmentedPicker.svelte`       | 453 / 500 | split     | endorse  | 415       |
| `web/tests/helpers.ts`                                       | 453 / 500 | split     | endorse  | 406       |
| `web/tests/engine-pointer-recovery.spec.ts`                  | 450 / 500 | split     | revise   | 278       |
| `web/src/lib/components/styleguide/PrimitiveSections.svelte` | 444 / 500 | split     | endorse  | 274       |
| `web/src/lib/components/settings/AiKeyManager.svelte`        | 442 / 500 | split     | endorse  | 380       |
| `web/src/lib/server/tokens.test.ts`                          | 441 / 500 | split     | endorse  | 321       |
| `web/tests/flows-magic-brush.spec.ts`                        | 435 / 500 | split     | endorse  | 278       |
| `web/src/lib/drawing/exportDrawing.test.ts`                  | 433 / 500 | split     | endorse  | 292       |
| `web/src/lib/pwa/updates.test.ts`                            | 429 / 500 | split     | endorse  | 293       |
| `web/src/lib/components/AiImageResult.svelte`                | 427 / 500 | split     | revise   | 330       |

## `web/src/lib/components/ActionsPanel.svelte` (650 / 650)

**Reviewer (revise):** I read the file and measured it myself. `npx eslint --rule max-lines:1`
reports 650, which equals 747 nonblank lines minus 97 `//` lines. So CSS and HTML comments do count,
as the proposer said. The seam is real and not driven by the line counter. ColorControl and
BrushControl already set the contract that the new children would follow: bindable
wrapperEl/triggerEl, `open`, `onOpenChange` and `onTriggerClick`. The AI button's state is read by
nothing else in the panel. The screenshot lazy-load memo belongs only to its own button. Both are
self-contained responsibilities.

My counts roughly agree with the proposer's for each move:

* AI: 53 script lines (including the storeCapture const and the aiBtnEl ref), 41 markup, 17 style, 1
  for svelte:document and about 10 for imports. That is about 122 moved, or about -120 net.
* Stroke: 31 markup, 5 for handleStrokeSizeClick, 4 for
  erasing/strokeMenuColor/whiteStroke/darkStroke, 6 for the flyout CSS and 4 for imports. The usage
  in the parent costs about 10 lines, so about -38 net if the off-rule stays in the parent.
* Screenshot: 1 + 35 + 11 + 1 import = 48, about -46 net.
* Undo: 7 + 22 + 1 ref + 2 imports, about -30 net.

That totals about 414. The proposer's 416 is credible but tight.

**What I would change: the settings off-rules.** Risk 1 keeps the settings off-rules (lines 741-758)
in the parent and rewrites them with `:global(.x)`. That goes against the precedent BrushControl
already set. BrushControl owns its own off-rule in its own style block as a pinned compound:
`:global(html[data-off-crayon]... .actions-panel:not([data-action-panel-live])) .brush-wrapper, :global(.actions-panel[data-action-panel-live][data-off-...]) .brush-wrapper`.
StrokeControl, ScreenshotButton and UndoButton should each take their own
`[data-off-stroke|screenshot|undo]` rule the same way. This has three benefits:

* It is more cohesive: the rule that hides a control lives with that control.
* It needs no new `:global()` on child classes in the parent, so the `lint-token-styles` count of 5
  unpinned selectors does not change.
* It frees about 14 more parent lines (4 + 6 + 4).

The `data-off-coloring` rule and its 4-line lead comment stay in the parent with
#coloringBookButton, which `tools/perf/tests/real-screen.test.mjs` pins to ActionsPanel.svelte.
Removing the `uiState` import's multi-line block saves another ~3 lines once aiPromptModal,
openAiSettings and SCREENSHOT_BUTTON_ID leave it. Revised projection: about 396-402, which leaves
about 100 lines of headroom under the default 500.

All four extractions are needed. Without UndoButton the file lands at about 432, and without
ScreenshotButton at about 434. Both miss the 425 soft target. UndoButton is small but cohesive: it
owns the unavailable-action replay and the reduced-motion `{#key}` icon.

**Other checks:**

* **Drift-guard test:** the `actionButtonLayout.fallback.test.ts` `?raw` checks
  (ACTION_PANEL_LIVE_ATTRIBUTE, the bottom/left calc lines, `gap: 12px`) all stay in the parent.
* **Undo-button tests:** `flows-undo-persistence` depends on the route-level listener, not the
  panel's.
* **Visibility listener:** moving `svelte:document onvisibilitychange` into AiImageButton keeps its
  lifetime, because the button is always mounted (it is gated by hidden/inert, not `{#if}`).
* **Bundle boundary:** unchanged. The children are statically imported only by ActionsPanel and pull
  in modules it already imports. The `import()` calls for screenshot and aiImage stay dynamic. Still
  re-run `startup-bundle.spec.ts`.
* **ADRs:** none is violated. ADR-0040 holds because no measurement is added.

**Stale prose to update:**

* `web/src/app.css:690`
* `web/src/lib/boot/undoShortcut.ts:16`
* `tools/perf/ios/capture-xcuitest-actions.mjs`
* `web/src/lib/drawing/aiImage.ts:131`
* `web/src/lib/state/ui.svelte.ts:56`
* `web/src/lib/components/StrokeWidthMenu.svelte:16` ("the parent (ActionsPanel) owns...")
* `web/src/lib/components/Icon.svelte:7-9`
* the styleguide `ChromeSections.svelte` entry
* the eslint.config.js grandfather comment ('~625/~633')

Raising the cap to about 725 would be the worse outcome. The file is not cohesive, since it mixes
panel orchestration with the behaviour of each button, and a working split pattern already exists.

**Recommendation:**

Split ActionsPanel.svelte along the per-control seam that ColorControl and BrushControl already use.

1. **AiImageButton.svelte (new).** Moves:
   * the AI visibility, blocked-state and generating deriveds, and minimizedRunLabel
   * handleAiImageClick and its parental gate
   * the storeCapture const and the aiBtnEl ref
   * the #aiImageButton markup with its .free-count badge and style, keeping `style:--i="4"`
   * `<svelte:document onvisibilitychange={retryOnVisibleReturn}>`
   * the imports only these use

   About -120 net.
2. **StrokeControl.svelte (new).** It follows BrushControl's contract: bindable wrapperEl/triggerEl,
   `open`, `onOpenChange`, `onTriggerClick`, and inkWhite/inkDark/activeColor props. Moves:
   * the #strokeWidthButton trigger and StrokeWidthMenu
   * handleStrokeSizeClick, erasing, whiteStroke/darkStroke and strokeMenuColor
   * its own `.flyout-wrapper` duplicate
   * its own pinned `[data-off-stroke] .stroke-width-wrapper` rule

   The parent keeps strokeTriggerEl, which must become `$state` so the child's bound write lands.
   The parent replaces handleStrokeBtnClick with a setStrokeFlyout(open) like setBrushFlyout. About
   -45 net.
3. **ScreenshotButton.svelte (new).** Moves:
   * the self-resetting screenshotModulePromise memo and loadScreenshotModule, which keeps its
     dynamic `import('$lib/drawing/screenshot')`
   * the prepare/cancel/save press handlers and the button with `id={SCREENSHOT_BUTTON_ID}` and
     `--i="3"`
   * its own pinned `[data-off-screenshot]` rule

   About -52 net.
4. **UndoButton.svelte (new).** Moves:
   * handleUndoClick with the unavailable-feedback replay, and the undoBtnEl ref
   * the #undoButton markup with its aria-disabled comment and the `{#key undoCount}` reduced-motion
     icon
   * its own pinned `[data-off-undo]` rule

   About -34 net.

The parent keeps these parts: the drawer shell and motion, the one openFlyout slot with closeFlyout
and focus restore, publishActionPanelState, #coloringBookButton with its data-off-coloring rule
(pinned by real-screen.test.mjs), the chevron, and the layout CSS. The layout CSS includes the calc
and `gap: 12px` lines that actionButtonLayout.fallback.test.ts reads through `?raw`.

Each child writes its off-rule as BrushControl does:
`:global(html[data-off-x] .actions-panel:not([data-action-panel-live])) .x, :global(.actions-panel[data-action-panel-live][data-off-x]) .x`.
The parent's unpinned `:global` count stays at the lint baseline of 5.

In eslint.config.js, remove ActionsPanel.svelte from the 650 grandfather block so it falls back to
the default 500, and update that block's comment so it describes AdminConsole only.

Update the stale prose in these places:

* `web/src/app.css:690`
* `web/src/lib/boot/undoShortcut.ts:16`
* `tools/perf/ios/capture-xcuitest-actions.mjs`
* `web/src/lib/drawing/aiImage.ts:131`
* `web/src/lib/state/ui.svelte.ts:56`
* `web/src/lib/components/StrokeWidthMenu.svelte:16`
* `web/src/lib/components/Icon.svelte:7-9`
* the styleguide `ChromeSections.svelte` entry

Then verify with the lint, check and unit runs, `startup-bundle.spec.ts`, `reduce-motion.spec.ts`,
the ai-minimize, parental-gate and undo flows, and the actions-drawer page-inventory surface.

The projected size is about 400 counted lines. That is under the 425 soft target, with about 100
lines of headroom under the 500 cap.

**Risks (proposer):** 1. **Scoped CSS crossing the new component boundary.** The settings show/hide
rules at lines 741-758 target `.stroke-width-wrapper`, `.screenshot-button` and `#undoButton` as
scoped selectors, and those elements move into the new children. Rewrite each rule as a pinned
compound: either `.actions-panel[data-action-panel-live][data-off-x] :global(.x)` in the parent, or
`:global(.actions-panel[...][data-off-x]) .x` in the child. Do not make the whole selector
`:global(...)`, because `tools/tokens/lint-token-styles.mjs` limits ActionsPanel to 5 unpinned
`:global()` selectors. The `.action-button` / `.white-stroke` / `.dark-stroke` / `.action-icon`
chrome is in app.css (the "ActionsPanel and BrushControl share..." comment at line 690, which needs
rewording), so it carries over unchanged. Each child hardcodes its `style:--i` cascade index, as
BrushControl does with `--i={0}`, so drawerCascade ordering is preserved.

2. **Drift guards and tests.** `web/src/lib/actionButtonLayout.fallback.test.ts` reads
   `ActionsPanel.svelte?raw` for ACTION_PANEL_LIVE_ATTRIBUTE, the panel `bottom`/`left` calc lines,
   and `gap: 12px`. All of these stay in the parent. `tools/perf/tests/real-screen.test.mjs` pins
   `#coloringBookButton` to ActionsPanel.svelte, and that button stays. E2E specs select by id
   (#aiImageButton, #undoButton, #strokeWidthButton) and are unaffected as long as the ids move
   verbatim. Prose references to update: the comment at `web/src/lib/boot/undoShortcut.ts:16`
   (ActionsPanel.svelte's handleUndoClick), `tools/perf/ios/capture-xcuitest-actions.mjs:1515`
   (ActionsPanel.handleUndoClick), and `.claude/rules/svelte.md`, which cites ActionsPanel for
   `--drawer-transition` (stays) and for pointer gotchas. Edit the rules source, not the generated
   copy.

3. **Bundle boundary.** ActionsPanel is on the startup path. The new children are static imports of
   modules ActionsPanel already pulls in, so no new module edge enters the startup graph. The
   screenshot and aiImage chunks must stay behind dynamic `import()` inside the children. Re-run
   `web/tests/startup-bundle.spec.ts` to confirm chunk partitioning is unchanged.

4. **Flyout coordination.** closeFlyout and openFlyoutWrapper still need
   strokeWrapperEl/strokeTriggerEl. Each has exactly one writer through `$bindable` (the child),
   which satisfies the svelte.md one-writer rule. The trigger ref must become `$state`, like
   brushTriggerEl (see the comment at line 54). restoreFlyoutTriggerFocus is passed as
   onTriggerClick.

5. **AI button state.** The AI button's hidden/inert/aria-hidden and boot-hint behaviour, and
   publishActionPanelState's button-count custom property, read shared state (actionButtonLayout,
   settingsState), not panel-local state. They survive the move, but the Playwright specs
   ai-minimize, flows-parental-gate and flows-harness should be re-run.

6. **Screenshots and tests to re-run.** Visual snapshots of the actions drawer should not change,
   but Svelte scoped-class hashes will. Re-run the page-inventory 'actions-drawer' surface and
   reduce-motion.spec.ts. No ADR forbids this split. ADR-0040 (first paint driven by CSS) is
   preserved because no measurement is added.

## `web/src/lib/drawing/engine.ts` (954 / 954)

**Reviewer (endorse):** I checked the proposal's numbers myself. ESLint max-lines reports exactly
954 counted lines for web/src/lib/drawing/engine.ts (1462 physical lines), and the cap in
eslint.config.js line 441 is 954, so the file has zero headroom. I recounted regions with a
nonblank, non-comment counter. Stroke rendering plus the harness replay (lines 476-678) is 143,
matching the proposal. The export snapshot/prepare block (lines 1383-1462) is 66, also matching. The
pointer and input block (lines 673-1063, including the pen-stream wiring) is 230. The proposal's
figure of about 200 for lines 673-1048 fits that. The arithmetic holds: even taking the three
largest cohesive regions out leaves about 520 lines, well above 425. The only boundary that looks
real is a createPointerInput(host) factory, and it gets the file to about 725-750.

The sibling list is accurate. The drawing/ directory already holds strokeRasterQueue,
penStreamQuirks, crayonPassBoundaries, canvasMeasure, engineListeners, paperLayout, paperView,
inkMotion, idleEmptyScan and exportDrawing. What remains is the orchestration over shared
module-singleton state, which is the ADR-0004 facade. Forcing a split to reach 425 would mean
splitting the paper/resize core and passing a wide getter/setter host interface around. That shuffle
only satisfies the counter, and the existing config comment already rejects it.

The risks section is correct. engine.ts is on the startup path, so a new sibling must not statically
import save-time modules (web/tests/startup-bundle.spec.ts). The export snapshot-then-dynamic-import
ordering is pinned by web/tests/engine-export.spec.ts. Nothing else hardcodes 954; only
eslint.config.js does.

There is one extra piece of evidence for a real margin. `git log -L` on the cap block shows it was
touched in five separate commits between 2026-07-28 and 2026-09-21, each a routine engine fix. A cap
pinned exactly at the file's size turns every fix into a cap bump, which is the "teetering on the
edge" problem the user described.

I have two small additions:

1. Rewrite the size-ratchet comment near line 426 ("caps just above their current size so they can
   only shrink") to describe the ~75-line headroom policy. The proposal mentions this, but it should
   be required, not optional.
2. So the pointer-input idea is not lost, file it as a GitHub issue (optional paydown to about 725
   counted lines) rather than leaving it only in prose.

**Recommendation:**

Raise the cap (no split). In the engine.ts max-lines block of
/Users/kylemit/Code/Splotch/.claude/worktrees/bridge-cse_018bE5yr6xYymD3dbpu2vYYG/eslint.config.js,
change max from 954 to 1030. That leaves 76 lines of headroom at today's measured 954.

Rewrite the comment above it to say this:

* The file is an imperative-by-design engine facade (ADR-0004, ADR-0072).
* The module-singleton state (tool flags, paper/view geometry, pointer map, undo/empty flags,
  callbacks) is shared by the canvas/input orchestration, the brush-state projection and the
  export-before-clear sequencing.
* Splitting those would give each extracted piece a wide accessor interface back into this file.
* Focused mechanics already live in sibling modules.
* The cap sits about 75 above the measured size for maintenance room.
* Reconciliation sessions pay it down by extracting new mechanics into siblings.

Also reword the general ratchet comment (around line 426) from "just above their current size so
they can only shrink" to the ~75-line headroom policy, so the two comments agree.

Optionally, file an issue for a future createPointerInput(host) factory. It would take PointerState,
startDrawing/draw/stopDrawing, the edge-swipe lifecycle, the speed window, releaseCaptureSafe and
releaseAllPointers, about 200-230 counted lines out of lines 673-1063. That would bring the file to
about 725-750. It must keep teardownEngine's release/commit ordering and add no startup-path static
imports.

**Risks (proposer):** A cap-only change: edit the max value and the comment in the engine.ts
max-lines block of
/Users/kylemit/Code/Splotch/.claude/worktrees/bridge-cse_018bE5yr6xYymD3dbpu2vYYG/eslint.config.js
(around lines 435-441). No test or doc hardcodes 954, so no drift guard is affected. The size
ratchet comment above it (around line 426) says grandfathered caps sit 'just above their current
size so they can only shrink'. Raising the cap by 75 relaxes that wording, so update it to describe
the headroom policy, or the two comments will contradict each other. If a split is tried later
instead, the risks are these. engine.ts is on the startup path (ADR-0072 early boot), so any new
sibling must not statically import exportDrawing or other save-time-only modules (issue #461, pinned
by web/tests/startup-bundle.spec.ts). The prepareCanvasExport snapshot-before-dynamic-import
ordering is pinned by web/tests/engine-export.spec.ts. Pointer-input extraction would also have to
keep teardownEngine's release/commit ordering and the ADR-0004 lifecycle guarantees.

## `web/src/lib/drawing/tiledRenderer.ts` (500 / 500)

**Reviewer (revise):** I read the file myself and re-measured every region, counting nonblank,
noncomment lines. The seam is real and the numbers mostly hold, but the plan misses a source-text
drift guard that would break, and it has two signature inconsistencies.

**Measurements**

* Layout loop (126-166): 32 lines.
* Migration (98-110): 13 lines.
* Budget (226-249): 18 lines.
* snapshotsFit (441-447): 7 lines.
* Restore loops (451-467): 17 lines.

**Projection**

* Layout plus migration: 45 lines move out. The call sites are a factory line, one layout call and
  two cancel calls. Dropping the `liveTiles` import and `liveTileSurfaces` from the tiledSurfaces
  import saves about 2 more. Net saving is about 42, bringing the file to about 458.
* Fit plus restore: 24 lines become about 3 lines of calls, saving about 21. That brings it to
  about 437.
* Budget: 18 lines become a wrapper of about 3 lines. The tiledHistoryLimits import block also
  shrinks from 5 lines to 1, because only `TILE_HISTORY_FOLD_IDLE_MS` would still be imported there.
  Net saving is about 19, bringing it to about 418.
* `pushUndoableCommand` dedupe: saves about 3-5 net lines, not 6. The helper costs about 5 lines,
  and each of the 3 sites saves 3-4.
* Landing point is about 413-415, roughly 10 under the 425 soft target. The 411 estimate is close
  enough.
* Without the budget move the file stays at about 432 and misses 425, so all three moves are needed.

**Is the seam cohesive or just counter-driven?**

* Layout and migration are genuine tile-geometry and presentation mechanics. They never touch the
  history ledger, so a new tiledLayout.ts beside tiledSurfaces/tiledGeometry is a real
  responsibility boundary.
* The restore loops really are the inverse of `tiledUndoPatches.capture`.
* The budget move is the weakest of the three. It pulls window accounting (`undoableCommands`) into
  what is currently a pure per-command patch store. It is still acceptable if the method takes
  `history` and `undoableCommands` and returns the trimmed count, rather than owning either.

**Defects in the plan**

1. **Missed drift guard (will fail CI).** tools/perf/tests/xcuitest-actions.test.mjs (around lines
   1210-1215) reads web/src/lib/drawing/tiledRenderer.ts as text and asserts
   `toContain('dataset.tileBacking')`. Moving the layout loop deletes that string from the renderer,
   so the test must be repointed to web/src/lib/drawing/tiledLayout.ts in the same change. The plan
   cited only liveTileComposite.ts.

2. **Stale comment in liveTileComposite.ts.** Its comment (around lines 16-28) names
   `resizeTiledRenderer` as the writer of the attribute. After the move it should name
   `layoutLiveTiles` in tiledLayout.ts, per the rule against unenforced cross-file prose.
   tiledRendererContract.test.ts drives a real resize through the public API, so it keeps covering
   the behaviour unchanged.

3. **Inconsistent migration signature.** The plan writes it as both
   `createHiddenBackingMigration(() => liveTiles)` and `createHiddenBackingMigration(tiles)`. It
   must take the accessor form, because `liveTiles` is reassigned in `adoptTiledRenderer` and
   `detachTiledRenderer`. A captured array would migrate stale tiles after re-adopt.
   * `cancel()` must bump the revision and clear pending.
   * Both call sites need it: the non-deferred branch of `resizeTiledRenderer` (line 169) and
     `detachTiledRenderer` (line 554).

4. **Budget comment.** The WHY comment ends "`undoableStart` is the same value repaintTiledRenderer
   computes". Once the function moves, reword it to state the invariant locally, or drop that
   clause. Do not leave a cross-file claim.
   * Import `MIN_TILED_UNDO_COMMANDS` and `TILED_UNDO_PATCH_BUDGET_PAPER_MULTIPLE` in
     tiledUndoPatches.ts directly from tiledHistoryLimits, and pass only `paperBytes`, so the
     constants are not threaded through the renderer.
   * The clearCapture `onComplete: enforceUndoPatchBudget` wiring stays in the renderer.

**Minor points**

* `restoreUndoPatches` needs the `LiveTile` type (for `ctx`, `needsClear` and `canvas.hidden`), not
  the minimal `SnapshotTile`. Use a type-only import from tiledSurfaces so no cycle is added.
* Line 155's `!tile.canvas.hidden` is always false right after line 152 sets `hidden`. Move it
  verbatim; this is a refactor, not a fix.
* In `commitTiledCommand`, the helper reorders `scheduleTiledHistoryFold` relative to
  `activeCommand = null` and `workCounters.commit()`. That is harmless, since the fold runs in a
  timer and does not read `activeCommand`, but keep `undoPatches.crop` before the push.

**What checks out**

* No bundle-boundary risk: tiledLayout.ts is imported only by tiledRenderer.
* No new `check-release-seams` entry is needed, because tiledLayout has no `engine.*` measures or
  `window.__` tokens. `engine.fold` stays in the renderer.
* Test placement and ADR-0085 are unaffected.

**Would raise-cap be better?** No. The renderer already delegates to six `tiled*` siblings, and
these three clusters fit that pattern.

**Recommendation:**

Split, using the proposed seam with the corrections below. The projected result is about 413-415
counted lines against the 500 cap. The cap stays at the default, and tiledUndoPatches.ts grows to
about 180 physical lines.

1. **New file web/src/lib/drawing/tiledLayout.ts.**
   * `layoutLiveTiles(tiles, width, height, renderScale, deferHiddenBackings)`: the per-tile loop
     from lines 126-166, with the `data-tile-backing` WHY comment moved verbatim.
   * `createHiddenBackingMigration(getTiles: () => LiveTile[])`, exposing `start()`, `cancel()`
     (bump the revision and set pending to false) and `pending()`.
   * The renderer keeps the no-change guard, `clearCapture.resolve()`, the stored dimensions and
     `ensureHistoryBase`, then calls layout followed by start or cancel.
   * `detachTiledRenderer` calls `cancel()`, and `tiledWorkDebug` reads `pending()`.
   * Update web/src/lib/drawing/liveTileComposite.ts's comment to name `layoutLiveTiles`.
   * Repoint the `readFileSync` path in tools/perf/tests/xcuitest-actions.test.mjs from
     tiledRenderer.ts to tiledLayout.ts. It asserts `dataset.tileBacking` in the source text.

2. **web/src/lib/drawing/tiledUndoPatches.ts gains two exported functions.**
   * `undoPatchesFitTiles(snapshots, tiles)`.
   * `restoreUndoPatches(tiles, snapshots, pendingIndices, prepareTile)`, using a type-only
     `LiveTile` import and `resetCrayonStateForClear` from crayonPassBuffer.
   * `undoTiledCommand` keeps the branch between blank restore, patch restore and repaint.

3. **`createTiledUndoPatches` gains `enforceBudget(history, undoableCommands, paperBytes)`, which
   returns the trimmed count.**
   * It imports `MIN_TILED_UNDO_COMMANDS` and `TILED_UNDO_PATCH_BUDGET_PAPER_MULTIPLE` from
     tiledHistoryLimits itself.
   * The -0 slice-offset comment moves with it. Drop or localize its "same value
     repaintTiledRenderer computes" clause.
   * The renderer keeps a thin `enforceUndoPatchBudget()` wrapper that computes `paperBytes` from
     `liveTiles`. The clearCapture `onComplete` still references it.

4. **In place in the renderer.** Add a local `pushUndoableCommand(command)` helper: push, clamp to
   `MAX_UNDO_DEPTH`, enforce the budget, schedule the fold. It replaces the copies in `commitUndo`,
   `commitTiledCommand` and `clearTiledRenderer`, and `crop` stays before the push.

5. **Docs.** Add tiledLayout.ts to the module map comment in engine.ts (lines 15-16) and to the
   source map in docs/ARCHITECTURE.md.

6. **Verification.**
   * Re-count with `max-lines` set to 425.
   * Run the tiledRenderer*.test.ts files, tiledUndoPatches.test.ts, liveTileComposite.test.ts,
     `npm run test:tools` (for xcuitest-actions and check-release-seams), `npm run check` and
     `npm run lint`.
   * Optionally add tiledLayout.test.ts.

**Risks (proposer):** Bundle boundary: tiledRenderer is reached through static imports from
engine.ts and strokeSnapshot.ts, and the new tiledLayout.ts is imported only by tiledRenderer. So
the move adds no new edge from the startup path and shouldn't re-partition chunks. Still, run
web/tests/startup-bundle.spec.ts or at least a build to confirm.

The comment on tile.canvas.dataset.tileBacking is load-bearing drift evidence (liveTileComposite.ts
and tiledRendererContract.test.ts reference it). It has to move with the loop, and the reference in
liveTileComposite.ts line 28 should name the new owner if it points at the renderer.

The comment at the end of enforceUndoPatchBudget says "undoableStart is the same value
repaintTiledRenderer computes". Once the function moves, reword it to name repaintTiledRenderer in
tiledRenderer.ts, or pass undoableStart in, so it doesn't become an unenforced cross-file claim.

Module-scope state convention: backingMigration moves behind a createX() factory, which the
conventions require. No *ForTests exports.

Tests: the existing tiledRenderer*.test.ts files (UndoBudget, BlankUndo, Contract, FoldFlush) drive
these paths through the public renderer API and tiledRendererTestHarness, so they keep covering
behaviour unchanged. New colocated unit tests for layoutLiveTiles and restoreUndoPatches are
optional additions in tiledLayout.test.ts and tiledUndoPatches.test.ts. Placement rules are
satisfied.

Update the module map comment in engine.ts (lines 15-16) and the web/src/lib/ source map in
docs/ARCHITECTURE.md to list tiledLayout.ts.

tiledUndoPatches.ts grows from about 123 to about 180 physical lines, which is well under the cap.

Behavioural hazard: resizeTiledRenderer's else branch bumps backingMigration.revision to cancel an
in-flight migration. The factory's cancel() has to preserve that exact revision-bump semantic, and
detachTiledRenderer's reset has to preserve it too.

Headroom: about 411 is a projection from line counts. Re-count after the edit with
`npx eslint --rule 'max-lines: [error, {max: 425, skipBlankLines: true, skipComments: true}]'`.

## `web/tests/flows-settings.spec.ts` (498 / 500)

**Reviewer (revise):** The seam is sound and I'd keep it. I got 498 counted lines for the whole file
(ESLint max-lines rules: blank and comment lines skipped) and 129 for the block from line 310
to 511. That block is the orientation-gate comment, the 'settings on a rotatable device' describe
with its 4 tests, the desktop test, and the lock-incapable test. It is cohesive, not a split made
just to hit the number. The comment above the desktop test already says it and the touch describe
"together are the whole web gate". All three blocks check how the compact quick-toggle grid is built
and whether the Orientation picker appears. What stays is the settings shell: the table of contents
and pane, the sidebar, the theme picker, Sound, What's New and About, AI key persistence, bug
reports, and the phone drill-in header. Keeping it out of orientation-picker.spec.ts is also right,
because that file applies test.use({ hasTouch: true }) to every test, and the desktop and
stubbed-Capacitor tests need the default fine-pointer context. It's a .spec.ts in web/tests,
test-only code, so it crosses no bundle boundary and needs no snapshots.

Corrections: (1) The import cleanup is missing one name. enterFullscreen is used only at lines 320
and 363, both inside the moved block, so it becomes unused too. Leaving it in would fail lint. Three
import lines go (the whole AI_ACCESS_TOKEN_PARAM import line, enterFullscreen, and
resizeInFullscreen), so the file lands at 498 - 129 - 3 = 366, not 367. The `type Page` import is
still used by scrollPaneToTop, so it stays in the original, and the new file needs it too for
openSettingsModalCompact. (2) The ADR-0031 risk item is wrong. I ran ESLint with no-extend-native on
the file. The only 2 hits are lines 263 and 266, the Date.prototype.toLocaleDateString and
toLocaleString assignments in the What's New test, which stays. The
Object.defineProperty(Screen.prototype, ...) stub is not a hit. ADR-0031's sentence stays accurate
and must not be edited. (3) Move the orientation-gate comment block at lines 310-314 with the
describe. It is counted as comments already, so the totals don't change. (4) The references that
stay valid are ADR-0061 line 148 (the sidebar invariants stay), the SegmentedPicker.svelte comment
at line 255 (the feedback-picker test stays), flows-settings-report.spec.ts line 7, and
settings-hub.spec.ts line 14. docs/ORIENTATION.md around line 138 does need a new bullet for the new
spec. The new file will be about 129 moved lines plus about 9 import lines, roughly 138 counted.

**Recommendation:**

Split. Move lines 310-511 of web/tests/flows-settings.spec.ts to a new
web/tests/settings-quick-toggles.spec.ts. That is the orientation-gate comment, the
test.describe('settings on a rotatable device') block with test.use({ hasTouch: true }) kept inside
the describe and its 4 tests plus the openSettingsModalCompact helper, the desktop 'no Orientation
picker in either shell' test and its comment, and the lock-incapable 'mini About cell' test and its
comment.

The new file imports `expect, test, type Page` from @playwright/test, AI_ACCESS_TOKEN_PARAM from
../src/lib/inviteLink, and enterFullscreen, gotoApp, openSettingsModal, resizeInFullscreen from
./helpers. In the original, remove the AI_ACCESS_TOKEN_PARAM import line and the enterFullscreen and
resizeInFullscreen names from the ./helpers import. In the moved desktop test's comment, change "the
touch-emulated describe above" to "the touch-emulated describe in this file". Add the new spec to
the orientation spec list in docs/ORIENTATION.md. Leave ADR-0031 alone, because both
no-extend-native hits (Date.prototype, lines 263 and 266) stay in flows-settings.spec.ts. Projected
size: 366 counted lines for flows-settings.spec.ts, 134 under the 500 cap and under the 425 soft
target, and about 138 for the new spec.

**Risks (proposer):** The measured block is 129 counted lines. The original drops from 498 to about
367 once the two now-unused imports go (AI_ACCESS_TOKEN_PARAM and the resizeInFullscreen named
import), leaving about 133 lines of headroom under the 500 cap. That is well past the 75-line goal
and under the 425 soft target. The new file is about 135 counted lines.

Stale references to update in the same change: (1) ADR-0031
(docs/adrs/0031-linting-formatting-and-ci-quality-gates.md, around line 68) says both
`no-extend-native` hits are `page.addInitScript` instrumentation in
`web/tests/flows-settings.spec.ts`. One of them, the Screen.prototype stub at line 488, moves to the
new file, so the sentence should name both files. That is a docs/ edit, not generated. (2)
docs/ORIENTATION.md lists the specs that cover orientation branches but not this block. Add the new
spec to that list. (3) Check docs/TESTING.md and any spec index for a per-file inventory.
Unaffected: flows-settings-report.spec.ts and settings-hub.spec.ts refer to flows-settings.spec.ts
for tests that stay there (report-lands-after-reopen and TOC/pane).

Placement: the new file is a .spec.ts in web/tests, so it passes
tools/tests/test-file-placement.test.mjs. The name is dot/dash-consistent with the other
settings-*.spec.ts siblings, and there is no bundle boundary since this is test-only code.

Behaviour: test.use({ hasTouch: true }) must stay scoped to the describe and not become file-level.
The desktop and lock-incapable tests depend on the default fine-pointer context.

Sharding: the CI shard distribution and the full-suite timing for this file will change a little,
with no functional effect.

Fallback: the report pair (lines 589-669, 62 counted) could move into flows-settings-report.spec.ts,
which already covers in-flight reports. That only reaches about 436, so the quick-toggle seam is the
better cut.

## `web/src/lib/actionButtonLayout.test.ts` (497 / 500)

**Reviewer (endorse):** I read the file and measured each region myself (nonblank, non-comment
lines, the same way ESLint max-lines counts them). The file is at 497. The formula region, lines
330-495, is 140. publishActionPanelState is 83. The device harness at lines 49-82 is 26. The
proposer's figures for all of these are correct.

The seam is real and not driven by the counter. The block has its own lead-in comment and its own
helpers: CSS_TOKEN_PATTERN, cssValue, FormulaInputs, tokenizeCssLength, evaluateCssLength, appCss
and sizeFormula. It also has its own fixtures (BUTTON_SIZE_FIXTURES) and a single describe. No other
describe uses any of those helpers. Its job is to evaluate app.css as a drift guard, which is
different from the rest of the file, which tests the TS layout API. It also fits the existing
dot-joined siblings (fallback, toolDrawer, touchTargets), and all of them are small (223, 88 and 75
lines).

One factual error: the proposal says 7 import lines leave the original file. Only 4 do:
readFileSync, resolve, ACTION_BUTTON_BASE_PROPERTY and ACTION_BUTTON_GAP. The other three are still
used after the move:

* PALETTE_LANDSCAPE_WIDTH_PX at lines 214 and 224
* PALETTE_BAR_RESERVE at line 229
* ACTION_BUTTON_COUNT_PROPERTY at lines 510 and 580, inside publishActionPanelState

That puts the result at 497 - 140 - 4 = 353, not 350. It is still 72 under the 425 soft target and
147 under the cap, so the verdict doesn't change.

The harness copy is justified. availablePerButton and actionButtonBase read layoutState, meaning
viewport, orientation, safe area and size class. They do not read settings, so resetState isn't
needed and the new file only needs:

* the hoisted device
* vi.mock('./platform/safeArea')
* setViewport
* the matchMedia stub plus the layoutState dispose/install

vi.mock has to live in each file because of hoisting, so a shared helper module can't replace the
copy. Since the formula fixtures never use phone landscape, the stub could be simplified to always
return false. Keeping it identical to the original is also fine.

Other checks:

* Test placement is fine: a colocated .test.ts under web/src.
* No bundle boundary, snapshot or ADR is affected; only test code moves.
* readFileSync still resolves against cwd=web, as it does today.

Stale comments the move would leave behind:

* These three name actionButtonLayout.test.ts as the file that evaluates the formula, so they must
  be repointed to the new file: web/src/app.css:656,
  web/src/lib/actionButtonLayout.fallback.test.ts:58 and web/src/lib/actionButtonLayout.ts:8 and
  :188.
* actionButtonLayout.ts:61 is already stale. It says actionButtonLayout.test.ts "pins what a
  parent's smallest Button Size leaves", but that check lives in
  actionButtonLayout.touchTargets.test.ts, which the base test file itself points to at lines
  326-327. It should be fixed in the same change.

The opposite verdict, raising the cap, would be worse because the seam is clean. Moving only
publishActionPanelState would leave about 414 lines, which gives too little headroom.

**Recommendation:**

Split. Create web/src/lib/actionButtonLayout.cssFormula.test.ts and move the lead-in comment and
everything from lines 330-495 into it: CSS_TOKEN_PATTERN, cssValue, FormulaInputs,
tokenizeCssLength, evaluateCssLength, appCss, sizeFormula, BUTTON_SIZE_FIXTURES and describe('the
app.css --action-btn-size formula'). That is 140 counted lines.

Four imports leave the original file with it: node:fs readFileSync, node:path resolve,
ACTION_BUTTON_BASE_PROPERTY and ACTION_BUTTON_GAP. Keep PALETTE_LANDSCAPE_WIDTH_PX,
PALETTE_BAR_RESERVE and ACTION_BUTTON_COUNT_PROPERTY in the original; later tests still use them.

Give the new file its own copy of the layout harness, about 26 lines: the hoisted device,
vi.mock('./platform/safeArea'), setViewport, and the beforeAll matchMedia stub with the layoutState
dispose/install. It does not need resetState. The new file comes to about 175 counted lines.

Update the comments at web/src/app.css:656, actionButtonLayout.fallback.test.ts:58 and
actionButtonLayout.ts:8 and :188 to name the new file. Fix the already-stale
actionButtonLayout.ts:61 to point at actionButtonLayout.touchTargets.test.ts. Then run both test
files alone. The original ends at about 353 counted lines, 72 under the 425 soft target, and the cap
stays at the default 500.

**Risks (proposer):** 1) Comments that name actionButtonLayout.test.ts as the file that evaluates
the formula must be updated to name the new file, or they will point to the wrong place:
web/src/app.css:656, web/src/lib/actionButtonLayout.fallback.test.ts:58,
web/src/lib/actionButtonLayout.ts:8 and :188. Check line 61 of actionButtonLayout.ts too; its "pins
what a parent's smallest" wording may already refer to touchTargets. 2) The duplicated harness must
keep the `vi.mock('./platform/safeArea')` + hoisted `device` pattern and re-install layoutState on
the matchMedia stub (jsdom has no matchMedia). The formula depends on zero safe-area insets, which
the mock default gives. It does not need the settings resetState, because availablePerButton takes
buttonCount explicitly. Verify by running the new file alone. 3) The test-placement guard
(tools/tests/test-file-placement.test.mjs) is satisfied: the new file is a colocated .test.ts under
web/src. Use dot-joined naming. There is no bundle-boundary or ADR impact because only test code
moves. 4) readFileSync of 'src/app.css' relies on process.cwd() being web/, the same as today. 5)
Per the user's request, no max-lines-per-function or describe-skipping change is involved; this
proposal only addresses file-level max-lines.

## `web/src/lib/drawing/aiImage.test.ts` (497 / 500)

**Reviewer (endorse):** I checked the file myself and the plan's numbers hold. ESLint max-lines
counting (blank and comment lines skipped) gives 497 for the whole file. The
`describe('generateAiImage upload format')` block at lines 419-543 counts 97, so the original drops
to exactly 400. That is under the 425 soft cap, with 100 lines of headroom against the 500 cap.

**The seam is real, not just a way to satisfy the counter.** The block's two helpers,
`stubWebpEncoder` and `uploadedImage`, are used only inside it. It doesn't use `expectPhase`,
`REPORT_TOKEN_HEADER`, `CLIENT_REQUEST_TIMEOUT_MS` or `CONTENDED_HOST_TEST_TIMEOUT_MS`. The only
shared helper it needs is the 3-line `okResponse`. The other describes test lifecycle and outcomes:
ownership and staleness, response status and auto-save, the deduper, and retry. This block tests
what goes out on the wire: the WebP transcode and its capability probe, raw body and Content-Type
agreeing (ADR-0064), and the credential and free-balance headers.

**The dot-joined sibling has a precedent.** `aiImage.saveFailure.test.ts` already copies the hoisted
mocks and `vi.mock` setup this way, so the new file isn't a new pattern. Placement (a `.test.ts`
next to its source under `web/src`) passes the test-file-placement guard. No bundle boundary,
snapshot, or production import is involved.

**Things the plan gets right or should tighten:**

1. **`beforeEach` must keep `vi.resetModules()`.** Two things rely on it:
   * The probe-once test needs a fresh memoized WebP probe each time.
   * The absent-header test expects `freeGenerationsState.remaining` to start at the fresh default
     of 10.
2. **`beforeEach` must also reset the settings mocks:**
   * `autoSaveAiEnabled` back to false, because the first test sets it to true.
   * `aiAccessToken` back to `'test-token'`, because the pseudonym test clears it.
3. **The `createObjectURL` / `revokeObjectURL` spies are required.** jsdom doesn't provide
   `createObjectURL`, and `generateAiImage` makes object URLs for its results.
4. **Keep the default `saveImageBlob` mock.** The copied hoisted mock must still resolve
   `{status:'downloads'}`, because the first test auto-saves and then reads
   `saveImageBlob.mock.calls`.
5. **`afterEach` needs `restoreAllMocks` and `unstubAllGlobals`.** These tests spy on
   `HTMLCanvasElement.prototype` methods and stub `createImageBitmap` and `fetch`.

**Minor points:**

* The ownership describe (line 74) also stubs `toDataURL`. That is just setup it needs; it doesn't
  test the upload format and stays where it is.
* The response-handling test at line 300 also reads `freeGenerationsState`, but it tests how the 429
  exhausted-limit outcome is handled, not a request header. The line between the two files is still
  clean.
* `.request` is the better name than `.upload`, because the last two tests are about credential
  headers. Splitting the block into two describes inside the new file is optional and costs about 2
  lines.

**Size of the new file:** about 34 counted lines of setup (2 imports, an 11-line hoisted mocks
block, 5 lines of `vi.mock`, `okResponse`, `beforeEach` and `afterEach`) plus 97 moved lines, so
about 131.

**Why not raise the cap instead:** the file mixes two distinct concerns and the extraction is cheap
and has a precedent. A raised cap would leave the file at 497 and still growing.

**Recommendation:**

Split. Move the whole `describe('generateAiImage upload format')` block from
`web/src/lib/drawing/aiImage.test.ts` (lines 419-543, 97 counted lines) into a new
`web/src/lib/drawing/aiImage.request.test.ts`. It goes with its private helpers `stubWebpEncoder`
and `uploadedImage` and all 5 tests: the WebP copy upload, skipping the transcode without a WebP
encoder, probing once across generations, the installation pseudonym, and the absent free-balance
header.

Build the new file's setup the way `aiImage.saveFailure.test.ts` does:

* imports: vitest, plus `import type { SaveResult }`
* the `vi.hoisted` mocks: `exportCanvasBlob`, a `saveImageBlob` that resolves
  `{status:'downloads'}`, and settings
* three `vi.mock` calls: `./engine`, `./screenshot`, `$lib/state/settings.svelte`
* a copy of `okResponse`
* `beforeEach`: `resetModules`, `clearAllMocks`, reset all three settings fields, and spy on
  `URL.createObjectURL` / `URL.revokeObjectURL`
* `afterEach`: `restoreAllMocks` and `unstubAllGlobals`

Optionally split the block into two describes, 'upload format' and 'free-generation credentials'.

The original file keeps `okResponse`, `expectPhase`, `REPORT_TOKEN_HEADER`,
`CLIENT_REQUEST_TIMEOUT_MS` and `CONTENDED_HOST_TEST_TIMEOUT_MS`, which are all still used there. It
ends at 400 counted lines against the 500 cap (100 lines of headroom, under the 425 soft cap). The
new file is about 131 counted lines. Don't add a "keep in sync" comment for the duplicated setup.

**Risks (proposer):** - **Duplicated scaffold:** the hoisted mocks and vi.mock scaffold (~30 lines)
is copied rather than shared. vi.mock factories are hoisted per file, so a shared import can't
simply replace them. The repo already accepts this with aiImage.saveFailure.test.ts. Do not add a
"keep in sync" comment. If the settings mock shape changes, both copies break loudly at type-check
or run time.

* **Shared module state:** the probe-once test depends on `vi.resetModules()` in beforeEach so the
  memoized WebP capability probe is fresh for each test. The new file's beforeEach must keep
  resetModules, or the test becomes order-dependent.
* **afterEach:** the new afterEach must call `vi.unstubAllGlobals()` and `vi.restoreAllMocks()`,
  because these tests stub `createImageBitmap` and `fetch` and spy on HTMLCanvasElement.prototype.
  The upload tests use no fake timers, so `useRealTimers` is optional.
* **Unused imports and constants:** after the move, check that `REPORT_TOKEN_HEADER` and
  `CLIENT_REQUEST_TIMEOUT_MS` are still used in the original file. They are used by the response and
  ownership describes and should stay. The new file should not import them, or lint will flag them
  as unused.
* **Test naming and placement:** the dot-joined name (`aiImage.request.test.ts`) and colocation
  under web/src satisfy tools/tests/test-file-placement.test.mjs and the naming convention.
  `.request` is a proposed name; `.upload` would also work.
* **No other constraints:** no bundle boundary or ADR is involved, since these are test-only files.
  ADR-0064's raw-body contract is still asserted by `uploadedImage`, which moves intact.
* **Headroom:** the original ends at about 400 counted lines against the 500 cap, 100 lines of
  headroom, under the 425 soft cap. The new file has more than 350 lines of headroom.

## `web/src/lib/drawing/magicBrush.test.ts` (497 / 500)

**Reviewer (endorse):** I checked the proposal against the file itself. Using ESLint's max-lines
rule (blank and comment lines skipped), the whole file counts 497. The
`describe('magic sheet worker raster')` block at lines 284-570 counts exactly 237. The other regions
count 40 (header plus rainbow gradient), 169 (fill-load failure) and 51 (letterbox geometry). The
proposal's numbers are right: about 260 remain in magicBrush.test.ts and about 238 go to the new
file (237 plus one vitest import line). That is well under the 425 soft cap and leaves 240 lines of
room under 500.

The seam is real, not driven by the line counter:

* The worker-raster block uses no file-scope symbols. Searching lines 284-570 for seededRand,
  edgeMargins, createRainbowGradient, PAGE_URL and PAPER finds nothing.
* It has its own WorkerImage, WorkerStub and WorkerOffscreenCanvas fixtures, its own
  beforeEach/afterEach, and it loads the module dynamically after vi.resetModules().
* It tests a separate concern: the off-thread transport through magicSheetRasterClient.
* magicBrushRetention.test.ts already splits out a concern the same way, with its own WorkerStub,
  WorkerImage and WorkerOffscreenCanvas.
* The dot-joined name follows the existing `aiImage.saveFailure.test.ts` and
  `screenshot.gallery.test.ts`.

Nothing breaks:

* Test placement is fine: it stays colocated under web/src with a .test.ts suffix.
* There is no bundle boundary, because the code is test-only.
* No snapshots are involved, and no ADR applies.

The only reference to the test file in the repo is the comment at
web/src/lib/drawing/magicBrush.ts:72, and the proposal already flags it. It needs rewording.
CLAUDE.md warns against comments that restate mutable facts such as paths. Something like "the
pattern the stateful describes in the magicBrush*.test.ts suites use" avoids going stale on the next
split.

Raising the cap instead would be wrong here. The file holds four unrelated suites, so it isn't one
cohesive unit.

Minor points that don't block the split:

* (a) The rainbow-gradient describe tests only magicSheetGradient.ts. It could move to
  magicSheetGradient.test.ts later, but the split doesn't need it.
* (b) The new file and magicBrushRetention.test.ts will each carry near-duplicate WorkerStub,
  WorkerImage and WorkerOffscreenCanvas fixtures. Sharing them through a test-helper module is
  possible follow-up work, but it isn't needed for headroom and the duplication already exists
  today.

**Recommendation:**

Split. Move the whole `describe('magic sheet worker raster')` block
(web/src/lib/drawing/magicBrush.test.ts lines 284-570, 237 counted lines) into a new colocated file,
web/src/lib/drawing/magicBrush.workerRaster.test.ts. Give it the header
`import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';`. The new file comes to
about 238 counted lines, and magicBrush.test.ts drops from 497 to about 260 (240 lines of room under
the 500 cap). In the same change, reword the comment at web/src/lib/drawing/magicBrush.ts:71-72 to
cover both suites, for example "magicBrush*.test.ts", so it doesn't name a single file. Keep the cap
at the default 500.

**Risks (proposer):** 1) A comment in web/src/lib/drawing/magicBrush.ts at lines 71-72 says the
vi.resetModules() + `await import('./magicBrush')` pattern is the one "every stateful describe in
magicBrush.test.ts uses". After the split it must name both files, for example "magicBrush.test.ts
and magicBrush.workerRaster.test.ts" (or magicBrush*.test.ts), or it goes stale. Update it in the
same change. 2) Test placement: the new file stays colocated under web/src/lib/drawing with a
.test.ts suffix, so it passes tools/tests/test-file-placement.test.mjs. The dot-joined name follows
the repo's multi-aspect test-name convention. 3) Isolation stays the same: each file already resets
modules per test, and Vitest runs each file in its own module graph. 4) The original file's vitest
import list is unchanged, since fill-load failure still uses beforeEach, afterEach and vi. 5) There
are no bundle-boundary or ADR constraints, because this is test-only code. 6) Optional follow-up
with no bearing on the cap: the rainbow-gradient describe (30 lines plus seededRand) tests only
magicSheetGradient.ts and could move to a colocated magicSheetGradient.test.ts, bringing the
original to about 220. It is not needed to reach the 425 target.

## `web/src/lib/actions/scribbleTap.test.ts` (496 / 500)

**Reviewer (revise):** The seam is real and the numbers check out, so I'd keep the split but change
where the tests land.

What I checked:

* **Line count:** ESLint max-lines (skipBlankLines/skipComments) reports 496 for scribbleTap.test.ts
  and 92 for scribbleTapViewport.test.ts.
* **Moved region:** lines 450-571 count 117 non-blank, non-comment lines. Removing that block plus
  the import on line 2 gives 496 - 117 - 1 = 378. That is 47 under the 425 soft target and 122 under
  the 500 cap.
* **Cohesion:** it is genuine. Only these five tests use `vi.useFakeTimers()`,
  `POINTER_RESUME_GAP_MS` or `POINTER_RESUME_JUMP_RATIO`, and all of them drive the pen-only
  idle-gap-plus-jump branch in scribbleGuard. Every other test covers the ordinary press, release
  and click lifecycle.
* **No constraint is broken:** there is no bundle boundary, snapshot, ADR or import-graph issue.
  Placement (colocated `.test.ts` under web/src) and the no-"should" rule are fine.

Corrections to the risk list:

* The flushSync/forgetPenPointer mocks and their resets must stay in scribbleTap.test.ts. flushSync
  is still asserted at line 58, and the engine mock keeps scribbleGuard's engine import cheap. So
  only the strokeMath import goes away.
* After the move, `vi.useRealTimers()` in the main afterEach is dead, because no remaining test uses
  fake timers. Removing it is optional tidying.

The revision: move the tests into the existing pen-only file instead of creating a third harness
copy. scribbleTapViewport.test.ts already exists only for this branch. Its 'measures the viewport
once per press, not once per pen move' test measures the `viewportSide` that the resume-jump rule
consumes. Its harness is already the same mocks plus pointerEvent and tapElement, so it needs only
small changes:

* `tapElement` returns `activate` (a `vi.fn()`) as well.
* The afterEach adds `vi.useRealTimers()`, `flushSync.mockReset()` and
  `forgetPenPointer.mockReset()`.

This gives two coherent files instead of three copies of a roughly 33-line harness.

Two optional extras:

* Rename the file to scribbleTap.penResume.test.ts with `git mv`, so the name covers both describes.
* Hoist the `jump` expression, repeated four times, into a local `resumeJumpPx()` helper.

The merged file comes to about 215 counted lines: 92 + 117 + about 4 harness lines + the import.
Both files end up well under 425.

A raised cap would be the wrong call. The file would sit at about 571, and it contains two distinct
responsibilities, one of which already has a home.

**Recommendation:**

Split along the proposed seam, but move the pen-resume tests into the existing pen-only test file
rather than a new third file.

1. Move these five tests from web/src/lib/actions/scribbleTap.test.ts (lines 450-571, 117 counted
   lines) into web/src/lib/actions/scribbleTapViewport.test.ts, as a second describe block called
   'scribbleTap pen resume':
   * 'handles a missing lift after the engine capture listener and before target drawing'
   * 'does not mistake a continuous pen drag for an omitted-up tap'
   * it.each 'falls back to drag classification when the viewport side is %s'
   * 'does not reinterpret a dragged pen as a tap after a later idle jump'
   * 'consumes the first resumed pen move after synchronously activating'
2. Optionally rename that file to scribbleTap.penResume.test.ts with `git mv`.
3. Move the `POINTER_RESUME_GAP_MS`/`POINTER_RESUME_JUMP_RATIO` import along with the tests.
4. Extend the destination harness:
   * `tapElement` creates `activate = vi.fn()` and returns `{ el, activate, action }`.
   * The afterEach adds `vi.useRealTimers()`, `flushSync.mockReset()` and
     `forgetPenPointer.mockReset()`.
   * Optionally, a local `resumeJumpPx()` helper replaces the four repeated jump expressions.
5. In scribbleTap.test.ts:
   * Drop the strokeMath import.
   * Keep the flushSync/forgetPenPointer mocks and resets, since flushSync is still asserted at
     line 58.
   * Optionally drop the now-dead `vi.useRealTimers()`.

Projected sizes: scribbleTap.test.ts goes from 496 to 378 counted lines (122 under the 500 cap, 47
under the 425 soft target). The pen file goes to about 215. No cap change is needed, and no
bundle-boundary, placement, snapshot or ADR constraint is affected.

**Risks (proposer):** 1. There will be three copies of the harness (pointerEvent/tapElement/mocks),
since scribbleTapViewport.test.ts already duplicates it. You could extract pointerEvent and a
tapElement factory (taking the tapActions set) into a colocated non-test helper module. Two things
would have to be checked first: whether tools/tests/test-file-placement.test.mjs and lint:dead
accept a test-only .ts helper under web/src, and the per-file vi.mock/vi.hoisted blocks must stay in
each test file anyway. Keeping the duplication matches the precedent already set and avoids that
question. 2. The moved tests need their own afterEach that calls vi.useRealTimers(),
vi.restoreAllMocks(), flushSync.mockReset() and forgetPenPointer.mockReset(). Without it, fake
timers or mock order recorders leak between tests. The viewport file's afterEach does not reset
timers, so it cannot be copied unchanged. 3. After the move, drop the now-unused strokeMath import
from scribbleTap.test.ts, or lint fails on an unused import. 4. There are no bundle-boundary,
snapshot or ADR constraints: this is test-only code and no spec depends on the file name. 5. The
test titles contain no "should", and the dot-joined name scribbleTap.penResume.test.ts follows the
prose naming convention. Projected result: 496 - 117 - 1 = 378 counted lines, 122 under the 500 cap
and 47 under the 425 soft target. The new file sits at about 150.

## `web/src/routes/design/+page.svelte` (496 / 500)

**Reviewer (revise):** The seam is real and the numbers check out. The sticky header is a
self-contained chrome block: the theme pill, the label, the brand link, and the contents row. Its
styling (--header-row-height, the pill re-skin, the 44px option floor, the header-toc gutter, and
the 479px/389px collapses) is used only by that block. Page-wide state enters through four inputs
(theme, tocItems, active, !entered), and one element ref goes back out.

Measurements on web/src/routes/design/+page.svelte:

* The file has 513 nonblank lines. Subtracting the 17 JS comment lines gives 496, which matches
  ESLint's count. That confirms CSS and HTML comments are counted and move with the markup.
* Region counts: header markup 164-193 = 30, styles 318-390 = 64, media plus comment 541-556 = 15,
  themeOptions = 4.
* Script imports removed: SegmentedPicker (3 lines), BrandMark, TocDisclosure, ResolvedTheme,
  setTheme and deferredIcons (1 each), for 12 lines including themeOptions.
* Projection: 496 - 30 - 64 - 15 - 12 + about 7 for the component tag + 1 import line + about 1 for
  a spec-naming comment on --heading-park = about 384. That is under the 425 soft target with room
  to spare, and close to the proposal's 386. The new component is about 120 counted lines.

Checks that hold:

* Moving the deferredIcons import is correct. theme-light and theme-dark live in
  lib/icons/deferred/, and deferredIcons.test.ts requires any file that names a deferred icon to
  import the registry itself. After the move the page names no icon literals.
* Keeping the 980px hide rule in the page as `.page :global(.site-header .header-toc)`, next to the
  `.toc` show rule, is the right call.
* The `element = $bindable()` prop pattern already exists (ParentalGateKeypad plus ParentalGate's
  `bind:element`).
* The spec selectors in design.spec.ts, button-states.spec.ts and design-navigation.spec.ts all
  target class names that stay the same.
* There is no bundle-boundary issue because /design is a lazy route. Test placement and ADRs are
  unaffected.

Revision: risk (3) says to keep siteHeader as a "plain untracked ref". bind:this on a plain `let` is
fine. A component-prop `bind:element={siteHeader}` on a plain `let` in runes mode is not the pattern
the codebase uses: ParentalGate declares `let keypadEl = $state<HTMLDivElement>()`. It may also
produce a svelte-check non_reactive_update warning, and per repo memory warnings can fail CI
Quality. Declare it `let siteHeader = $state<HTMLElement>()` and delete the "Plain element ref"
comment. The only reader is the rAF-scheduled spy callback, so the effect does not track it and
nothing starts reacting to it.

Minor points:

* The .page element's inherited font-size, line-height and color still reach the child. Inheritance
  crosses component boundaries, so no styles are lost.
* The header comment that says 980px is the breakpoint stays in the page, which is correct.

Raising the cap would be worse: the file really does have two jobs, and this seam gives more than 75
lines of headroom.

**Recommendation:**

Split along the proposed seam into a new web/src/lib/components/styleguide/StyleguideHeader.svelte.

What moves:

* The `<header class="site-header">` markup (lines 164-193), with its HTML comment.
* The themeOptions constant.
* The SegmentedPicker (and its type), BrandMark, TocDisclosure, ResolvedTheme and setTheme imports,
  plus `import '$lib/components/deferredIcons'`.
* The styles at lines 318-390: the z-index comment, .site-header with --header-row-height,
  .header-row, .header-left, .header-label, both .theme-toggle picker rules, .header-brand, and the
  `.site-header :global(.header-toc)` gutter.
* The 479px and 389px media blocks with their comment (lines 541-556).

Props: theme, items, active, showCount, and `element = $bindable()` on the root `<header>`. The
component's root stays the `<header>` element with no wrapper, so it is still the direct sticky
child of .page.

What stays in +page.svelte:

* The section registry, PART_LABELS, and tocItems.
* The scrollspy and revealSidebarEntry.
* The sidebar, hero, defaults aside, part dividers, and footer.
* The layout variables --heading-park, --spy-shallowest-line and --shell-tail. Add a comment on
  --heading-park naming design-navigation.spec.ts as the guard.
* The 980px pair, with the hide rule rewritten as
  `.page :global(.site-header .header-toc) { display: none }` next to `.toc { display: block }`.

Change from the proposal: declare `let siteHeader = $state<HTMLElement>()`, following ParentalGate's
keypadEl, instead of a plain `let`. Binding a component prop to a plain `let` is not the codebase
pattern and may produce a svelte-check warning. The rAF spy is the only reader, so nothing reacts to
it.

Keep the class names .site-header, .header-label, .header-toc and .theme-toggle unchanged, because
the specs select on them.

Projected result: +page.svelte at about 384 counted lines (hard cap 500 unchanged), and
StyleguideHeader.svelte at about 120.

**Risks (proposer):** (1) The 980px breakpoint pair has to stay in one file. The rule that hides the
header contents row at min-width 980 must switch at the same width as the rule that shows the .toc
sidebar. Keep that rule in +page.svelte next to the sidebar rule, pinned as
`.page :global(.site-header .header-toc)` (a class passed into a child component, which svelte.md
allows). Do not duplicate 980 inside the new component, or two files have to agree on it with
nothing enforcing that. (2) Header height and page offsets end up in different files. The page's
--heading-park (96px, and 160px below 979px) and --spy-shallowest-line (140px) are derived from the
header's 72px --header-row-height, which moves out. Today the three values sit in one file and
nothing checks them; after the split they are in two. The empirical guard is
design-navigation.spec.ts, which measures the live .site-header bottom against section arrival. Name
that spec in a comment on --heading-park instead of writing a "keep in sync" note. (3) The scrollspy
reads the header element's bottom edge, so the component must expose its root <header> through a
$bindable `element` prop. That prop has one writer, and the page keeps a plain untracked ref, as it
does now. (4) The header must stay the direct sticky child of .page. A component whose root element
is <header> keeps that, so no wrapper div. (5) `theme` stays derived in the page (the hydration flag
plus resolvedTheme) because ColorSections and data.PrimitiveSections also use it. The header
receives it as a prop and calls setTheme itself. (6) There are no bundle-boundary concerns: /design
is a lazily loaded route, and the new file lives with the other /design-only components in
lib/components/styleguide/. PascalCase naming and the no-default-export rule for .svelte.ts do not
apply here. (7) Screenshot or visual specs of the /design header should be unchanged, because the
scoped styles move verbatim with their class names.

## `web/src/lib/drawing/crayonBrush.ts` (493 / 500)

**Reviewer (endorse):** I checked the plan against the file and it holds up. crayonBrush.ts counts
493 lines under max-lines rules (blank and comment lines skipped), against the default cap of 500 in
eslint.config.js line 431. Lines 683-813 count 85 by my measure, exactly as the plan says. With the
`import type { Point } from './strokeMath'` line removed as well, the file comes to 493 - 86 = 407.
The plan says 408, so it overstates by one line, which is harmless. That leaves 18 lines under the
425 soft target and 93 under the hard cap.

**The seam is real, not a shuffle to satisfy the counter.** CrayonPassTracker is pure polyline
geometry. It references nothing else in the module: no tooth fields, tile cache, options, or
patterns. `Point` from strokeMath is used only by the tracker. It already has its own banner, its
own tuning constants with WHY comments, and its own `describe` block with local helpers
(crayonBrush.test.ts lines 272-370).

**It belongs with the pass-boundary logic.** Its only production caller is crayonPassBoundaries.ts,
which does `new CrayonPassTracker(...)` at lines 69 and 96. That module's header already claims "the
split when a gesture re-covers its own strip". engine.ts uses the class only as a type (line 85,
`type CrayonPassTracker`, for the field at line 696). Once moved, crayonBrush.ts keeps one
responsibility: the paint source.

**Imports and bundling are safe.** The new module imports only a type from strokeMath and nothing
from crayonBrush, so no import cycle is possible. Both crayonBrush and crayonPassBoundaries are
already reached from engine.ts by static imports, and the engine's import is erased at build time.
So there is no new startup-path edge, and startup-bundle.spec.ts is a confirmation run only. No
snapshot tests are involved, and a colocated crayonPassTracker.test.ts satisfies the test-placement
guard.

**Small corrections to the plan:**

* **Architecture doc:** docs/ARCHITECTURE.md line 86 describes crayonBrush.ts without mentioning
  pass splitting, so that entry needs no fix. The doc has no crayonPassBoundaries entry either. The
  new module should get a source-map row, since new lib modules are expected to be listed.
* **Header paragraph:** in crayonBrush.ts, lines 42-51 of the header should not move wholesale. Its
  first half (a gesture re-covering its strip starts a new pass with a fresh seed, which the commit
  fold reproduces) explains how crayonBrush's seed and phase are used. Keep a one- or two-sentence
  summary there that names crayonPassTracker.ts. The geometry detail moves to the new module's
  header. This costs no counted lines.
* **`CrayonPoint` alias:** keep it exported from the new module, because the tests import it.
  Replacing it with `Point` would be a separate cleanup, not part of this split.

A cap raise would be the worse choice. The file has an obvious, already-marked second
responsibility, and a split is cheaper than moving the file's cap.

**Recommendation:**

Split along the plan's seam. Move the "Mid-stroke pass splitting" banner, its threshold comments,
the SPLIT_TURN_COS / *_FRACTION / MIN_*_PX / MIN_EXCLUDE_ARC_DIR_STEPS constants,
`export type CrayonPoint`, and `export class CrayonPassTracker` (crayonBrush.ts lines 683-813, 85
counted lines) into a new module, `web/src/lib/drawing/crayonPassTracker.ts`. The
`import type { Point } from './strokeMath'` line moves with them.

* **Header:** the geometry part of crayonBrush.ts header lines 42-51 becomes the new module's
  header. Leave a short summary in crayonBrush.ts that names crayonPassTracker.ts as the place where
  the split is detected.
* **Tests:** move crayonBrush.test.ts lines 272-370 (the splitter comment, WIDTH, runTracker,
  trackLine, and the CrayonPassTracker describe block) into a colocated
  `web/src/lib/drawing/crayonPassTracker.test.ts`. Drop CrayonPassTracker and CrayonPoint from the
  crayonBrush.test.ts import list.
* **Import rewires:** in crayonPassBoundaries.ts line 12, import from './crayonPassTracker'. In
  engine.ts line 85, move `type CrayonPassTracker` into a type-only import from
  './crayonPassTracker'. Optionally point crayonPassBoundaries.ts's header at the new module.
* **Docs:** add a docs/ARCHITECTURE.md source-map row for crayonPassTracker.ts. The ADRs need no
  edits.
* **Verify:** run npm run check, lint, and the unit tests, plus startup-bundle.spec.ts as a
  confirmation.

This takes crayonBrush.ts to 407 counted lines: 18 under the 425 soft target and 93 under the
unchanged 500 cap. No cap change is needed.

**Risks (proposer):** - **Bundle boundary:** crayonBrush.ts and crayonPassBoundaries.ts are both
already statically reachable from engine.ts. Moving the class to a sibling module in the same
directory adds no new startup-path edge. engine.ts imports the class type-only, so that import is
erased at build time. Even so, run the `web/tests/startup-bundle.spec.ts` check to confirm chunk
partitioning is unchanged.

* **Import cycles:** none. The new module imports only `type Point` from `./strokeMath` and imports
  nothing from crayonBrush.ts. crayonBrush.ts would no longer import strokeMath at all.
* **Test placement:** the new crayonPassTracker.test.ts is colocated under web/src, which satisfies
  `tools/tests/test-file-placement.test.mjs`. After the move, crayonBrush.test.ts drops from 370
  physical lines to about 270.
* **Docs:** ADR-0065 (line 113) and ADR-0146 (line 46) name `CrayonPassTracker` without a file path,
  so neither needs an edit. ADR-0004 line 88 lists crayonBrush.ts as an engine helper module; the
  new module can be added beside it, but this is optional because it is not an engine split.
  docs/ARCHITECTURE.md's `web/src/lib` source map should gain a crayonPassTracker.ts entry, and the
  crayonBrush.ts entry should stop claiming pass splitting if it currently does.
  crayonPassBoundaries.ts's header comment can then point to the tracker's module by name.
* **Other references:** tools/asset-gen/crayon-reference/capture-current-brush.mjs mentions the
  class only in a comment, so nothing there breaks.
* **Conventions:** named exports only. The new file is a camelCase lib module. The tuning constants
  keep their unit-suffixed names and their WHY comments.

## `web/src/lib/drawing/magicBrush.ts` (493 / 500)

**Reviewer (endorse):** I read the file myself and checked the proposal's numbers. The seam is real
and the numbers hold up.

* **Line counts are correct.** ESLint's max-lines rule (skipping blank and comment lines) counts
  magicBrush.ts at 493. I copied lines 39-41 and 263-424 into a scratch file and ran the same rule
  on them: 141 counted lines, exactly as the proposal says. The new import is one line, so
  magicBrush.ts lands at about 353. The proposal says 356, which is within noise. That is about 72
  under the 425 soft target and about 147 under the 500 cap.
* **The seam is cohesive, not a trick to beat the counter.** `EDGE_SAMPLE_INSET_FRACTION`,
  `EdgeFill`, `edgeMargins`, and `extendSheetEdges` never read the module-scope singleton (host,
  fillUrl, sheetCanvas, pending*). `edgeMargins` is already exported and tested on its own. It has
  two callers: `rasterizeFillOffThread` (line 169) and `extendSheetEdges`, which `rasterizeSheet`
  calls at line 456. The existing block comment already calls this code "pure geometry so the math
  is unit-testable". It follows the same pattern as the earlier split into magicSheetGradient.ts.
  The stateful lifecycle code stays in one place, which respects ADR-0004's singleton rationale.
* **Worker type duplication is real.** magicSheet.worker.ts:12-21 restates the EdgeFill shape
  inline. An `import type` from the new leaf module is erased at build time, so the worker bundle
  gains nothing and the duplicate type goes away. That is a real improvement.
* **Bundle boundary and imports are safe.** The new module imports nothing. magicBrush.ts already
  statically imports its magicSheet* peers, and no startup-path module imports it directly (grep
  finds only magicBrush.ts and its test). No cycle is possible. Running
  web/tests/startup-bundle.spec.ts is still a sensible check.
* **Tests are safe to move.** Only the 'letterbox edge extension geometry' describe block
  (magicBrush.test.ts:571-633) uses the static `import { edgeMargins } from './magicBrush'` at
  line 2. It can move to a colocated magicSheetEdges.test.ts, which satisfies the test-placement
  guard. Side benefit: magicBrush.test.ts also counts 497 against the 500 cap, so the move gives it
  roughly 55 lines of room (to about 442). That file will still need its own pass to get under 425.
* **No ADR is affected.** ADR-0043 and ADR-0089 describe the behaviour, not which file it lives in.

Minor notes:

1. Move the WHY comment on `EDGE_SAMPLE_INSET_FRACTION` together with the constant.
2. `extendSheetEdges` takes an `HTMLImageElement`, which is still DOM-typed. That is fine for a
   main-thread-only helper, but do not import that value from the worker.
3. Add a row for `drawing/magicSheetEdges.ts` to the lib/drawing source map in docs/ARCHITECTURE.md
   (next to lines 87-90).
4. Change the magicBrush.test.ts import on line 2 as well as moving the describe block, or lint's
   unused-import check will fail.

Raising the cap instead would be worse: the geometry is a clean, pure unit, and splitting it off
costs nothing.

**Recommendation:**

Split along the letterbox edge-extension geometry seam.

1. Create web/src/lib/drawing/magicSheetEdges.ts with named exports: `EDGE_SAMPLE_INSET_FRACTION`
   and its WHY comment, the `EdgeFill` interface with the explanatory block comment, `edgeMargins()`
   and `extendSheetEdges()`. That is about 141 counted lines.
2. In magicBrush.ts, add `import { edgeMargins, extendSheetEdges } from './magicSheetEdges'`.
3. Move the 'letterbox edge extension geometry' describe block (magicBrush.test.ts:571-633) into a
   colocated magicSheetEdges.test.ts, and drop the static `edgeMargins` import on line 2 of
   magicBrush.test.ts.
4. In magicSheet.worker.ts, replace the inline `edgeFills` element shape with
   `import type { EdgeFill } from './magicSheetEdges'` (type-only, so the worker bundle gains no
   runtime edge).
5. Add a docs/ARCHITECTURE.md source-map row for the new file.
6. Verify with `npm run lint`, `npm run check`, the unit tests, and startup-bundle.spec.ts.

Projected result: magicBrush.ts goes from 493 to about 353 counted lines, and magicBrush.test.ts
drops to about 442 as a side benefit. No cap change is needed.

**Risks (proposer):** Bundle boundary: magicSheetEdges.ts is a leaf module with no imports, reached
only through magicBrush.ts, which already statically imports its peer magicSheetGradient.ts. It adds
no new cross-chunk edge. Run web/tests/startup-bundle.spec.ts (or at least compare build chunk
output) to confirm the partition is unchanged. The worker must use `import type` only; a value
import would pull the module into the worker chunk, which is harmless but unintended. Import cycles:
none, because the new module imports nothing from magicBrush. Test placement: the new .test.ts is
colocated under web/src/lib/drawing, which tools/tests/test-file-placement.test.mjs requires. Named
exports only. Docs: docs/ARCHITECTURE.md's lib/drawing source map should gain a magicSheetEdges.ts
entry in the same change. ADR-0043 describes the edge extension as behaviour, not file placement, so
it needs no amendment; ADR-0004's module-singleton rationale applies to the state that stays in
magicBrush.ts. Behaviour does not change: projected 356 counted lines, roughly 141 moved out and
about 4 added for the import.

## `web/src/lib/storage.test.ts` (492 / 500)

**Reviewer (endorse):** I read web/src/lib/storage.test.ts myself and counted nonblank, non-comment
lines, the same way ESLint max-lines counts them. The file is at 492. The three blocks the plan
moves count as follows: reconcileStorageValues (lines 408-424) is 14, hydrateDurableStorage
(426-553) is 112, and onDurableRestore (555-583) is 27. That is 153 in total, so the plan's numbers
are right. Moving them leaves 339. `reconcileStorageValues` and `onDurableRestore` also drop out of
the import list, which brings the file to about 337, 163 under the 500 cap and 88 under the 425 soft
target.

The seam is real, not a shuffle to satisfy the counter. The moved blocks cover the boot-time
reconcile policy, the hydrate/restore contract (including its throw-resilience and back-fill cases)
and the restore-notification fan-out. What stays behind covers the synchronous helpers, removeKey,
throwing localStorage, the native mirror and the capture mailbox.

I checked the harness dependencies. The moved tests use `ctrl`, `prefsStore` and `prefsSetFailure`;
the last is needed by the "concurrent back-fill fails" test at line 539. They never touch
`prefsRemoveFailure` or `prefsRemoveHold`. None of the moved tests create a pending removal, so a
plain `remove` in the new file's Preferences mock is safe.

The seam has one soft edge the plan should say out loud. Seven of the removeKey tests also call
`hydrateDurableStorage` to check how pending removals are handled during a restore. Keeping them in
storage.test.ts is correct because they need the remove-failure and remove-hold harness and they
test removeKey's durability contract. But it means "hydrate" is not tested only in the new file. The
new file's name and header comment should present it as the restore/notification contract, not as
the only place hydrate is tested. I also considered moving the removeKey tests together with hydrate
(about 290 counted lines). That would make the new file roughly as large as the original and copy
the whole harness, so it is worse.

Other checks:

* **Placement:** a colocated `.test.ts` under web/src/lib passes test-file-placement.
* **Naming:** dot-joined names already exist next to it (`storage.restore.integration.test.ts`,
  `theme.applyTheme.test.ts`).
* **Test environment:** the new file touches localStorage, so it must stay on the happy-dom default.
  Do not add `@vitest-environment node`.
* **Boundaries and ADRs:** test-only changes, so no bundle boundary or ADR is affected, and there
  are no snapshots.
* **References to update:** storage.restore.integration.test.ts line 7 ("storage.test.ts proves
  hydrate *invokes* registered callbacks") must point to the new file. Line 20 ("mirrors
  storage.test.ts") can point to either file. Line 13 stays accurate as written.
  docs/scratchpad/flake-hunt-2026-09-22.md mentions storage.test.ts, but it is a historical record
  and should not be edited.
* **Opposite verdict:** raising the cap is not better. The file has a cohesive split available, and
  at 492 against 500 there is no reason to grandfather it.

**Recommendation:**

Split. Move describe('reconcileStorageValues'), describe('hydrateDurableStorage') and
describe('onDurableRestore') (lines 408-583, 153 counted lines) into a new colocated
web/src/lib/storage.hydrate.test.ts.

The new file gets a header of about 33 counted lines:

* the vitest import
* the hoisted `ctrl` with its `$lib/platform` mock
* the hoisted `prefsStore` and `prefsSetFailure`
* a trimmed `@capacitor/preferences` mock: `get`; a `set` that throws when `prefsSetFailure.key`
  matches; a plain `remove`
* an import of STORAGE_KEYS, reconcileStorageValues, hydrateDurableStorage and onDurableRestore from
  './storage'
* a `beforeEach` that clears localStorage and prefsStore, sets `prefsSetFailure.key = null` and
  `ctrl.native = false`

It stays on the happy-dom environment. Its header comment should say it covers the restore contract
and notification fan-out, and that pending-removal-during-restore cases stay with removeKey in
storage.test.ts because they need the remove-failure and remove-hold harness.

storage.test.ts keeps its full harness and its `hydrateDurableStorage` import, which the removeKey
tests still use. Only `reconcileStorageValues` and `onDurableRestore` come out of its import list.
In the same change, update the storage.test.ts references at lines 7 and 20 of
storage.restore.integration.test.ts to name storage.hydrate.test.ts.

Projected sizes: storage.test.ts about 337 counted lines (163 under the 500 cap, 88 under 425);
storage.hydrate.test.ts about 186. No cap change.

**Risks (proposer):** No bundle-boundary or ADR concerns, because this change touches only test
files. The colocated `.test.ts` stays under `web/src/lib`, which satisfies
tools/tests/test-file-placement.test.mjs.

1. `hydrateDurableStorage` must stay imported in storage.test.ts: removeKey tests at lines 152-284
   call it, and line 256 uses `prefsSetFailure`, so the full harness stays in the original. Only
   `reconcileStorageValues` and `onDurableRestore` drop from the original's import list; check with
   eslint's unused-import rules.
2. The new file needs its own `beforeEach` reset. That includes `ctrl.native=false`: the hydrate
   tests set `ctrl.native=true`, and otherwise that state leaks between tests.
3. The header comment in storage.restore.integration.test.ts says "storage.test.ts proves hydrate
   *invokes* registered callbacks" and "(mirrors storage.test.ts)". Point those references at
   storage.hydrate.test.ts in the same change so the comment stays accurate.
4. The Preferences mock is duplicated in a third test file. That is acceptable because tests are
   exempt from the shared-constant rule, but trim the copy to what the hydrate tests actually use
   rather than copying the full remove-failure and remove-hold machinery.

## `web/src/routes/privacy/+page.svelte` (490 / 500)

**Reviewer (endorse):** I read the file and re-ran the count myself, and the plan holds up. ESLint
max-lines reports 490 (cap 500).

**The numbers check out.**

* The markup block, lines 83-98, is 15 counted lines (line 90 is blank).
* The style block, lines 355-425, is 64 counted lines: 71 lines minus 7 blanks at 371, 378, 385,
  398, 408, 412 and 422. Its CSS comments count toward the limit in a Svelte file.
* Together that is 79 lines. Dropping the `paletteHex` import (line 21) removes one more, for 80.
* Two lines come back: the `PolicySummary` import and the `<PolicySummary updated={LAST_UPDATED} />`
  line. Taking `HIGHLIGHTS` out of the `./contents` import changes no line count.
* The net cut is 78, so the page lands at about 412. That is under the 425 soft cap and leaves 88
  lines of headroom under 500.

**The seam is real, not just a way to get under the counter.** The "short version" heading and the
highlights checklist form one visual unit with its own styles. It reads no page state: no
`active`/`entered`, no `parentCenter`, no `feedbackLink` snippet, no `tocItems`. Its only data comes
from `HIGHLIGHTS` in `contents.ts` and `paletteHex`. A grep for `highlights`, `short-version` and
`HIGHLIGHTS` outside the page finds only `contents.ts`, so no spec or test selects these classes.
Other hits for "highlights" in the codebase are unrelated English prose.

**I checked for a style scoping trap.** Svelte scopes each component's styles, so any of the page's
generic rules that currently style the moved markup would silently stop applying after the move.
None do:

* `p`, `.sections ul` and `.sections li` are all limited to `.sections` or to elements the block
  doesn't contain.
* `h3` doesn't match the `h2`.
* There is no bare `strong`, `ul`, `li` or `h2` rule.

So the rendering stays the same. One small correction to the proposal: it mentions "generic
`strong`/`a` rules", but there is no generic `strong` rule, only `a`. That doesn't affect the
outcome.

**Other risks come back clean.**

* `privacy-consistency.test.mjs` reads only `+page.svelte`, and every pinned fact is in the
  `<section>` prose or the script, all of which stay put.
* `/privacy` is not on the startup path, so no bundle boundary is involved.
* The `.test.ts`/`.spec.ts` placement rules don't apply to a component, and PascalCase naming holds.
* The `updated` prop has a real production caller, so it isn't speculative surface.
* Keeping `LAST_UPDATED` in the page follows the bump rule in the file's header comment.

**Placement nit, not blocking.** Put the component directly in `routes/privacy/`, beside
`contents.ts` and `parentCenter.svelte.ts`. A `lib/` subfolder like `routes/dev/notch/lib` isn't
needed for a single file.

**Why not the other options.**

* Raising the cap is worse here because a real, self-contained seam exists.
* Moving the prose sections out would cut more lines, but it would break the privacy-consistency
  test, which reads only this one file.

**Recommendation:**

Split as proposed. Create `web/src/routes/privacy/PolicySummary.svelte`, a route-local sibling of
`contents.ts`, with one prop, `updated: string`. Move three things into it:

* the RuleLabel-variant comment, `h2.short-version` and `ul.highlights` (the `{#each HIGHLIGHTS}`
  with `paletteHex` chips), lines 83-98;
* the `.short-version*` and `.highlights*` rules and their comments, lines 355-425;
* the `paletteHex` and `HIGHLIGHTS` imports.

`LAST_UPDATED` and all `<section>` prose stay in `+page.svelte`, which renders
`<PolicySummary updated={LAST_UPDATED} />`. The page goes from 490 to about 412 counted lines (88
under the 500 cap, under the 425 soft cap), and no cap change is needed.

Verify with:

* `npm run lint` for max-lines;
* `npm run check`, judged by exit code (unused-selector warnings fail it);
* `tools/mobile/tests/privacy-consistency.test.mjs`;
* `web/tests/privacy-parent-center.spec.ts` and any privacy page-inventory or visual spec, run with
  an explicit `SPLOTCH_E2E_PORT` and `--workers=1`.

**Risks (proposer):** 1) Privacy-consistency test pinning:
tools/mobile/tests/privacy-consistency.test.mjs reads only +page.svelte for the inventory's
privacyPageFacts and the four constant identifiers. Every one of those is in the <section> prose or
the script, and none is in the moved block, because the highlights text comes from contents.ts.
Confirm by running that test after the move. If any inventory fact matched highlight text, the test
would already be reading contents.ts, and it does not. 2) CSS scoping: the moved rules must go with
the markup. Leaving `.highlights`/`.short-version` in the page's <style> would trigger svelte's
unused-selector warning (`npm run check` fails on WARNING). The page's generic `strong`/`a` rules do
not cover the `.highlights strong` override, which moves with it. 3) DOM and visual parity: a Svelte
component adds no wrapper, so layout and any privacy screenshot or page-inventory baselines should
not change. Still, run web/tests/privacy-parent-center.spec.ts and any privacy visual spec on an
explicit SPLOTCH_E2E_PORT. 4) Bundle boundary: /privacy is not a startup-path route and the
component is route-local, so the root chunk is unaffected. 5) LAST_UPDATED must stay in +page.svelte
next to the prose it dates (the file header's bump rule). Passing it as a prop keeps that. Don't
move the constant into the component. 6) Naming: PascalCase component, named-exports rule is not
affected (a .svelte default component). No speculative props: `updated` has its one production
caller.

## `web/src/lib/drawing/tiledRenderer.test.ts` (488 / 500)

**Reviewer (endorse):** I read the file myself and re-measured with the max-lines rule (blank lines
and // lines skipped). The file is 488 counted lines. The plan's numbers are all correct: 'drops
pre-clear work' (L279-315) is 34, 'spreads clear snapshots' (L347-375) is 27, and 'drops an open
crayon pass' (L376-439) is 56, for 117 in total, which leaves the original at 371. The alternatives
it rejected also measure as stated: context-loss recovery (L203-278) is 70, which would leave 418
and is too thin. The async snapshot pair is 28 + 12 = 40, too small.

The seam is real and not driven by the counter. Each of the three tests calls clearTiledRenderer as
the event under test and checks what clear does to in-flight state: an open command, the undo
snapshot capture spread across frames, and an open crayon pass. None of the three is about 'idle
visibility'. The migration test also calls clear, but only as setup for a resize/migration check, so
leaving it in the original is right.

I checked whether these tests should go into tiledRendererBlankUndo.test.ts instead of a new file.
That file is not a good fit. It is 232 lines and has its own getContext override and
destructured-function setup, so adding them would mix two harness styles. It would also push that
file toward the cap. A new tiledRendererClear.test.ts matches how UndoBudget, FoldFlush, Bounds and
Readback were split out.

Dependencies:

* The original must keep the crayonBrush vi.mock, because 'counts seam overdraw' (L141) and the
  context-restore test (L232) still use crayon planes.
* The new file needs the mock too, for the crayon-clear test.
* The TEST_TILE_* constants are still used in the original (L45, L46, L110) and in the moved
  snapshot-spreading test. Both files therefore need them.
* TEST_PAPER_PX is already duplicated in tiledRendererUndoBudget.test.ts. Exporting the three from
  tiledRendererTestHarness.ts is a sensible optional clean-up, but not required.

Placement and conventions:

* The new file needs loadFreshTiledRenderer per test, because it asserts absolute patchBytes. It
  also needs installTiledRendererTestHarness so the requestAnimationFrame stubs get torn down.
* It is colocated as a .test.ts under web/src/lib/drawing, with a camelCase name matching its
  siblings.
* No bundle boundary, snapshot file or ADR is affected.

The new file comes to about 141 counted lines (117 moved, about 22 setup, 2 for the describe
wrapper), which is well under the cap. Raising the cap is not better here, because a cohesive seam
exists and brings the file under the 425 soft target with room to spare.

**Recommendation:**

Split. Move the three tests that exercise clearing the paper into a new colocated file,
web/src/lib/drawing/tiledRendererClear.test.ts, under describe('clearing the tiled canvas'). The
three tests are:

* 'drops pre-clear work from a command that continues after clear'
* 'spreads clear snapshots across separate animation frames'
* 'drops an open crayon pass when the paper is cleared'

The new file needs its own copy of this setup:

* the vitest imports
* IDENTITY_PAPER_VIEW, StrokeOp and LIVE_TILE_COLUMNS/ROWS
* the crayonBrush crayonPatternFor vi.mock
* `let renderer` + installTiledRendererTestHarness(() => renderer) +
  beforeEach(loadFreshTiledRenderer), with the fresh-renderer-per-test comment
* the TEST_PAPER_PX/TEST_TILE_WIDTH_PX/TEST_TILE_HEIGHT_PX constants

Optionally, export those three constants once from tiledRendererTestHarness.ts, since
tiledRendererUndoBudget.test.ts already declares its own TEST_PAPER_PX.

The original keeps its crayon mock and constants. It drops from 488 to 371 counted lines (about 368
if the constants move to the harness), which leaves 129 lines of headroom under 500. The new file
comes to about 141 lines. No cap change is needed.

**Risks (proposer):** These are test files only, so no bundle boundary is involved. File placement
follows the rules: .test.ts colocated under web/src/lib/drawing, which is what
tools/tests/test-file-placement.test.mjs checks, and the camelCase name matches the
tiledRendererX.test.ts siblings. Each test needs its own freshly loaded renderer module, because the
clear tests assert absolute patchBytes and undo depth. The new file therefore has to keep the
beforeEach(loadFreshTiledRenderer) pattern, not the shared static import that
tiledRendererBounds/UndoBudget use. The requestAnimationFrame and createImageBitmap global stubs and
fake timers get reset in installTiledRendererTestHarness teardown (vi.unstubAllGlobals /
vi.useRealTimers), so the new file must call installTiledRendererTestHarness too. The crayonBrush
vi.mock is hoisted per file and has to be repeated in the new file. If the TEST_* constants are
shared through the harness, the original file loses 3 more lines (about 368), and neither file
carries a duplicate literal. There are no snapshot files and no ADR constraints tied to this file.
The original's describe title 'idle tiled canvas visibility' still loosely covers what remains
(visibility, seam counting, context recovery, snapshot capture, migration, fold). It could be
retitled, but this split does not require it.

## `web/tests/flows-undo-persistence.spec.ts` (487 / 500)

**Reviewer (endorse):** I read the file and measured it with a script that skips blank and comment
lines. I also ran ESLint max-lines with a cap of 1 to get the exact count: 487, which matches the
task. The file has 651 physical lines.

**The seam is real, not driven by the counter.**

* Lines 146-321 are six tests about Screenshot Button behaviour:
  * the empty-canvas gate
  * burst coalescing and cooldown
  * tiled (DPR 2) export
  * reduced-motion polaroid suppression
  * compatibility (DPR 1) export with a PNG width check
* They sit under the "undo / empty-state gating" banner only by proximity. The file name promises
  undo and persistence.
* Their helpers belong only to them. `readFile`, `Download`, `downloadedPngWidth`,
  `SECOND_SAVE_WINDOW_MS`, `POLAROID_OBSERVATION_MS` and `SCREENSHOT_COOLDOWN_MS` are used nowhere
  else in the file.
* The gate test clicks `#undoButton` once, but only to empty the canvas. The test asserts on the
  screenshot button.
* What stays is cohesive: the four undo tests, and the tool/stroke state, persistence and
  first-paint tests from line 323 on.

**The line estimates hold.**

* The test block, lines 146-321, is 148 counted lines.
* The `SECOND_SAVE_WINDOW_MS` constant and `downloadedPngWidth` (lines 15-25) are 6 counted lines.
  The WHY comment is not counted.
* The `readFile` import is 1 line and the multi-line `screenshotTiming` import is 4 lines.
* Dropping `type Download` from the `@playwright/test` import line saves no lines.
* Total removed: 148 + 6 + 1 + 4 = 159, so the original drops to 328. That is 97 under the 425 soft
  cap and 172 under the 500 hard cap, well past the 75-line headroom goal.
* The new file is about 162 counted lines: 159 plus the `@playwright/test`, `./helpers` and
  `./flows-harness` imports.

**Nothing the move touches breaks.**

* **Test placement:** the new `.spec.ts` stays in `web/tests`, which the placement guard allows.
* **Bundles:** this is test code, so no bundle boundary applies.
* **Snapshots:** there are no `toHaveScreenshot` baselines tied to the filename.
* **Imports:** they only go from the spec to `helpers`/`flows-harness`, so there is no cycle.
  `firstOpaquePixel`, `draw`, `gotoApp` and `openDrawer` are still used by both files.
* **Filename references:** these name `flows-undo-persistence.spec.ts` and all stay valid, because
  the file keeps its name:
  * `docs/TESTING.md:306` cites the undo test, which stays.
  * ADR-0040 cites the persisted-open drawer at first paint test, which stays.
  * The run-splotch skill and `verifier.md` use the filename only as an example.
  * `run-burndown.test.mjs` and `skill-spec-citations.test.mjs` treat it as a fixture string.
* **Title references:** ADR-0078 and the e2e-tuning scrapbook (plus
  `tools/e2e-tuning/gen-tuning-report.mjs`, which generates it) cite the burst test by title only,
  not by file, so the move does not affect them.

**Small gaps.**

* The proposal's risk list left out ADR-0078 and the scrapbook title citations, but they are
  harmless.
* `flows-icons.spec.ts` already checks the camera icon on `#screenshotButton`. It tests a different
  thing (icons), so it is not a better home for these tests.
* The screenshot tests will no longer run where a burndown gate names `flows-undo-persistence` for a
  screenshot-related fix. `verifier.md` tells the verifier to grep `web/tests` for the behaviour, so
  a screenshot finding would find the new file. That is acceptable.

**Raising the cap instead would be worse.** The file already mixes three concerns, and it would stay
at 487, over the 425 soft cap.

**Recommendation:**

Split. Move the six Screenshot Button tests into a new `web/tests/flows-screenshot.spec.ts`: the
gate test, the burst/cooldown test, and the `describe` blocks 'tiled screenshot export' and
'compatibility screenshot export' (lines 146-321, 148 counted lines). Move with them the helpers
only they use:

* the `node:fs/promises` `readFile` import
* the `type Download` import
* the `screenshotTiming` import (`POLAROID_OBSERVATION_MS`, `SCREENSHOT_COOLDOWN_MS`)
* `SECOND_SAVE_WINDOW_MS`, keeping its WHY comment
* `downloadedPngWidth`

The new file imports `draw`, `firstOpaquePixel` and `gotoApp` from `./helpers` and `openDrawer` from
`./flows-harness`, under a short '── screenshot export ──' banner.

`flows-undo-persistence.spec.ts` keeps the four undo tests and every persistence and first-paint
test, and drops from 487 to 328 counted lines. The new file comes in at about 162. After the move:

* run `npm run lint` to catch any import left unused
* run the targeted Playwright check on both specs with an explicit `SPLOTCH_E2E_PORT` and
  `--workers=1`

Every existing filename and test-title reference stays valid, so no doc changes are needed.

**Risks (proposer):** - **External references:** the three tools that name this file
(`docs/TESTING.md:306`, `tools/audit-burndown/prompts/verifier.md`, and
`tools/tests/skill-spec-citations.test.mjs`) all cite the file name or the undo test 'the undo
button enables on a stroke and reverts it'. That test stays, so no reference breaks. Grep `.ruler/`
skills for the screenshot test titles before moving them in case any skill cites them by file.

* **Test placement:** the new `.spec.ts` goes in `web/tests`, which the placement drift guard
  allows.
* **Bundle boundaries:** none apply, because this is test-only code.
* **Imports:** the imports go one way (spec → helpers and flows-harness), so there is no cycle risk.
* **Imports left behind:** after the move, `firstOpaquePixel` is still used by the undo tests in the
  original file (lines 29-145), so keep that import there. Run lint to find any import left unused
  in either file.
* **Test sharding:** the tiled test and the compatibility test each set their own
  `deviceScaleFactor` in a describe-scoped `test.use`, so moving them whole keeps their fixtures.
  Playwright shards by file, so the new file changes how CI shards are balanced but not what the
  tests do.
* **Section banners:** the "undo / empty-state gating" banner stays on the undo tests. Banner and
  comment lines don't count toward the cap.
* **Result:** about 328 counted lines are left, which is about 97 under the 425 soft cap. The new
  file comes in around 160.

## `web/src/lib/components/styleguide/ChromeSections.svelte` (486 / 500)

**Reviewer (endorse):** I read ChromeSections.svelte myself and checked the numbers. The seam holds
up and was not chosen just to satisfy the counter. The `#named` region has its own data model
(`ChromeEntry` and the `canvasChrome`/`pageChrome` arrays), its own child component
(ChromeMiniMap/MiniMapZone, used nowhere else) and its own style cluster (`.chrome-*`). It shares no
state with `#furniture` or `#chrome`, which own `demoToggle`, `demoSlider`, `demoBrush`,
`demoBrushes` and the `paletteHex` / `SliderRow` / `ToggleRow` / `Icon` imports. It also changes for
a different reason: it follows the architecture glossary, while the specimens follow app.css.

**Line counts.** I counted nonblank, non-comment lines:

* Line 6 import: 1
* Interface and arrays (lines 20-151): 127
* `<section id="named">` markup (lines 305-338): 34
* `.chrome-*` styles (lines 496-529): 29

That removes 191 lines, so ChromeSections goes from 486 to about 295. The proposal says 296, and
that is correct. The duplicated base styles (lines 341-381) count 35. Each one is needed by the
moved markup: `section`, `section > p`, `h3`, `h4`, the `code` inside `.chrome-info`, and `.value`.
With the script and style tags, the new file lands at about 229 to 232 lines. Both files end up far
below 425.

**Checks that pass:**

* **Bundle boundary:** none at risk. The only importer is `web/src/routes/design/+page.svelte:4`,
  which mounts the section at line 259, and /design is not a startup route.
* **TOC entry:** `{ id: 'named' }` at `+page.svelte:56` still resolves as long as the section id is
  kept.
* **design.spec.ts:325-348:** the narrow-TOC jump test looks up `#named` by id. It survives if the
  new component renders right after `<ChromeSections />`, so DOM order is unchanged.
* **Scoped-class hashes:** these change, but that affects neither the visual output nor axe.
* **lint:tokens:** the allowance at `tools/tokens/lint-token-styles.mjs:172` covers the
  `.furniture-demo` re-ink `:global`, which stays in ChromeSections. The new file uses no `:global`,
  so it needs no entry.
* **Tests:** none import ChromeSections directly.

**Small corrections:**

1. ADR-0096 lines 36-42 are already out of date. They name `TokenSections.svelte`, and that file no
   longer exists (it is now Color, Type, Scale and Recipe). Adding only the new file name keeps the
   rest wrong, so either fix the whole partial list or leave the ADR as a point-in-time record.
   `docs/ARCHITECTURE.md:159` and `.ruler/skills/design/SKILL.md:346` are the live lists and must be
   updated, followed by `ruler:apply`.
2. Consider moving the section's introductory `<p>` copy word for word.

**Alternatives I rejected:**

* A camelCase data module (such as `namedChrome.ts` holding the entries) would also work: it gets to
  about 358 and avoids the 35 lines of duplicated base styles. But it leaves the markup, the minimap
  and the styles split from their data. The component seam is more cohesive and follows the existing
  ButtonSpecimens / FocusSpecimens pattern.
* Raising the cap is the wrong call here, because a clean seam this large exists.

**Recommendation:**

Split as proposed.

1. **Create `web/src/lib/components/styleguide/NamedChromeSection.svelte`.** Move into it:
   * the `ChromeMiniMap, { type MiniMapZone }` import
   * `ChromeEntry`, the glossary comment, and the `canvasChrome` and `pageChrome` arrays
   * the whole `<section id="named" data-sg-section>` block, with the id unchanged
   * the `.chrome-grid`, `.chrome-card`, `.chrome-info` (plus its `code` and `.value` rules) and
     `.chrome-name` styles
   * a local copy of the partial base styles (`section`, `section > p`, `h3`, `h4`, `code`, `.value`
     together with its a11y contrast comment)

   The new file should come to about 230 counted lines.
2. **Wire it into the page.** Render `<NamedChromeSection />` directly after `<ChromeSections />` in
   `web/src/routes/design/+page.svelte`, so DOM and TOC order stay the same.
3. **Update the docs.**
   * Add the new file name to the partial lists in `docs/ARCHITECTURE.md:159` and
     `.ruler/skills/design/SKILL.md:346`, then run `npm run ruler:apply`.
   * In ADR-0096, either correct the whole out-of-date partial list or leave it alone.

ChromeSections itself drops to about 295 counted lines. The `lint:tokens` allowance does not change.

To verify: run `npm run check`, `npm run lint`, `npm run lint:tokens`, and the design and a11y
Playwright specs on an explicit `SPLOTCH_E2E_PORT`.

**Risks (proposer):** No bundle-boundary risk: /design is a lazily loaded, non-startup route, and
both partials are already imported only from routes/design/+page.svelte. No import cycle:
ChromeMiniMap moves wholesale to the new consumer. The `lint:tokens` global-selector allowance in
tools/tokens/lint-token-styles.mjs:172 (`ChromeSections.svelte: 1`) covers the `.furniture-demo`
icon re-ink `:global`, which stays in ChromeSections. The allowance count does not change, and the
new file needs no entry (all its selectors are scoped). The `deferredIcons` side-effect import stays
in ChromeSections, which still renders the deferred icons. NamedChromeSection renders no `<Icon>`,
so the deferredIcons.test.ts guard needs nothing added. The duplicated base section styles
(section/h3/h4/code/.value) are the existing per-partial convention, not new drift. Keep the
`.value` contrast comment on the copy, since a11y.spec.ts's axe scan covers both. `#named` stays in
the same DOM order, so the TOC scrollspy, a11y and visual snapshots of /design are unchanged. Still,
run the /design snapshot and a11y specs (on an explicit SPLOTCH_E2E_PORT) to confirm. PascalCase
component, named-exports rule (not applicable to .svelte defaults) and colocation rules are all
satisfied. No tests import ChromeSections directly.

## `web/tests/ai-result.spec.ts` (484 / 500)

**Reviewer (endorse):** I read web/tests/ai-result.spec.ts myself and counted lines the way ESLint
max-lines does (blank and comment-only lines skipped). The file has 484 counted lines, which matches
the task. Every region estimate in the proposal is exact: stability loop 42, strip anchoring 17,
full-height picture 23, gutter 26, notched safe-area 19, content inside card 15, cardBounds plus
emulateSafeAreaInsets 19, resolveLengths 18.

**The seam is real.** The six moved tests are all per-viewport geometry assertions on the card's
band, bounds, gutter, strip reserve and insets. Two helpers serve only these tests: cardBounds and
emulateSafeAreaInsets. So do NOTCHED_PHONE_INSETS, STORAGE_KEYS and overrideSafeAreaInsets. The same
is true of several harness imports: keepDrawingBlockPx, settledStageHeight, stripTokens and
resultBoxes. The proposal misses these harness imports, which makes its estimate slightly
pessimistic.

**What stays is one subject.** The remaining file covers the generation lifecycle and loading
presentation: upload, blur budget, dial and reveal, stage reservation while an image decodes, error
and refusal states, pinch-zoom, --stage-h, dial cap and the confetti hole.

**Projected size.** Removing 164 lines, moving resolveLengths (18) and the two viewport constants
(2), dropping the 4 unused harness imports, and adding about 3 import names gives roughly 297–303
counted lines. That is well under 425. The new file comes to about 175–180 lines, and ai-harness.ts
goes to about 235. Both leave plenty of headroom.

**Conventions.**

* The new .spec.ts stays in web/tests, so test placement is fine.
* Named exports only.
* No bundle boundary is involved, because these are Playwright specs.
* There are no screenshot baselines.
* Moving resolveLengths into the harness is what the testing rule requires: a page-driving helper
  that a second spec needs moves to the shared module.
* Test titles do not change. The one historical reference that includes the file path is
  docs/scratchpad/e2e-flake-hunt-2026-08-11.md. It records the 700×420 flake under
  ai-result.spec.ts, and as a point-in-time scratchpad record it can stay as it is.

**Small additions I would make:**

1. Rewrite the ai-result.spec.ts header comment. It currently says the file covers "the geometry
   that has to hold across viewports", and it should point to ai-result-layout.spec.ts instead.
2. Make the ai-harness.ts header name its consumers generically, or list all of them. It already
   leaves out ai-result-disclosure.spec.ts.
3. Update the ADR-0117 line 90 citation to ai-result-layout.spec.ts rather than keeping the
   stability loop behind. The loop is loading-versus-reveal card geometry across phone viewports,
   which is squarely the layout subject. docs/ is edited in place.
4. The gutter test's inline `{ width: 390, height: 844 }` could reuse NOTCHED_PHONE_VIEWPORT. This
   is optional.

**Why not raise the cap instead.** The file genuinely holds two subjects, and a clean one-way helper
dependency separates them. Raising the cap would be worse than splitting.

**Recommendation:**

Split, as proposed. Create web/tests/ai-result-layout.spec.ts under a 'AI result card layout'
describe, and move these tests into it with their titles unchanged:

* the stability loop (keeps loading and reveal geometry stable on ...)
* anchors the disclosure strip below the result card
* draws the picture at the full height its band allows
* frames the card in a <screen>-sized gutter
* clears the display's safe areas on a notched phone while <state>
* keeps result content inside the card at WxH

Move these helpers with them: cardBounds, emulateSafeAreaInsets and NOTCHED_PHONE_INSETS. Move the
imports only these tests use: STORAGE_KEYS, overrideSafeAreaInsets, keepDrawingBlockPx,
settledStageHeight, stripTokens and resultBoxes. In web/tests/ai-harness.ts, export resolveLengths,
DESKTOP_VIEWPORT and NOTCHED_PHONE_VIEWPORT, each keeping its WHY comment (the notch one cites
ADR-0026). Rewrite the headers of both spec files and of the harness so each names the right file.
Update the ai-result.spec.ts citation in docs/adrs/0117-a-waiting-picture-is-a-polaroid.md (line 90)
to ai-result-layout.spec.ts.

Projected counted lines: ai-result.spec.ts about 300, ai-result-layout.spec.ts about 178,
ai-harness.ts about 235.

**Risks (proposer):** No bundle boundary is involved: these are Playwright specs, and the new
.spec.ts stays in web/tests as test-file-placement.test.mjs requires. ai-harness.ts already uses
named exports and nothing imports a spec, so there is no import-cycle risk.
`npm run test:e2e:headed -- ai-result` still matches both files by substring, so the header's 'watch
it run' hint keeps working. Prose that names ai-result.spec.ts needs attention.
docs/adrs/0117-a-waiting-picture-is-a-polaroid.md L90 says ai-result.spec.ts 'pins the direction',
which refers to the loading-to-reveal stability loop that moves, so that one citation goes stale.
Update that line, or keep the stability loop in the original: that still leaves ~345 counted lines,
under 425. The other citations are in ADR-0109, ADR-0073,
audit-deferred/decisions/pinch-move-allocations.md, and the ai-report.spec.ts header. They refer to
the invoke handle, the report/CSP path, and pinch-zoom assertions, all of which stay, so they remain
accurate. No snapshot baselines are tied to these tests: they assert on geometry, not screenshots.
Keep the WHY comments on DESKTOP_VIEWPORT and NOTCHED_PHONE_VIEWPORT (ADR-0026 notch threshold) when
they move to the harness. Every test title that moves keeps its exact text, so CI history and flake
notes (docs/scratchpad/e2e-flake-hunt-2026-08-11.md) still match by title.

## `web/src/lib/components/ColoringBook.svelte` (483 / 500)

**Reviewer (endorse):** I read the file and measured it myself. ESLint max-lines gives 483, which
matches the proposal. Every region count is also correct: the tile base through img (384-437) is 50
nonblank lines, the cover tile and caption reserve (439-450) is 11, the page aspect rules (452-458)
are 6, and .coloring-book-label (542-560) is 19. That makes 86 lines of CSS that move, and they all
describe one card: surface, border, shadow, hover and press feedback, the transition suppression,
the img fit, the ADR-0052 lineart blend and filter on covers, the aspect ratios, and the caption.
What stays in ColoringBook.svelte is what books.test.ts checks against COLORING_IMAGE_SIZES: dialog
width, grid columns and gaps, content padding, the orphan repair, the 741px/740px complement and the
tall-portrait media query. Almost all of that drift guard keeps working, including the source
strings 'pageSelectorImageSource(page, orientation, resolvedTheme())' and
'COLORING_IMAGE_SIZES.pageSelector[orientation]', which appear in bookPageRequests and at the call
site. So the seam is real and not driven by the counter. It also matches the ActivePageChip
precedent, where hoverArmed is a prop and the chip owns its own .hover-armed class.

Corrections:

1. The call sites shrink less than claimed. With image, sizes, aspect, label, {hoverArmed},
   retiring, aria-label and three handlers, the cover call is about 12 lines and the page call about
   11, not 9 each. Net markup saving is about -11, not -17, so the realistic projection is 483 -
   86 - 11 + 1 ≈ 387. Also removing the container's now-dead class:hover-armed and
   class:retiring-after-page-selection directives (-2) gives about 385. That is still about 40 under
   425 and 115 under 500.
2. Those two container class directives only fed the moved descendant selectors. Grep shows no test
   or spec reads .hover-armed or .retiring-after-page-selection on the content div (only
   books.test.ts's CSS slice does). Delete them rather than leave dead classes.
3. books.test.ts lines 280-284 slice the file by the strings '.retiring-after-page-selection
   .coloring-tile {' and '.coloring-tile img {'. After the move both indexOf calls return -1 and the
   slice degrades silently. Check its result: it is probably empty, so the expectation should fail
   loudly, but a slice between two -1 indexes is an easy thing to misread. It must be retargeted at
   ColoringTile.svelte's new rule, e.g. '.coloring-tile.retiring {'. The pickPage ordering check
   (retiringAfterPageSelection = true before hide) stays on ColoringBook.
4. Keep equal specificity when rewriting the compound selectors. `.coloring-tile.hover-armed:hover`
   (0,3,0) matches today's `.hover-armed .coloring-tile:hover`, and the aspect variants as
   `.coloring-tile.<aspect>` (0,2,0) match `.coloring-pages-grid .coloring-tile`. Keep the retiring
   rule after the transition declaration. The lineart blend and filter stay on covers only (the
   label/cover variant), as today.
5. pickPage uses event.currentTarget, which still works when onclick is spread through ...rest onto
   the root button. Keep the button as the root element with no wrapper, because specs rely on '>
   .coloring-tile' and ':scope > .coloring-tile'.

The bundle boundary is fine: ColoringBook is only reached through overlayChunk.ts's deferred
re-export, and ColoringTile would be imported only by ColoringBook. No ADR is violated. Visual
output is unchanged, so no screenshot baselines move. The opposite verdict (raise the cap) is worse:
the file is 17 over the soft target with a clean, test-backed seam available.

**Recommendation:**

Split. Create web/src/lib/components/ColoringTile.svelte: a root <button class="coloring-tile">
(plus class coloring-book-tile when label is set) wrapping an img with src, and srcset/sizes gated
on **IS_CAPACITOR**, and an optional .coloring-book-label caption.

Props:

* image: ResponsiveColoringImage
* sizes: string
* aspect: 'cover' | BookOrientation
* label?: string
* hoverArmed: boolean
* retiring: boolean
* ...rest: HTMLButtonAttributes

Move the 86 counted CSS lines (tile base, armed hover, :active/:global(.activation-pending) press,
retiring transition:none, img, cover caption reserve plus lineart blend/filter, the 3/2 and 2/3
aspects, and the caption) with their comments. Rewrite the ancestor compounds as tile-local classes
at equal specificity.

In ColoringBook.svelte:

* Replace the two button blocks with <ColoringTile> calls (about 12 and 11 lines).
* Delete the content div's dead class:hover-armed and class:retiring-after-page-selection
  directives.
* Keep all grid geometry, prefetch, and view logic.

Retarget books.test.ts's retiring-rule slice at ColoringTile.svelte. Verify with npm run check, npm
run lint, npm run test:unit, and the coloring-book Playwright specs on an explicit SPLOTCH_E2E_PORT
with --workers=1.

Projected: ColoringBook.svelte about 385-387 counted lines (about 40 under 425, about 115 under the
500 cap). ColoringTile.svelte about 125-140.

**Risks (proposer):** - Source-text drift guard: web/src/lib/state/books.test.ts (around lines
280-284) slices ColoringBook.svelte from '.retiring-after-page-selection .coloring-tile {' to
'.coloring-tile img {' and expects 'transition: none'. It has to read ColoringTile.svelte and use
the new rule's selector instead. Its other checks on ColoringBook.svelte stay valid because the grid
geometry does not move: the pickPage ordering, 'pageSelectorImageSource(page, orientation,
resolvedTheme())', 'COLORING_IMAGE_SIZES.pageSelector[orientation]', the grid and padding values,
and the TALL_COVER_GRID_MEDIA / 741px media strings. The component still passes
COLORING_IMAGE_SIZES.pageSelector[orientation] as the sizes prop, so that string survives.

* Playwright coupling: coloring-pack-download.spec.ts, flows-coloring-book*.spec.ts,
  flows-coloring-scroll-cue.spec.ts and flows-harness.ts select .coloring-tile, .coloring-book-tile
  and direct-child '> .coloring-tile'. Keep those class names on the root button and add no wrapper
  element.
* pickPage's dialogEl.querySelectorAll('.coloring-pages-grid img') is a DOM query and keeps working.
* Bundle boundary: ColoringBook is lazy-loaded through overlayChunk.ts. ColoringTile is imported
  only by ColoringBook, so it lands in the same deferred chunk and web/tests/startup-bundle.spec.ts
  is unaffected. Do not import it from any startup-path module.
* Behavior that must survive:
  * Hover chrome stays gated on a real mouse move. hoverArmed is still owned by ColoringBook's
    armHoverOnMouseMove and is passed down.
  * Transitions stay off from the moment a page is picked until the dialog retires.
  * The tall-portrait grid math depends on the tile's aspect ratios, not its CSS. It still reads
    --space-7, --modal-close-size and --space-3 from the parent, so the aspect ratios have to stay
    1:1 for covers and 3:2 or 2:3 for pages.
* Verification the implementer must run: npm run check, npm run lint (max-lines, stylelint), npm run
  test:unit (books.test.ts, ScrollCue.scrollportPadding.test.ts), and the coloring-book Playwright
  specs on an explicit SPLOTCH_E2E_PORT with --workers=1.
* No ADR constrains this component split. ADR-0052 (themed line-art tiles) is preserved as long as
  the lineart filter and blend tokens move with the tile.

## `web/tests/flows-parental-gate.spec.ts` (478 / 500)

**Reviewer (endorse):** I read web/tests/flows-parental-gate.spec.ts myself and counted its lines.
The seam is real, and the line math holds up.

* **Counts.** The file is 478 counted lines. The moved regions come to 133 (defaults test at lines
  71-87 is 12, PROTECTED_FEATURES at 37-44 is 7, UNPROTECTED_CONFIRM at 54 is 1, the block at
  281-424 is 113).
* **Nothing is duplicated.** PROTECTED_FEATURES is used only on lines 82 and 298.
  UNPROTECTED_CONFIRM is used only on line 311. worstHorizontalOverflow and VISUALLY_HIDDEN_MAX_PX
  are used only by the two layout tests. reloadAfterDialogClose is used only on line 314. All of
  them move out cleanly.
* **The seam is cohesive, not driven by the counter.** Every moved test starts at Settings → Parent
  Center and checks the pane: shipped defaults, the lock card and persistence, the 320px card
  layout, the wide-viewport matrix, and the disabled Never option on iOS. Everything that stays
  checks the challenge card or an operation boundary: the footer, AI, a wrong answer, closing the
  gate, per-session AI, links, privacy, feedback and the reports.
* **Precedent.** The repo already splits by concern with flows-parent-center-warning.spec.ts (138
  physical lines) and flows-parental-gate-lockout.spec.ts. The new name fits that pattern.
* **Nothing breaks.** It is a .spec.ts file in web/tests, so the test-placement guard is satisfied.
  There is no bundle boundary involved and no import cycle. page-inventory-spec-viewports.test.mjs
  only lists the lockout spec, and the moved layout tests carry no inventory ids. Test titles are
  unchanged. ADR-0094 still holds.

Two small corrections:

1. **The header split is slightly off.** The plan says the original file keeps the "iOS external
   links" text. But the only test covering "native iOS keeps Never visible but unavailable"
   (line 400) moves. That sentence, and the "the one below that seeds nothing pins the shipped
   defaults" clause, both belong in the new file's header. The original keeps the operation-boundary
   and not-in-front-of-Settings text, plus the note that challenge specs arm with gates: 'always'.
2. **Import savings are about 1 line, not 2.** Removing the `Locator` type edits line 2 in place and
   saves nothing. Only the `reloadAfterDialogClose` line goes. The projection is therefore 478 -
   133 - 1 = 344, which is inside the plan's 345-347 range and well under 425.

A raised cap would be worse here. The file mixes two responsibilities and already has sibling specs
split by concern.

**Recommendation:**

Split along the plan's seam.

**Create web/tests/flows-parent-center.spec.ts.** Move into it:

* the test 'the web build ships every grown-up check off' (lines 71-87, with its seeds-nothing
  comment)
* PROTECTED_FEATURES (lines 37-44)
* UNPROTECTED_CONFIRM and its comment (lines 51-54)
* the whole block at lines 281-424: the gated-then-persist test, VISUALLY_HIDDEN_MAX_PX,
  worstHorizontalOverflow, the 320px card-fit test, the mode-matrix test, and the iOS Never-disabled
  test

The new file imports:

* `expect`, `test` and `type Locator` from @playwright/test
* `gotoApp`, `openSettingsModal` and `reloadAfterDialogClose` from ./helpers
* `policyPicker` and `solveParentalGate` from ./flows-harness

**Rewrite the headers.**

* The new file's header covers ADR-0094: Parent Center persists an independent policy per feature,
  the web build ships every policy at Never (the seeds-nothing test pins that), and native iOS keeps
  Never visible but unavailable with its rationale inline.
* The original file's header keeps: the gate sits at operation boundaries and never in front of
  Settings, and challenge specs arm it with gates: 'always'.
* Drop `reloadAfterDialogClose` and `Locator` from the original file's imports.

**Update the cross-references.**

* flows-parent-center-warning.spec.ts line 10 points to flows-parent-center.spec.ts.
* parentalGate.svelte.test.ts line 70 names flows-parent-center.spec.ts.
* docs/MOBILE/compliance.md line 446 adds web/tests/flows-parent-center.spec.ts.
* Leave the dated docs/scratchpad notes alone.

**Result.** The original file drops to about 344 counted lines, about 156 under the 500 cap and
under the 425 soft target. The new file is about 140. No cap change is needed.

**Risks (proposer):** Measured by counting nonblank, non-comment lines (the same rule ESLint
max-lines uses). The file is 478 today. The moved region is 12 (defaults test) + 7
(PROTECTED_FEATURES) + 1 (UNPROTECTED_CONFIRM) + 113 (lines 281-424) = 133, plus about 2 lines of
imports the original no longer needs, which leaves about 345-347. That is well under the 425 soft
target and about 153 under the 500 cap. The new file comes to about 140-145 lines. No
bundle-boundary or import-cycle concerns: this is a Playwright spec in web/tests, where
test-file-placement.test.mjs requires .spec.ts files to live. The name follows the existing
flows-parent-center-warning.spec.ts pattern. The file's header comment (lines 23-30) describes both
concerns. Split it: the original keeps the text about the gate sitting at operation boundaries, iOS
external links and arming with gates: 'always', and the new file gets the text about Parent Center
persisting per-feature policies and shipping defaults, so neither header describes tests it no
longer holds. tools/tests/page-inventory-spec-viewports.test.mjs only lists scroll-cue and lockout
specs, and the moved layout tests use plain setViewportSize without inventory-id comments, so that
guard is unaffected. The two docs/scratchpad flake-hunt notes cite flows-parental-gate.spec.ts in
dated history. Leave those as they are rather than rewriting them. Playwright shards by file, so one
more small spec file changes shard balance slightly, which does no harm. The test titles are
unchanged, so no snapshot baselines are tied to the file name.

## `web/src/lib/audio/drawingSound.test.ts` (476 / 500)

**Reviewer (endorse):** I checked the plan against web/src/lib/audio/drawingSound.test.ts myself.
The file has 537 raw lines and 476 counted lines (nonblank, non-comment), which matches the cap
measurement. Lines 399-536 count 124, so the source file drops to 476 - 124 = 352. That is 148 under
the 500 cap and 73 under the 425 soft target.

**The seam is real, not a move to satisfy the line counter.** The first nine tests are about
starting playback. The last two ('declicks running playback before disconnecting it' and 'mutes and
disconnects synchronously when the audio clock is suspended') only exercise `stopDrawSound()`
teardown:

* the running-clock ramp followed by teardown from a timer
* the suspended-clock synchronous mute
* `stop()` with no arguments, both disconnects, and no `onended` handler

That is exactly the three-step teardown contract in ADR-0085
(docs/adrs/0085-tiled-live-canvas-for-ipad-webkit.md lines 630-640). The declick test is the only
one in the file that calls `vi.useFakeTimers()`. The teardown tests are also the only ones that
assert `disconnect` was called and `onended` stayed null; the playback tests only stub those.

**The new file size estimate holds.** 124 lines of tests, plus 2 imports, a `let`, a 2-line
`describe('stopDrawSound')` wrapper and an 8-line `afterEach`, comes to about 137-140 counted lines.

**The name follows existing precedent.** `web/src/lib/fonts.warm.test.ts` and
`web/src/lib/actionButtonLayout.toolDrawer.test.ts` both exist. A `.test.ts` colocated under
`web/src` passes the placement guard.

**Nothing else depends on the file name.** No tooling or vitest config refers to
`drawingSound.test.ts`. The only reference that is a live instruction is ADR-0085 line 638, which
the plan already flags; it must be changed to name `drawingSound.stop.test.ts` in the same change.
There is no bundle-boundary concern because the code is test-only. There are no snapshots. Each test
re-imports its modules through `vi.resetModules()` and a dynamic import, so no state is shared
between the two files.

**Minor notes that don't change the verdict:**

* After the move, no remaining playback test uses fake timers, so `vi.useRealTimers()` in the
  original `afterEach` becomes dead. It is harmless; drop it or keep it.
* Both moved tests use `signal.throwIfAborted()`, so the copied signal-check comment is justified.
* Raising the cap instead would be worse: the file holds two distinct behaviours, and splitting them
  costs almost nothing.
* Holding off on consolidating the fixture literals into `drawingSoundTestHarness.ts` is right. It
  would collide with any plan made for `clearSound.test.ts` in the same session.

**Recommendation:**

Split. Move the two `stopDrawSound` teardown tests from web/src/lib/audio/drawingSound.test.ts
(lines 399-536, 124 counted lines) into a new colocated web/src/lib/audio/drawingSound.stop.test.ts,
wrapped in `describe('stopDrawSound')`. The new file needs:

* the vitest imports and `stubAudioContext` from `./drawingSoundTestHarness`
* a module-scope `let stopDrawSound`
* the same `afterEach`, keeping `vi.useRealTimers()`
* the signal-check comment

That comes to about 140 counted lines. `CONTENDED_HOST_TEST_TIMEOUT_MS` stays in the original. The
`vi.useRealTimers()` in the original's `afterEach` is now unneeded and can go. Update ADR-0085 line
638 so it names `drawingSound.stop.test.ts` as the file that pins the teardown contract. The
original lands at about 352 counted lines, well under both 425 and 500. Keep the default cap of 500.

**Risks (proposer):** 1. docs/adrs/0085-tiled-live-canvas-for-ipad-webkit.md (around line 638) says
"`drawingSound.test.ts` pins the running-clock declick ramp, suspended-clock synchronous mute...".
After the move that line must name `drawingSound.stop.test.ts`, or the ADR points at the wrong file.
The docs/AUDIT-LOG.md and docs/handoff/audit-burndown-72.md mentions are history and stay as they
are. 2. Both modules reset per test through vi.resetModules() and dynamic import, so the new file
adds no shared-state coupling. It stays on happy-dom because settings.svelte touches
localStorage. 3. The declick test uses vi.useFakeTimers(), so the new file's afterEach must keep
vi.useRealTimers(). 4. Placement: the new file is a .test.ts colocated under web/src, which the
test-file-placement guard allows. 5. There are no bundle-boundary or import-cycle concerns, since
this is test-only code. 6. The new file doesn't need CONTENDED_HOST_TEST_TIMEOUT_MS, so the constant
isn't duplicated.

## `web/src/lib/coloringPacks/webStore.test.ts` (476 / 500)

**Reviewer (endorse):** I read web/src/lib/coloringPacks/webStore.test.ts and webStoreTestHarness.ts
myself and counted lines the way ESLint max-lines does (skipping blank lines and comment lines). The
file splits cleanly as 26 preamble + 85 shared world (lines 31-132) + 236 describe groups that stay
(lines 134-426) + 129 concurrency region (lines 428-581) = 476, which matches the reported count. So
the proposal's 129-line figure for the moved region is exact.

**The seam is real, not driven by the counter.** Everything from line 428 on is about interleaving:

* the `describe.each` over locks versus no locks;
* the detached-handle test ("another tab removed mid-download");
* the older-build marker race;
* the lock-acquisition assertion.

Only this region uses `promiseWithResolvers` (import at line 9), `COLORING_PACK_LOCK_NAME` and
`holdFirstDownload`. The groups that stay use none of them. They use `holdForever`,
`closeTabAndOpenAnother`, `installAll` and `failEveryPut` instead, and none of those is used in the
region. The three loose top-level `it`s at lines 505, 528 and 574 confirm that this group never got
a heading.

**Moving the shared world into the harness is correct.** Copying those 85 lines into both files
would duplicate them. Checked details:

* webStoreTestHarness.ts is imported only by webStore.test.ts, so growing it affects nothing else.
* storeRemoval.test.ts has its own `caches` stub and is independent.
* The harness can compute `currentCache` from `./cacheKeys` without importing `./webStore`. So
  `installAll` (which calls `createWebColoringPackStore`) must stay in webStore.test.ts, as the
  proposal says.
* Vitest hooks registered by a factory each file calls at collection time are sound, because Vitest
  isolates modules per file.
* The `vi.mock` blocks for `$lib/idle` and `$lib/idb` must be repeated in each file. The new file
  needs the idle mock because `installed()` schedules idle work.
* `requestPersistentStorage` `mockClear` stays in the main file only.

**Projected sizes:**

* webStore.test.ts: about 24 preamble/mock lines + about 18 lines of helpers that stay (`never`,
  `holdForever`, `closeTabAndOpenAnother`, `installAll`) + about 4 for the factory call and
  `mockClear` + 236 ≈ 283-290. That is 210+ lines of headroom.
* New file: 129 + about 25 preamble ≈ 155.
* Harness: 85 + about 65-75 ≈ 155.

Nothing touches a bundle boundary (all test-only), test placement (colocated `.test.ts`), snapshots,
or an ADR. Raising the cap would be worse, because the file has a clear second responsibility.

**Minor revisions, none of which change the verdict:**

1. Name the file and heading for concurrency, not tabs. One `describe.each` row is "two stores in
   one tab without Web Locks", and the lock test is not cross-tab either.
   `webStore.concurrency.test.ts` with a describe such as 'web coloring packs under concurrent
   stores' fits better than `crossTab`.
2. Make `installedIds` a harness export, since both files use it.
3. Tests currently write `fake.hooks.intercept = ...` directly. Make the world expose `fake` through
   a getter, or have the tests use `world.fake`, so each `beforeEach` swaps in the fresh instance.
   The proposal already notes this; it is the one mechanical footgun.
4. Negative controls: confirm the no-Web-Locks row still fails when the module-level fallback
   serialization is removed. Both stores still share one module realm inside the new file, so the
   row stays valid, but it should be checked after the move.

**Recommendation:**

Split. Move the concurrency region, lines 428-581 (129 counted lines), into a new colocated file,
`web/src/lib/coloringPacks/webStore.concurrency.test.ts`. That covers:

* the `describe.each` locks/no-locks race, with its `dinosaurWithThird` fixture and WHY comment;
* `holdFirstDownload`;
* the three top-level `it`s (detached-handle removal, older-build marker race, and the shared-lock
  scan), wrapped in one `describe` such as 'web coloring packs under concurrent stores'.

Move the shared world from lines 31-132 into the existing `webStoreTestHarness.ts` behind a
`useWebStoreWorld()` factory, called at each file's top level. The factory exposes:

* the `released`, `dinosaur`, `dinosaurChanged`, `LEGACY_CACHE_NAME` and `currentCache` fixtures;
* `openNewTab`;
* `serve`, `deploy`, `seedCache`, `cachedPaths`, `servedByWorker` and `installedIds`;
* a `fake` getter;
* the `beforeEach` stubs for caches, locks and fetch, and the `afterEach` that calls
  `unstubAllGlobals`.

The harness must not import `./webStore` or `$lib/idb`.

These stay in webStore.test.ts: `never`, `holdForever`, `closeTabAndOpenAnother`, `installAll`,
`failEveryPut`, and a small `beforeEach` that runs the `requestPersistentStorage` `mockClear`.

Each test file repeats the two `vi.mock` blocks for `$lib/idle` and `$lib/idb`, because `vi.mock`
hoists per file.

Projected counted lines: webStore.test.ts about 290, new file about 155, harness about 155. All
three are well under 425.

After the split, run the coloringPacks directory, `npm run lint` (including `lint:dead`) and
`npm run check`. Also negative-control the moved race tests.

**Risks (proposer):** - vi.mock('$lib/idle') and vi.mock('$lib/idb') must be written in each test
file. Vitest hoists vi.mock per test file, so putting them in the harness is not reliable. This
duplicates about 8 lines, which is acceptable.

* vi.mocked(requestPersistentStorage).mockClear() should stay in a small beforeEach in
  webStore.test.ts, because only the persistence test there reads it. The harness should not import
  $lib/idb.
* The harness must not import './webStore'. It stays a pure fake/fixture module, so each test file
  controls the mock graph.
* The hooks in the world factory are Vitest hooks registered by a function each file calls. That is
  safe because Vitest isolates modules per file. Do not register them at the harness module's top
  level. The Playwright rule against helper-module beforeEach exists because Playwright evaluates
  helpers once per worker; the same pattern would be a trap here.
* Tests read `fake` through a getter (or world.fake()) because each beforeEach replaces the
  instance. Destructuring `fake` once at collection time would capture undefined or a stale
  instance.
* Test placement: the new *.test.ts is colocated under web/src (checked by
  tools/tests/test-file-placement.test.mjs). webStoreTestHarness.ts is already an accepted non-test
  helper there, and its new exports all have callers, so lint:dead / knip stays clean.
* Run the whole coloringPacks directory, plus npm run lint and npm run check, after the split. Also
  run each moved race test on the pre-split code (negative-control spirit) to confirm it still fails
  when its guard is removed. storeRemoval.test.ts is independent and unaffected.
* No bundle boundary or ADR is involved; this is test-only code.

## `web/tests/reduce-motion.spec.ts` (474 / 500)

**Reviewer (revise):** I read the whole file myself, and the seam is real. The measurements match
the proposal.

* **The section count is correct.** Lines 484-594 hold 96 counted lines (nonblank, non-comment).
  ESLint's max-lines reports 474 for the whole file.
* **The section is self-contained.** It has 4 test groups: RING_TRIGGERS, the ring-stays-settled
  pair, FOOTER_TRIGGERS, and the saved/downloadButton no-replay matrix. None of them uses
  globalCues, componentCues, tocJumpSteps, openAccessibility, recordReveals, the motionDurations
  imports, openSettingsModal, or openDrawer.
* **Its only shared dependency is `root`.** The last matrix uses `root(page)` once. It also needs
  REDUCE_MOTION_ATTRIBUTE and STORAGE_KEYS, and the original still uses both at lines 79 and
  175-229, so both files keep those imports.
* **Only one import leaves the original.** `revealAiResult` is used only in the moved section, so
  the original drops that import line.
* **The seam follows a real responsibility, not the line counter.** The section has its own banner.
  It tests keyframe cues that Svelte scopes to one component (the swatch ::before/::after rings and
  the AI-result footer branches). These are read off computed styles and check a "captured at start,
  never replays" rule. The rest of the file covers resolving the triggers (switch, OS, reload,
  pre-hydration stamp), the global probe cues, and the JS callers and reveals.
* **Projected sizes.** The original goes to 474 - 96 - 1 = 377, which is 123 under 500 and 48 under
  the 425 soft target. The new file is about 96 + 5 imports + 1 `root` line = about 102.
* **Nothing else breaks.** There are no snapshots in the section. There is no bundle boundary, since
  this is a spec, not app code. Placement is fine (.spec.ts in web/tests). Nothing in
  web/playwright.config.ts or tools/ refers to the filename.
* **The two doc points are correct.**
  * `.claude/rules/svelte.md` lines 81-82 name `reduce-motion.spec.ts` as covering selection rings.
    That file is hand-edited, not generated, and should be updated.
  * The `web/src/lib/motionDurations.ts` comment stays accurate, because the
    CALM_FADE_MS/SECTION_SLIDE_MS reveal tests stay in the original.
* **Raising the cap would be worse.** At 474 the file is 26 under the cap, and the split gives both
  files lots of headroom with a natural seam.

**Revision: the filename.** The "dot-joined multi-aspect test name" rule is about unit tests
colocated under web/src (e.g. platform.osLabel.test.ts). None of the 100 `.spec.ts` files in
web/tests has a dot-joined name; they are all hyphenated (drawing-motion-clear.spec.ts sits next to
drawing-motion.spec.ts). The new file should be `web/tests/reduce-motion-scoped-cues.spec.ts`, not
`reduce-motion.scoped-cues.spec.ts`.

**Optional polish, not needed for the cap.**

* Keep the moved banner as the new file's header comment.
* Declare `root` locally rather than promoting it to helpers.ts; this agrees with the proposal.
* The new file does not need the `type Page` import if `root` is inlined as `page.locator('html')`.

**Recommendation:**

Split. Move the section "Cues a component scopes to a pseudo-element or a branch"
(web/tests/reduce-motion.spec.ts lines 484-594, 96 counted lines) into a new hyphenated file,
web/tests/reduce-motion-scoped-cues.spec.ts. That section holds the banner, RING_TRIGGERS with its
test loop, the initiallyReduced ring-stays-settled pair, FOOTER_TRIGGERS with the saved-caption
tests, and the saved/downloadButton x initiallyReduced no-replay matrix.

The new file needs these imports:

* `expect`, `test` (and `type Page` if `root` stays a helper) from '@playwright/test'
* `REDUCE_MOTION_ATTRIBUTE` from '../src/lib/platform/reducedMotion'
* `STORAGE_KEYS` from '../src/lib/storageKeys'
* `gotoApp` from './helpers'
* `revealAiResult` from './ai-harness'

It also needs a local `root`, or `page.locator('html')` inlined.

In the original, remove the `revealAiResult` import. Update .claude/rules/svelte.md lines 81-82 to
say that reduce-motion.spec.ts covers open Settings, and reduce-motion-scoped-cues.spec.ts covers
the selection rings and the saved-result feedback.

Projected sizes: the original goes to about 377 counted lines, and the new spec is about 102. Both
are under the 425 soft target, with no cap change.

**Risks (proposer):** 1) The `root` helper is a one-line locator. Redeclaring it or inlining
page.locator('html') in the new spec is fine. Do not promote it to helpers.ts just for this move. 2)
.claude/rules/svelte.md (line 81, edited in place because it is not generated) says
"`reduce-motion.spec.ts` covers open Settings and selection rings". Update it to name
reduce-motion.scoped-cues.spec.ts for the selection rings and saved-result feedback, so the rule
does not go stale. 3) The comment in web/src/lib/motionDurations.ts that points at
reduce-motion.spec.ts stays correct, because the CALM_FADE_MS/SECTION_SLIDE_MS reveal tests stay in
the original. 4) Test titles are unchanged, but docs/scratchpad/flake-hunt-2026-09-22.md cites the
downloadButton test under the old filename. That is a historical note and can stay. 5) No
engine-smoke tag is involved, so the tests stay Chromium-only and placement rules pass (.spec.ts in
web/tests). The dot-joined name follows the multi-aspect test-name convention. 6) The new file is
about 103 counted lines, and the original drops to about 377, both well under 425.

## `web/tests/coloring-pack-download.spec.ts` (467 / 500)

**Reviewer (endorse):** I read the file myself and counted with the ESLint rule's method: blank
lines and comment-only lines skipped. It is 467 counted lines against a cap of 500. The proposal's
per-region numbers are exact. The disabled-setting test (238-278) is 32 lines, the
METERED_CONNECTIONS block (475-518) is 37, the unengaged visit (520-535) is 11, the settling-in
stroke (537-560) is 19, and the picker-open test (562-573) is 11. That makes 110 lines of tests.
IDLE_WORK_OBSERVATION_MS adds 1 and downloadedBookFiles adds 9, so 120 lines move. Moving
recordColoringRequests (8) and MANIFEST_REQUEST (1) to flows-harness takes out 9 more.

The import changes are slightly worse than the proposal assumes. Two new names in the multi-line
flows-harness import add about +2. Dropping the STORAGE_KEYS import saves -1. drawCommittedStroke
and STARTER_COLORING_BOOK_ID share lines with imports that stay, so removing them saves nothing. The
original lands at about 339, not 337. That is still about 86 under the 425 soft target and 161 under
the hard cap. flows-harness.ts goes from 281 to about 290. The new gate spec is about 135 lines.

The seam is real, not driven by the counter. Every moved test checks when the downloader may start,
and each proves a negative by recording requests over time. Every test that stays holds routes and
compares layout, using holdDinosaurDownload, holdRequests, bookInstalled and afterTwoFrames, which
no gate test uses. The metered tests do open the picker, but only as a precondition. What they
assert is that no new book files download, so they belong in the gate spec. This matches
.claude/rules/testing.md: one behavior per test/spec, and a page-driving helper needed by a second
spec moves to the shared helpers module rather than being copied.

Importing from another spec would re-register its tests, so flows-harness is the only sound home for
recordColoringRequests. MANIFEST_REQUEST also fits there: flows-harness already owns the
coloring-pack install helpers and already imports coloringPackManifestPath. Test placement is fine:
the new file is a .spec.ts in web/tests. No bundle boundary, snapshot, or ADR is involved.

Raising the cap would be the worse choice: the file's two concerns are genuinely separable. Small
notes:

* Put MANIFEST_REQUEST next to the gotoAppWith*ColoringBooks helpers and export it by name.
* Keep the WHY comments on IDLE_WORK_OBSERVATION_MS and downloadedBookFiles, and the
  pwa-registration.spec.ts cross-reference on the stroke test.
* The disabled-setting test uses a literal 500 ms wait where the others use
  IDLE_WORK_OBSERVATION_MS. It could use the named constant once both live in the same file. This is
  optional.
* In the original, WEB_COLORING_BOOK_COUNT is used only by the cold-start test, and in the gate spec
  only by the unengaged-visit test. Both files derive it separately from booksForPlatform, which is
  fine.

**Recommendation:**

Split. Create web/tests/coloring-pack-download-gate.spec.ts and move these five groups into it:

* 'a saved disabled setting blocks pack boot until coloring books are enabled'
* the METERED_CONNECTIONS loop, with its comment
* 'a visit nobody engages with downloads no coloring packs'
* 'the stroke that settles the child in starts the downloads'
* 'opening the coloring picker starts the downloads'

IDLE_WORK_OBSERVATION_MS and downloadedBookFiles move too, with their WHY comments. The new spec
imports STORAGE_KEYS and drawCommittedStroke, and derives its own WEB_COLORING_BOOK_COUNT from
booksForPlatform. Export recordColoringRequests and MANIFEST_REQUEST once from
web/tests/flows-harness.ts, next to the coloring-install helpers, and import them in both specs;
don't copy them. web/tests/coloring-pack-download.spec.ts keeps the picker-stability tests:

* fresh-install Farm pages
* remove-downloads previews
* the Coloring toggle
* the grid staying stable when a download finishes
* a book joining at the next open
* the held press while books land
* cold start beating the installed-book scan

Projected counts: original about 339 (467 - 120 moved - 9 to the harness + about 1 net for imports),
new gate spec about 135, flows-harness.ts about 290. Test titles stay the same. Afterwards, run lint
and a targeted --repeat-each run of both specs with --workers=1 and an explicit SPLOTCH_E2E_PORT.

**Risks (proposer):** Measured: the gate region is 110 counted lines of tests, plus 10 for
IDLE_WORK_OBSERVATION_MS and downloadedBookFiles. Moving recordColoringRequests and MANIFEST_REQUEST
to flows-harness removes about 9 more, and trimming imports about 1–2. The original lands near 337
counted lines (about 88 below the 425 soft target). The new spec is about 135 lines.

Things to watch:

* MANIFEST_REQUEST must be exported once from flows-harness, not copied into both specs. It is a
  boundary string, and the repo forbids keeping two copies in sync by hand.
* recordColoringRequests is a helper the second spec needs, so it must move to the shared module
  rather than being copied.
* flows-harness.ts must not gain a top-level beforeEach. It won't: the moved code is a plain
  function and a constant.
* The new file keeps the .spec.ts suffix under web/tests and stays untagged, so the placement guard
  (tools/tests/test-file-placement.test.mjs) and Chromium-only routing are unaffected.
* The comment on the settling-in stroke test cites pwa-registration.spec.ts. Keep that comment
  verbatim.
* No snapshots or engine-smoke coupling. Test titles don't change, so CI history and flake tracking
  keep the same titles, only under a new file name.
* Once the split lands, run lint plus a targeted `--repeat-each` run of both specs on an explicit
  SPLOTCH_E2E_PORT.

## `web/src/lib/components/SettingsModal.svelte` (466 / 500)

**Reviewer (endorse):** I read SettingsModal.svelte myself and checked the numbers. ESLint max-lines
reports 466. The seam is real, not a shuffle to satisfy the counter. The phone hub list is its own
UI unit: a tile list with inline switches, an activity dot, a screen-reader "new" label and a group
break. It depends on the shell through exactly one callback, openSection. It is also the only part
of the phone view that isn't shared with the drilled-in section view. The shell keeps the things it
actually owns: layout selection, `view`/landing state, the parental gate, pinch zoom, ScrollCue,
card sizing, the resizing-transparency CSS, and the shared .setting-card tokens. HubList then sits
beside WideShell and CompactShell in settings/, the same shape as the existing sibling shells from
ADR-0061.

Line estimates, measured:

* Script, lines 104-140: 35 nonblank lines. 10 are `//` comments and line 117 is a `/** */`, so 24
  counted, not 25.
* Markup, lines 188-224: 37 counted.
* Style, lines 389-537: 133 nonblank, and they all count. My check of the file total agrees that
  style comments count toward the limit (513 nonblank minus 46 `//` lines is about 466).
* Imports removed: lines 3, 4, 9, 18, 19 and 22, so 6. Lines 12 and 20 get edited but stay.
* Added: 2 lines, the HubList import and `<HubList onopen={openSection} />`.

Result: 466 - 194 - 6 + 2 = 268. That is about 230 under the 500 cap and well past the 75-line
headroom goal. HubList itself comes to about 205-212 counted lines.

Checks:

* Bundle boundary: SettingsModal is lazy and HubList is a static child in the same chunk, so the
  startup bundle is unaffected.
* Test placement: no new test files.
* Playwright selectors: settings-shell, settings-hub, settings-toc, settings-phone-labels,
  flows-settings, reduce-motion and helpers.ts all select by class or id (.hub-list,
  .hub-row[data-section], .hub-subtitle, .section-activity-dot, hubNightToggle/hubSoundToggle).
  Those keep matching because the markup and scoped CSS move together, and only the scoping hash
  changes.
* No ADR conflicts.

Corrections to the plan:

1. Point 6 is softer than the test. Dropping the `$lib/components/deferredIcons` side-effect import
   from SettingsModal is required, not something for deferredIcons.test.ts to "decide". Once
   HUB_TOGGLES moves out, SettingsModal names no deferred icon, and the "every side-effect import
   still names a deferred icon" test fails if the import stays. HubList must add that import,
   because it names theme-dark/theme-light and they are in icons/deferred/.
2. Pinning `:global(.hub-icon-svg)` as `.hub-icon :global(.hub-icon-svg)` is a good fix, but it is a
   small selector change and should be reviewed as one, not described as moved as-is.
3. The pinch-zoom comment at lines 142-148 ("the phone hub/section scroll binds it here") stays
   accurate, because the `.settings-zoom` wrapper stays in the shell. Keep HubList inside it, as the
   plan says.

The opposite verdict (raise the cap to about 541) is worse. The hub list is the largest single
responsibility in the file, and it already has a clear interface.

**Recommendation:**

Split. Create web/src/lib/components/settings/HubList.svelte, which takes one prop,
`onopen: (id: SectionId, trigger: HTMLElement) => void`.

Move into it:

* Script: the HubToggle interface with its WHY comment, the HUB_TOGGLES const, and
  firstDrillIn/groupBreakIndex (lines 104-140).
* Markup: the `<ul class="hub-list">` block (lines 188-224), with class names and ids unchanged.
* Style: the hub CSS (lines 389-537), with the `:global(.hub-icon-svg)` rule pinned as
  `.hub-icon :global(.hub-icon-svg)`.
* Imports: SectionIcon, ToggleSwitch, type CommonIconName, settingsState/setSound,
  resolvedTheme/setResolvedTheme, hasSectionActivity, SECTIONS/sectionSubtitle/SectionId, and the
  '$lib/components/deferredIcons' side-effect import.

SettingsModal must drop its own deferredIcons import; deferredIcons.test.ts enforces this. It keeps
`view`, openSection with the parental gate, landing, pinch zoom, ScrollCue, the `.settings-zoom`
wrapper, the card and resizing CSS, the .setting tokens and the 480px query, and renders
`<HubList onopen={openSection} />` inside the zoom wrapper.

Add HubList to docs/ARCHITECTURE.md. Verify with `npm run lint`, `npm run check` and the unit tests
(deferredIcons.test.ts), plus the settings-hub, settings-shell, settings-toc, settings-phone-labels,
flows-settings and reduce-motion E2E specs on an explicit port.

Projected size: SettingsModal about 268 counted lines (466 - 194 - 6 + 2); HubList about 210.

**Risks (proposer):** Measured: the file has 466 counted lines (569 total). Style-block comments
count toward the limit. Moving 25 script lines (104-140), 37 markup lines (188-224) and 133 style
lines (389-537) takes out about 195 lines. About 6 import lines also go, and 1 import plus a 1-line
`<HubList onopen={openSection} />` come in. That leaves about 268 lines, well under the 425 soft
target and about 230 under the 500 cap. HubList.svelte ends up at about 205. (1) Test coupling:
flows-settings, settings-hub, settings-phone-labels, settings-toc, reduce-motion and
tests/helpers.ts:452 select by the classes .hub-list, .hub-row[data-section=…], .hub-subtitle and
.section-activity-dot, and by the switch ids hubNightToggle/hubSoundToggle. Move them as-is, with no
renames. (2) Keep .hub-list inside the shell's `.settings-zoom` bind:this={zoomTarget} wrapper, and
keep ScrollCue/pinchTextZoom in SettingsModal. Pinch text zoom (ADR-0076) and ScrollCue's end()
snippet stay the shell's job. (3) Keep openSection and the parental gate (requireParentalGate +
buttonCenter) in SettingsModal, because they write `view`. HubList only reports which row was
pressed. (4) The .settings-content :global(.setting…) card tokens, the 480px media query
(settings-header/settings-scroll only), and the .settings-header rules stay in the shell because the
wide and section views share them. (5) Bundle boundary: SettingsModal is not a startup-path module
and HubList is a static child in the same lazy chunk, so startup-bundle.spec.ts is unaffected. Check
by running it or the chunk report once. (6) The deferredIcons import must be in the new file: it
names the theme-dark/theme-light icons and SectionIcon deferred icons. SettingsModal keeps its own
copy only if it still names a deferred icon; otherwise deferredIcons.test.ts decides. (7)
SidebarToc.svelte already has its own .section-activity-dot/.visually-hidden copies. Merging them is
out of scope, so don't expand this refactor into that. (8) Named exports and PascalCase are already
met because this is a .svelte component under settings/. The architecture doc's source map
(docs/ARCHITECTURE.md) should list the new settings/HubList.svelte.

## `web/src/lib/components/ColorPalette.svelte` (461 / 500)

**Reviewer (endorse):** I read ColorPalette.svelte (511 physical lines, 473 nonblank, 461 counted)
and checked every consumer the plan names. The seam is real and the numbers hold. I endorse it, with
small refinements to the prop surface.

**Line counts (measured).** Memory confirms that CSS comments inside a `<style>` block count toward
max-lines, so I counted every nonblank line in the regions:

* Style lines 168-306 (base swatch, press and release, the bloom and its keyframes, the
  reduced-motion opt-out, the gradient variant and icon pop): 125 lines.
* The portrait `.color-swatch` size block (336-340): 5 lines.
* The bare-toolbar `.gradient-swatch` rule (500-503): 4 lines.
* About 134 CSS lines leave in total. The child re-wraps the portrait size in its own `@media`
  header, which the parent does not pay for.
* Script: the getRingColor, selectionRingShadow, Icon and pressRelease imports, plus
  playSwatchRelease and handleSwatchCancel, drop about 7-9 counted lines.
* Markup: lines 101-139 are 38 nonblank lines. Two `<PaletteSwatch>` usages take about 22-25, saving
  about 14.
* Add 1 import line: 461 - 134 - 8 - 14 + 1 ≈ 306. The plan's figure of 300 is within noise. The
  file lands about 120 under the 425 soft cap and about 195 under the hard cap. The new
  PaletteSwatch.svelte would be about 175 counted lines.

**Is the seam cohesive or just counter-driven?** Cohesive. The file currently holds two
responsibilities:

* **The bar:** layout, the viewport-driven trim ladders, the phone-landscape hide, bare-toolbar
  positioning, and selection state (selectSwatch, ringAnimateHex, trimRank).
* **The item:** one button's look and feedback (rim, float shadow, press/release, the confirmation
  bloom, the honeycomb variant).

The item block does not read the bar's geometry. It reads only inherited custom properties
(`--selection-ring-width`, `--selection-ring-gap-width`, `--palette-surface`), and those still
cascade across a component boundary.

The one real coupling runs the other way. The ladder thresholds are derived from the swatch size
(60/55px). That link is already enforced by trimGeometry.test.ts, not by co-location, so reading the
size from a second file keeps it as a drift-guarded agreement. That is the pattern CLAUDE.md
sanctions. The one alternative seam is the 117-line trim ladder. It is mechanical, but it has to
stay scoped to `.color-palette`, and moving it to a global stylesheet would need unpinned globals
and add CSS on the startup path. The plan rejects that correctly. Raising the cap is also wrong
here: the file is already 36 over the 425 soft target, and a clean item/bar seam exists.

**Correctness checks:**

* **Specificity.** The ladder becomes `.color-palette > :global(.color-swatch[data-trim-rank='N'])`,
  which compiles to (0,3,0). The child's `.color-swatch.svelte-x { display: block }` is (0,2,0), so
  hiding still wins. This is a pinned compound, which `.claude/rules/svelte.md` allows. The
  `hiddenRanks` regex in trimGeometry.test.ts still matches `data-trim-rank='N'`, and none of the
  rewritten selector lines exceeds print width.
* **`classifies every @media rule`.** It still sees exactly the ColorPalette rules. The parent keeps
  its `@media (orientation: portrait) {` block for `.color-palette` and its bare-portrait block, so
  `phonePaletteHidden` and the ladder counts do not change.
* **Tests to repoint.** Three trimGeometry tests read `.color-swatch {` from ColorPalette and must
  read it from PaletteSwatch: `restates the landscape column geometry` (swatch width),
  `restates the portrait row geometry` (the swatch half), and
  `keeps orientation-driven swatch geometry out of interaction transitions`. The gap and padding
  reads stay on ColorPalette. pressRelease.test.ts line 13 (`palette`) must point at
  PaletteSwatch.svelte. The child needs a literal `@media (orientation: portrait) {` header for
  blockAfter to find.
* **Bundle boundary.** None. It is a static child of a component already on the `/` route chunk,
  with no new edge to a lazy module. Running startup-bundle.spec.ts is enough confirmation.
* **Other checks.** Test placement, named exports and ADRs are unaffected (ADR-0038 is
  scribble-guard behaviour, which is unchanged; ADR-0048 is the hex picker). E2E selectors survive
  because class names and data attributes are unchanged. Only the scoped hash classes change, which
  screenshots do not see.

**Refinements (why "endorse" rather than "revise"):**

1. **Drop the `$bindable` for the custom swatch's element.** `ScribbleTapHandler` takes no
   arguments, so the child should keep its own `bind:this` and call `onselect(buttonEl)`. The
   parent's selectCustomColor then receives the element for `buttonCenter()`. That removes a
   two-writer binding and the `customSwatchEl` state.
2. **Shrink the prop list.** The plan lists 10 props, several of them meaningful for only one
   variant. Replace `ringColor` plus the inline box-shadow string with one
   `ring: string | undefined`. It is the ring colour when the ring shows, and the child computes
   `selectionRingShadow(ring, 'var(--palette-surface, var(--surface))')` and `--ring-color` itself.
   That also moves the colorRing import out of the parent. Prefer a discriminated-union Props type
   (`{ variant: 'flat'; trimRank; animate; startReduced } | { variant: 'custom'; children: Snippet }`),
   so a variant-only prop cannot be passed to the wrong variant. That is the repo's "close finite
   value sets in the type" rule. The erasing/active/ringed logic stays in the parent and passes down
   as `active: boolean` and `ring`.
3. **The bloom exclusion.** It can stay as `:not(.gradient-swatch)` inside the child, or become a
   `.flat` class keyed on the variant. Either works. Keep the `data-start-reduced-motion` output
   byte-identical ('' or undefined) so the prerendered markup does not change.
4. **Update the references and docs.** The comments in ColorMenu.svelte (line 160) and
   ColorPicker.svelte (line 12) name ColorPalette's geometry and trim, which do stay in
   ColorPalette, so they need at most a light touch. Also update the docs/ARCHITECTURE.md source map
   (lines 274 and 295) and consider a PaletteSwatch entry in the ChromeSections styleguide.
5. **Test outcomes.** Given the known local flake, judge palette-trim.spec.ts on CI.

**Recommendation:**

Split. Extract `web/src/lib/components/PaletteSwatch.svelte` as the palette's item component. It
owns the appearance and feedback of one swatch button, and ColorPalette.svelte keeps the bar.

**Moves:**

* **Styles:** style lines 168-306 (125 lines), the portrait `.color-swatch` 55px size block
  re-wrapped in the child's own `@media (orientation: portrait) {`, and the
  `:global(html[data-toolbar='bare']) .gradient-swatch` rule.
* **Markup and handlers:** the button markup, `use:scribbleTap`, `use:pressRelease`,
  playSwatchRelease and handleSwatchCancel.
* **Imports:** Icon and the colorRing helpers move into the child.

**Props (typed as a discriminated union):**

* Common: `active`, `ring?: string` (the child derives the selection-ring shadow and `--ring-color`
  from it), and `hex`/`label` for the data and ARIA attributes.
* `variant: 'flat'`: `trimRank`, `animate`, `startReduced`.
* `variant: 'custom'`: a `children` snippet for the more-colors icon.
* `onselect(el: HTMLButtonElement)`: the child passes its own bound element, so no `$bindable` is
  needed.

**What stays in ColorPalette.svelte:** layout, `--palette-bottom`, the overflow clipping, the
phone-landscape hide, bare-toolbar positioning, and the selection state (selectSwatch,
selectCustomColor, ringAnimateHex/ringStartedReduced as parent state passed down, trimRank,
handlePaletteDown/Up). The trim ladders also stay, rewritten as
`.color-palette > :global(.color-swatch[data-trim-rank='N'])`.

**Follow-ups:**

* Repoint the three `.color-swatch {` reads in trimGeometry.test.ts, and the `palette` source in
  pressRelease.test.ts, at PaletteSwatch.svelte.
* Update the docs/ARCHITECTURE.md source map and the styleguide entry.
* Verify with palette-trim.spec.ts (on CI), startup-bundle.spec.ts, and `npm run lint`.

**Projected size:** ColorPalette.svelte about 305 counted lines, down from 461. That is about 120
under the 425 soft cap and about 195 under the 500 cap. PaletteSwatch.svelte is about 175. No cap
change is needed.

**Risks (proposer):** 1. trimGeometry.test.ts (the `describe('ColorPalette')` block). It currently
reads `.color-swatch {` (column swatch width and the transition assertions) and the portrait
`.color-swatch {` size from ColorPalette's style block. Those reads must be repointed at
PaletteSwatch.svelte, while `.color-palette {` gap and padding stay in ColorPalette. The ladder is
then derived from two files. The "classifies every @media rule" test must still classify only
ColorPalette's rules, so the portrait-size media block moving out is fine. Also check that
PaletteSwatch keeps a plain `@media (orientation: portrait) {` header for blockAfter to find.

2. The trim ladder selectors have to cross the scope boundary. They become
   `.color-palette > :global(.color-swatch[data-trim-rank='N'])`: pinned with a scoped compound, as
   .claude/rules/svelte.md allows. The `data-trim-rank='(\d+)'` regex in hiddenRanks still matches.
   Specificity then beats the child's `.color-swatch.svelte-x { display: block }`, but
   palette-trim.spec.ts must confirm it.

3. pressRelease.test.ts asserts that ColorPalette.svelte contains
   `.color-swatch:global(.releasing) {`. Repoint it at PaletteSwatch.svelte.

4. ColorPalette is on the `/` startup path. A new statically imported child component stays in the
   same route chunk, so this should not add a bundle boundary. Still, run
   web/tests/startup-bundle.spec.ts.

5. E2E selectors (`.color-swatch`, `.gradient-swatch`, `data-color`, `data-trim-rank`) in
   tests/helpers.ts and in the reduce-motion, flows-palette-brush, drawing-motion, ai-minimize,
   palette-trim and bare-toolbar specs all survive, because the class names and attributes are
   unchanged. The palette-trim screenshots are known to flake locally (see memory), so judge them
   against CI.

6. The ring replay behaviour must stay in the parent. ringAnimateHex is shared across swatches, so
   reselecting A after B replays the bloom. Pass it down as a prop, never as per-swatch local state.

7. The prerendered markup has to stay identical (no hydration bail on `/`). Keep attribute output
   the same, including `data-start-reduced-motion` being '' or undefined.

8. Docs to update: comments in ColorMenu.svelte and ColorPicker.svelte that point at
   "ColorPalette's" geometry or trim, the styleguide ChromeSections entry (possibly add
   PaletteSwatch), and the source map in docs/ARCHITECTURE.md.

9. Keep the resting selection ring's `--palette-surface` fallback. The bare toolbar sets that
   variable on `.color-palette`, and the child inherits it through the cascade, so no change is
   needed.

Rejected alternatives: moving the ladder into a global CSS file (it would need an unpinned global
selector, which is banned, and it touches the startup CSS), and moving the bloom keyframes into
app.css (it only saves about 26 lines, a shuffle).

## `web/src/lib/components/ColorPicker.svelte` (461 / 500)

**Reviewer (endorse):** I read the file myself and checked the numbers. The split is sound. Two
details need correcting.

**Measurements**

* ESLint max-lines on `web/src/lib/components/ColorPicker.svelte` reports exactly 461.
* Lines 21-30 (without the retained `hoveredHex`/`pickerEl` lines), 40-126, 133 and 158-167 contain
  78 lines that are not blank and not `//`. The proposal said 76, which is close.
* A few more lines also go: `let pickerEl` + `bind:this` (the action gets `node` directly),
  `isTrackingDrag = false` in `selectColor`, and the same line in `onClose`. That is about 4 more.
* The wiring adds about 5: one import plus a 3-4 line `use:hexSnapGesture={{...}}`.
* Net is about 461 - 82 + 5 = 384 to 395. That is at or under 425 and at least 105 under the 500
  cap, so the target is met.

**Is the seam real?** Yes. Lines 40-126 are a self-contained pointer state machine: snapshot,
nearest-centre snap, capture, drag, commit on up. Nothing renders from it except the `hoveredHex`
callback. `.claude/rules/svelte.md` line 54 says outright that complex gestures belong in
`src/lib/actions/`, and `colorFoldGesture.ts` + `pointerCapture.ts` are exactly the model. This is a
real cohesive move that also fixes a convention miss, not counter-driven. The proposal was right to
reject a `ColorPickerHoneycomb.svelte` split:

* `trimGeometry.test.ts` (`describe('ColorPicker')`,
  `styleBlock('../components/ColorPicker.svelte')`) and `dialogTabletScaling.test.ts` parse this
  file's style block.
* `tools/tokens/lint-token-styles.mjs` also keys on this file path.
* Splitting the CSS would break or spread all three.

**Nothing else breaks:**

* No test or tool references `HEX_SNAP_GAP_SLOP_PX`, `hexSnapRadiusPx` or `snapshotHexCenters`
  outside the component.
* ColorPicker ships only through `overlayChunk.ts`, so a new action imported only by it adds no edge
  to the startup path.
* The new `.test.ts` goes next to the action, which is correct placement.
* No markup classes or style change, so the E2E selectors and picker-trim snapshots are unaffected.
* The comment in `flows-palette-brush.spec.ts:63` says "ColorPicker's 40px snap radius". It stays
  accurate, loosely, since the component still owns the behaviour through the action. Optionally
  reword it to name `hexSnapGesture`.

**Corrections**

1. The proposal names a third E2E gesture case, "lost pointerup". I found only two in
   `flows-palette-brush.spec.ts`: "pointer exploration still snaps a hexagon gap and commits the
   highlighted color" (line 83) and "a tap that lands in a hexagon gap snaps to the nearest swatch"
   (line 131). The lost-up regression is protected only by the pointer-capture comment in the code.
   The new unit test should cover that case explicitly: capture is taken on down, and an up
   delivered after the pointer leaves still commits.
2. The close-reset hook needs a firm choice. Listening on `node.closest('dialog')` couples the
   action to its DOM ancestry. Relying on `lostpointercapture` is not guaranteed when a dialog
   closes without removing the node. Instead, pass the modal's open state as an action parameter and
   reset in `update()` when it goes false:
   `use:hexSnapGesture={{ open: colorPickerModal.open, hover, pick }}`. This is reactive, explicit,
   and has a production caller. It also keeps `onClose` in the component down to
   `hoveredHex = null`.

**Recommendation:**

Split. Create `web/src/lib/actions/hexSnapGesture.ts` with the named export
`hexSnapGesture(node: HTMLElement, params: { open: boolean; hover: (c: string | null) => void; pick: (c: string) => void })`.
Move these into it:

* the `HexCenter` interface
* the private `isTrackingDrag` / `hexCenters` / `hexSnapRadiusPx` state
* `HEX_SNAP_GAP_SLOP_PX` and its WHY comment
* `snapshotHexCenters` and `findHexagonInPicker`
* the down/move/up/cancel/leave listeners, with `capturePointer()` from `./pointerCapture` replacing
  the inline try/setPointerCapture
* a window `resize` listener that drops the snapshot, replacing `<svelte:window onresize>`

`update(next)` swaps handlers and resets the drag state when `next.open` is false. `destroy()`
removes all listeners. Keep exactly: the direct `closest('.hexagon')` hit on down;
stopPropagation/preventDefault on down, move and up; the rule that the up commits the snapped colour
or else the last highlighted one; no `button === 0` filter.

Keep in ColorPicker: `GRIDS`, `hoveredHex`, `selectColor` (minus its `isTrackingDrag` line),
`handleHexClick` (the keyboard `e.detail === 0` path), `scribbleGuard` and `modalDialog` on the
`<dialog>` (with `onClose` reduced to `hoveredHex = null`), all markup, and the entire style block.
`trimGeometry.test.ts`, `dialogTabletScaling.test.ts` and `lint-token-styles.mjs` stay untouched.
Drop `pickerEl` / `bind:this`.

Add a colocated `web/src/lib/actions/hexSnapGesture.test.ts` covering:

* a gap hit snaps to the nearest centre
* a point past the radius falls back to the highlighted colour on up
* a re-snapshot on each down
* the snapshot is invalidated on resize
* cancel clears the drag
* capture is taken on down, so an up after leaving still commits
* a close (`open` going false) mid-drag leaves no stale commit on reopen

Verify with `npm run lint` (expect about 384-395), `npm run check`, the unit tests, and
`flows-palette-brush.spec.ts` and `picker-trim.spec.ts` on an explicit port.

**Risks (proposer):** Counting: ESLint's max-lines counts Svelte `<style>` and HTML comments, and
only blank lines and `//` lines are skipped. By that rule the file measures exactly 461: script 90,
markup 58, style 313. Moving 76 lines and adding about 10 lines of `use:` wiring gives about 395,
105 under the 500 cap and 30 under the 425 soft target. The count depends on how compact the wiring
is and must be re-measured with `npm run lint`.

Bundle boundary: ColorPicker ships only through `components/overlayChunk.ts`, the idle-loaded
boot-hidden overlay chunk. The new action is imported only by ColorPicker, so it adds no edge to the
startup path. `web/tests/startup-bundle.spec.ts` is the gate if that ever changes.

Hot-path rule: `snapshotHexCenters` must stay on pointerdown/first use and must never run per move.
The action must not add a per-move allocation such as returning `{color}` objects.

Behaviour to preserve exactly:

* A tap in a gap resolves through the nearest-centre fallback on pointerdown.
* `e.target.closest('.hexagon')` wins a direct hit.
* stopPropagation/preventDefault stay on down, move and up.
* The keyboard path, `handleHexClick` with `e.detail === 0`, stays in the component.
* `scribbleGuard` stays on the `<dialog>`.
* Don't add a `button === 0` filter during the move. That would be a behaviour change and belongs in
  its own commit.

State wiring: `onClose` currently resets `isTrackingDrag` as well as `hoveredHex`. Once
`isTrackingDrag` is private to the action, the action needs its own close/reset hook, or a stale
drag could commit on the next open. Of the gesture cases in `flows-palette-brush.spec.ts` (drag, gap
tap, lost pointerup), the drag and gap-tap cases select `.hexagon` elements directly; the
lost-pointerup case is the one with no direct selector. All must stay green.

Untouched: the CSS-parsing guards `trimGeometry.test.ts` and `dialogTabletScaling.test.ts`, and the
E2E selectors (`.grid.landscape .row.r5 .hexagon.c1`, `#color-picker .hexagon`), because no markup
or style moves.

`launchGuard.ts` and `hexPickerLayout.ts` mention ColorPicker in comments. Only update them if a
comment names something that moved.

## `web/tests/flows-palette-brush.spec.ts` (455 / 500)

**Reviewer (endorse):** I read the file myself and re-measured it by counting nonblank lines that
aren't `//` comments. The file has 654 physical lines and 455 counted lines, which matches the
stated figure.

**The seam is real.** It is not a shuffle to satisfy the line counter. The last part of the file,
from the comment at physical line 498 to the end, tests the Actions Panel's own flyout and drawer
behavior:

* focus returns to the trigger on Escape, on a keyboard pick, and on a second tap of the trigger;
* the drawer motion marker (`data-drawer-motion`) is cancelled by rotation and cleared when no
  transition starts;
* the Settings tool-drawer switch leaves the drawer open.

None of these tests picks a color or paints. The `tapTriggerLikeSafari` helper and
`STALLED_DRAWER_TRANSITION_DURATION` (line 66) are used only in this region. The first part of the
file still covers one subject: choosing and applying a color or brush (palette, picker snap,
Scribble guard, eraser, eraser bubble).

**Line counts:**

* The moved region is 124 counted lines, against the plan's 125.
* The first part (lines 1-497) is 331 counted lines. Removing the constant and the
  `openSettingsModal` line from the multi-line helpers import gives about 329. Dropping
  `openStrokeMenu` from the single-line `flows-harness` import doesn't change the count. The plan's
  327 is slightly low, but the result is still well under 425, leaving about 96 lines under the 425
  soft target and about 171 under the 500 hard cap.
* The new spec comes to about 128-130 counted lines (124 plus 3 import lines plus the constant),
  against the plan's 133. That is close enough.

**Risks checked:**

* **Placement:** the new `.spec.ts` stays in `web/tests`, so the test-placement guard is satisfied.
* **Test discovery:** `git grep` finds no test-list or shard registry that names the file, so
  nothing needs registering.
* **Imports:** there are no cross-spec exports and no bundle boundary in play, since these are
  Playwright specs.
* **Snapshots:** the file has none, so no baselines move.
* **`!important`:** it appears only inside `addStyleTag` strings, which the file already carries
  today.
* **Imports left behind:** `openDrawer`, `openBrushMenu`, `pickBrush` and the `Page` type are all
  still used in the first part (lines 276-468, and `pickerGapBeside`). Removing `openSettingsModal`
  and `openStrokeMenu` is correct.

**Minor corrections:**

* The scratchpad pointer is at `docs/scratchpad/popover-api-flyout-eval-2026-08.md:31`, not line 30.
* The other references stay accurate because the eraser-bubble, colour-picker and synthetic-touch
  Scribble tests remain in `flows-palette-brush`: `docs/TESTING.md:456`, ADR-0080:134, three
  flake-hunt scratchpads, and the `engine-smoke.spec.ts:18` comment.

**Two things considered and rejected:**

* *Also moving 'action buttons activate on a pointer press alone' (line 285).* It does touch action
  buttons, but it belongs to the Scribble-guard group, so leaving it is right.
* *Naming the file `actions-panel-flyouts.spec.ts` to sit beside `actions-panel-layout.spec.ts`.*
  That would work, but the `flows-*` prefix fits a behavior/flow spec, so the proposed name is fine.

**Raising the cap instead would be worse.** The file holds two separate subjects, and a clean split
exists that costs nothing.

**Recommendation:**

Split. Move physical lines 498-654 of `web/tests/flows-palette-brush.spec.ts` into a new
`web/tests/flows-actions-panel.spec.ts`. That region holds:

* the focus-restoration comment and the Escape and keyboard-pick tests;
* the rotation-signal drawer-cancel loop;
* the no-transition motion-marker test;
* the Settings tool-drawer-switch test;
* the `tapTriggerLikeSafari` helper and its two trigger-tap tests.

Take `STALLED_DRAWER_TRANSITION_DURATION` with it; it is only used there. The new file imports:

* `expect`, `test` and `type Page` from `@playwright/test`
* `gotoApp` and `openSettingsModal` from `./helpers`
* `openBrushMenu`, `openDrawer` and `openStrokeMenu` from `./flows-harness`

In `flows-palette-brush`, drop the `openSettingsModal` and `openStrokeMenu` imports and the
constant. Keep test titles unchanged.

Update the pointer at `docs/scratchpad/popover-api-flyout-eval-2026-08.md:31` to name the new file.
A dated addendum is fine there, since scratchpad notes are dated records.

Verify with
`SPLOTCH_E2E_PORT=<port> npm run test:e2e -- flows-actions-panel flows-palette-brush --workers=1`,
plus lint.

Projected size: about 329 counted lines for `flows-palette-brush.spec.ts` and about 129 for the new
spec. Both stay under the 500 cap, with `flows-palette-brush` about 96 under the 425 soft target.

**Risks (proposer):** No bundle-boundary or import-cycle risk: this is a Playwright spec in
web/tests, where placement guard tools/tests/test-file-placement.test.mjs requires .spec.ts files to
live. playwright.config.ts has no testMatch list or per-file registry, so the new file is picked up
automatically. The only shared helpers already live in ./helpers and ./flows-harness. Nothing is
exported between specs. Test titles keep their exact text, so flake-history lookups by title still
work, but their file path changes. Update the doc pointers in the same change.
docs/scratchpad/popover-api-flyout-eval-2026-08.md line 30 says the Escape/focus fixes are "covered
by flows-palette-brush.spec.ts". That should name flows-actions-panel.spec.ts. Scratchpad notes are
dated records, so an added pointer is acceptable instead of a rewrite. The other references stay
accurate after the split, because the eraser-bubble and color-picker tests remain in
flows-palette-brush: docs/TESTING.md:456, ADR-0080 line 134, the flake-hunt scratchpads, and the
engine-smoke.spec.ts:18 comment. There are no snapshots, so no baseline moves. The rotation-signal
loop and the Settings drawer test inject `!important` only through page.addStyleTag inside test
strings, which lint:tokens already accepts in the current file, so moving them changes nothing
there. Use a single-worker targeted run to confirm both files pass after the move
(SPLOTCH_E2E_PORT=<port> npm run test:e2e -- flows-actions-panel flows-palette-brush --workers=1).
The result is about 327 counted lines for flows-palette-brush (well under the 425 soft target) and
about 133 for the new spec.

## `web/src/app.html.test.ts` (454 / 500)

**Reviewer (endorse):** I read the whole file and counted it myself, skipping blank lines and
whole-line comments the way the max-lines rule does. The total is 454, which matches the plan.

**Region counts**

* Prerendered-head describe (L134-140): 7 counted lines.
* Theme-color behavioural describe (L142-257): 89.
* Reduce-motion describe (L259-335): 63.
* Fixture block (sourceFile, html, bootScript, themeColorMetaMarkup, UNPAINTED, runBootScript at
  L56-96): 26.
* bootLiteral and bootStringLiteral (L122-132): 10.

**Projected size of the remainder: about 256**

* Moving the three describes removes 159, leaving 295.
* Moving the fixture and helpers removes about 36, leaving about 259.
* Imports lose about 15: the reducedMotion block (7) goes, and the theme block (9) shrinks to a
  one-line RESOLVED_THEMES import. That leaves about 244.
* The multi-line harness import adds about 8–12.

The result is well under 425, and the plan's 255-265 estimate is right.

**The seam is real, not just a way to get under the counter**

* The two behavioural suites run the shipped script against live exports: `resolveTheme` and
  `resolveReducedMotion` under a preference × OS matrix. Each has its own matchMedia stub and
  OS-listener session.
* The rest of the file is static text parsing plus attribute-seeding runs.
* The only coupling is the boot-script fixture. Moving it to a colocated `*TestHarness.ts` follows
  five existing precedents: tiledRenderer, webStore, drawingSound, pwa/updates and settlement.

**Checks I made**

* Every file stays a `.test.ts` under `web/src`, so the placement guard and bundle boundaries are
  unaffected (test-only code).
* `themeColorMetaMarkup` and `UNPAINTED` are used only inside `runBootScript`, so both can stay
  private to the harness.
* The remainder no longer needs `vi` (only the theme and reduce-motion suites use it).
* `sourceFile` must be exported, because the remainder still reads webBackHandler, SvelteKit's
  constants.js and settings.svelte.ts through it.
* `import.meta.url` still resolves correctly as long as the harness sits in `web/src/` next to
  `app.html`. Calling `sourceFile('./app.html')` inside the harness passes the path as an argument,
  so Vite's rewrite of `new URL('./literal', import.meta.url)` never fires.
* knip is satisfied: `bootLiteral` and `sourceFile` are used by the remainder, `bootStringLiteral`
  by the remainder and the theme file, and `runBootScript`/`bootScript` by all three.
* No test file may carry the node-environment annotation, as the plan already notes.

**Minor corrections**

1. The claim that the split "retires the declaration-order hazard" overstates it. `runBootScript`
   already reseeds the tag on every call, which is the fix from flake-hunt-2026-09-22. Splitting
   only removes the shared file order; it does not add safety.
2. Leave "stamps data-theme for every resolved theme" (around L549) in the remainder. It is a text
   mirror, which matches the seam's (a)/(b) split.
3. The HTML comment edit at `app.html:97` is outside the `<script>` block, so the CSP hash is
   unaffected. Still run the CSP hash check before pushing, per memory.
4. Also update the source comments that name `app.html.test.ts` for the moved suites:
   * `lib/platform/reducedMotion.ts:17` ("app.html.test.ts runs it") should name the reduceMotion
     file.
   * `lib/theme.ts:38` and `:72` should name the themeColor file.

   The CLAUDE.md rule against stale references applies to these as well as the docs the plan already
   lists. The other references, the generic exemplar mentions and the sourceFile precedent comments,
   still point correctly at `app.html.test.ts`.

Raising the cap would be worse. The file is already over the soft cap, and these suites guard two
different modules with no shared test logic.

**Recommendation:**

Split into four files. Projected: about 256 counted lines left in app.html.test.ts, about 108 in the
theme-color file, about 73 in the reduce-motion file, and about 38 in the harness.

1. **New `web/src/appHtmlBootTestHarness.ts`.** Move the fixture here with named exports:
   * Exported: `sourceFile`, `bootScript`, `runBootScript`, `bootLiteral`, `bootStringLiteral`, and
     `html` only if a consumer needs it.
   * Kept private: `themeColorMetaMarkup` and `UNPAINTED`.
   * Keep the Vite URL-rewrite comment and the fixture-ownership comment.
2. **New `web/src/app.html.themeColor.test.ts`.** Move the prerendered-head describe (L134-140) and
   the theme-color describe (L142-257), with their theme, storage and `vi` imports.
3. **New `web/src/app.html.reduceMotion.test.ts`.** Move the reduce-motion describe (L259-335).
4. **What stays in `app.html.test.ts`:**
   * The two Back/history-key tests.
   * The "mirrors the state modules" describe, including the data-theme text test.
   * The toolbar describe.
5. **Repoint these references in the same change:**
   * `app.html:97`
   * `docs/ARCHITECTURE.md:196`
   * `lib/platform/reducedMotion.ts:17`
   * `lib/theme.ts:38` and `lib/theme.ts:72`
6. **Verify before pushing:**
   * Leave ADR-0071's mention as historical prose.
   * Re-prove the kill-check for the dark theme-color hex against the new theme-color file.
   * Run `lint:dead` and the CSP hash check.

The cap stays at 500.

**Risks (proposer):** Measured with ESLint max-lines at 454 counted lines. Counted lines moved out:
theme blocks 96, reduce-motion 63, fixture definitions about 32. Imports shrink by about 15: the
reducedMotion import block goes, the theme import shrinks to RESOLVED_THEMES, and vi goes. About 8
are added for the harness import. That projects to about 255-265. The theme-only split alone
(about 330) would also clear the 425 soft cap. Moving both keeps the two parallel behavioural suites
symmetric.

Environment: none of the three files may carry the `@vitest-environment node` annotation. The
original header warns that even mentioning that annotation in a leading comment applies it. The
theme and reduce-motion files run the script against localStorage, document and matchMedia, so they
need happy-dom. The remainder still imports settings.svelte.ts.

knip (lint:dead): every harness export must be imported by at least one test file. bootLiteral is
used only by the remainder, and bootStringLiteral by both the remainder and the theme file.
UNPAINTED can stay unexported inside the harness.

Test placement: the harness is a plain .ts that imports vitest. That is allowed; the five existing
*TestHarness.ts files do the same. The new test files stay colocated under web/src. Nothing crosses
a bundle boundary, because this is test-only code and app.html is not touched.

Docs and comments to repoint in the same change, keeping app.html.test.ts as the generic drift-guard
exemplar:

* The HTML comment at web/src/app.html:97 says app.html.test.ts runs the theme script. It should
  name app.html.themeColor.test.ts. The comment sits outside the <script> at L104-246, so the CSP
  script-src SHA-256 is unaffected, but confirm with the CSP hash check before pushing.
* docs/ARCHITECTURE.md:196 (the reducedMotion row) should name app.html.reduceMotion.test.ts.
* The mention in ADR-0071 (L264) of the theme-color run is historical ADR prose, so leave it or add
  an amendment note.
* CLAUDE.md, ADR-0168, PERFORMANCE.md and the scrapbook inventory still point correctly at
  app.html.test.ts.

Since the theme/reduce-motion tests move, re-prove the kill-check in
docs/scratchpad/kill-check-audit-2026-08-15.md (the boot script's own dark theme-color hex goes red)
against the new file.

## `web/src/lib/components/design/SegmentedPicker.svelte` (453 / 500)

**Reviewer (endorse):** I read the file and checked the counts. ESLint reports 453 counted lines out
of 555 physical lines. The 102 skipped lines are exactly the 50 blank lines plus the 52 script
comment lines (`//` and JSDoc). So every CSS `/* */` comment and the two HTML comments are counted,
as the proposal says. That CSS carries design reasoning, and trimming it would only satisfy the
counter.

Thumb seam (lines 103-138). This is a real responsibility: measuring with offsetLeft/offsetWidth, a
ResizeObserver, and a requestAnimationFrame latch that holds travel off until after the first
placement. It is the only imperative DOM-lifecycle code in the picker. It counts 31 lines (103, 104,
107, 108, 110-123, 125-127, 129-138). The replacement is 1 import line plus the
`createSegmentThumb({ track, …, index })` call. Written on one line that call is about 100
characters with the 2-space indent, so Prettier (printWidth 100) will likely wrap it to 5 lines. Net
saving is about 25, which puts the file at about 428. The proposal's "about 427" is right. There is
precedent for a factory in a `.svelte.ts` file that sets up `$effect`s during component init:
`web/src/lib/components/settings/settingsMediaQuery.svelte.ts`, and the pinchZoom and pinchTextZoom
actions.

Roving seam. rovingIndex (142-147) counts 6 lines and becomes 1:
`$derived(rovingTabIndex(options, isSelected))`. moveWithArrow (151-166) counts 16 lines and becomes
about 8. The import is about 80 characters, so one line. Net saving is about 12, which lands the
file at about 415-416. The proposal says 414, which is close enough. That is at or under 425 with
about 85 lines of headroom under the 500 cap.

The roving move looks the most counter-driven, but a grep of web/tests found no Playwright spec that
uses the arrow keys on a picker. The APG wrap-and-skip-disabled contract therefore has no test
today. Pure helpers with a colocated unit test add real coverage, so this move stands on its own
merits. Slider.svelte also handles arrow keys, but it steps a value rather than moving through a
radio group, so it can't reuse these helpers and has no duplicate to fold in.

Checks:

* **Bundle boundary:** none. The picker is reached only from lazily loaded settings sections, the
  styleguide, /design, /beta and ReportFields.
* **Test placement:** a colocated `.test.ts` under web/src is correct.
* **Unchanged guards:** phoneStep.test.ts reads the 540px @media rule, and app.css targets
  `.picker .option`. No CSS moves, so neither is affected.
* **Snapshots:** no DOM change.
* **ADRs:** none govern this primitive.
* **Docs:** the design skill's primitives table and docs/ARCHITECTURE.md name SegmentedPicker.svelte
  only. Neither needs an update, though a one-line mention of the helper is optional.

Refinements the implementer needs:

1. Name the factory's element-array parameter `cells` or `optionEls`, not `options`. `options` is
   the component's option-data prop, and reusing the name invites a mix-up.
2. Move placeThumb verbatim. It reads `thumbWidth` inside the placement `$effect` (the
   `firstPlacement` check), which makes thumbWidth a tracked dependency. Rewriting it with `untrack`
   or a plain `let` would change when the first-paint travel latch fires.
3. Pass `optionEls` by reference as a plain untracked array. The ResizeObserver effect must iterate
   it when it runs, not take a copy. `trackEl` stays `$state` and is passed as a getter. The
   effect's cleanup must still cancel a pending travelFrame.
4. Keep `thumbIndex` in the component and pass it as a getter.
5. Give `nextEnabledIndex` and `rovingTabIndex` structural parameter types (`{ disabled?: boolean }`
   / `{ value: T; disabled?: boolean }`) rather than importing SegmentedPickerOption back from the
   component's module script.
6. If only the thumb move lands, the file sits at about 428, 3 over the soft target. Land both.

Opposite verdict (raise the cap to about 530): the file is cohesive, but the thumb is a genuinely
separable lifecycle concern and the roving math gains test coverage it lacks today. Splitting beats
raising the cap here.

**Recommendation:**

Split, as proposed:

* **Thumb move:** add `web/src/lib/components/design/segmentThumb.svelte.ts` with a named export
  `createSegmentThumb({ track: () => HTMLDivElement | undefined, cells: HTMLElement[], index: () => number })`.
  It owns `$state` x, width and travels, the untracked travelFrame handle, a verbatim placeThumb,
  the placement `$effect`, and the ResizeObserver `$effect` with its requestAnimationFrame cleanup.
  It returns read-only getters, and the component calls it synchronously during init.
* **Roving move:** add `web/src/lib/components/design/rovingRadio.ts` with the pure functions
  `arrowDelta(key)`, `nextEnabledIndex(options, from, delta)` and
  `rovingTabIndex(options, isSelected)`. Add a colocated `rovingRadio.test.ts` covering wrap at both
  ends, skipping disabled options, the case where only one option is enabled, and the fallback to
  the first enabled option when nothing is selected. The component keeps preventDefault, onSelect
  and focus.
* **What stays:** thumbIndex, all markup and all CSS stay in the component.
* **Projected size:** about 415 counted lines (453 − 25 − 12), about 85 under the 500 cap, so the
  default cap stays as it is.
* **Verification:** run `npm run check`, `npm run lint`, the unit tests, and
  web/tests/design.spec.ts plus orientation-picker.spec.ts.

**Risks (proposer):** Bundle boundary: none found. SegmentedPicker is reached only from lazily
loaded settings sections (it already imports $lib/components/deferredIcons), /design, /beta, the
styleguide and ReportFields. None of these is a startup-path module, so the two new static imports
add no edge that web/tests/startup-bundle.spec.ts guards. Rune placement: createSegmentThumb must be
a .svelte.ts file and must be called synchronously in the component script, not in onMount, because
its $effects need the component's effect owner. optionEls must stay a plain untracked array passed
by reference, with bind:this={optionEls[index]} unchanged (svelte.md: never bind refs into $state
unless something reacts to them). trackEl stays $state because the ResizeObserver effect has to
re-run when it binds. Pass it as a getter, not a value. Its cleanup must still cancel a pending
travelFrame on teardown. Conventions: named exports only; camelCase lib-module file names; the
colocated .test.ts goes under web/src (tools/tests/test-file-placement.test.mjs); no ADR governs
this primitive. Unchanged guards: phoneStep.test.ts reads SegmentedPicker.svelte for the 540px
@media step, and app.css targets .picker .option. Both stay in the component because no CSS moves.
Behaviour coverage: web/tests/design.spec.ts and orientation-picker.spec.ts exercise the picker end
to end. Run them together with npm run check and npm run lint afterwards, because the counter
includes style comments. Line estimate: the thumb move saves about 31 counted lines and adds about 5
for the factory call and import; the roving move saves about 12 and adds about 4. The file drops
from 453 to about 414, 86 under the 500 cap. If only the thumb move lands, the file sits at about
427, which is fine against the cap but just over the 425 soft target.

## `web/tests/helpers.ts` (453 / 500)

**Reviewer (endorse):** I checked the plan against the file and it holds up.

* **Line count.** The moved regions are lines 457-480 and 651-699 of web/tests/helpers.ts. They
  contain no block comments, so a nonblank, non-`//` count gives exactly 47 counted lines. Starting
  from ESLint's 453, that leaves 406. The default cap is 500 (eslint.config.js:431), so this is 94
  lines of headroom and 19 under the 425 soft target. It meets the 75-line goal without raising the
  cap.
* **The seam is real, not driven by the counter.** Six symbols make up one responsibility: the two
  DISCLOSURE_PICK_* timeouts, openHydratedContents, pinContentsRow,
  expectContentsPanelCappedInsideViewport and expectBottomedPanelScrollsRowToPin. They are all
  assertions about the TocDisclosure component on document pages. They use only expect, Locator and
  Page from @playwright/test, and nothing else in helpers.ts calls them. openHydratedContents is
  currently sandwiched between openHubSection and activeNavRowInsideColumn, in the middle of the
  Settings cluster. It is already misplaced there, so the move improves cohesion as well as the
  count.
* **Importers.** changelog.spec.ts and privacy.spec.ts import only these four helpers from
  './helpers', so each switches its import wholesale to the new module. design.spec.ts keeps gotoApp
  and openSettingsModal from './helpers' and adds a second import.
* **Other references.**
  * The comment at web/src/lib/components/nav/TocDisclosure.svelte:45 gives the path
    `tests/helpers.ts` and must be updated, as the plan says.
  * docs/TESTING.md:389 names openHydratedContents without a path, so it stays valid.
  * docs/scratchpad/flake-hunt-2026-09-22.md cites helpers.ts only for reloadAfterDialogClose, which
    is not moving.
* **Conventions.**
  * No bundle boundary is involved; this is test-only code.
  * Placement is fine: a plain support .ts already sits in web/tests (admin-helpers.ts,
    flows-harness.ts, engine-harness.ts).
  * No import cycle can form, exports stay named, and no snapshots or ADRs are affected.
* **The opposite verdict.** A raised cap would be the weaker choice: the file already has a clean
  seam, and raising the cap would leave a misplaced helper where it is.
* **Optional naming nit.** `toc-disclosure-helpers.ts` would name the component more precisely.
  `contents-helpers.ts` also works, because "contents row" is the UI name the comments use.
* **Follow-up seam.** The plan's later candidate, the Settings cluster (about 58 lines, importing
  retryOpen and settleFlyIn one way), is reasonable to keep in reserve.

**Recommendation:**

Split. Create web/tests/contents-helpers.ts, a named-export module that imports only { expect, type
Locator, type Page } from '@playwright/test'. Move these symbols into it with their WHY comments:
DISCLOSURE_PICK_ATTEMPT_TIMEOUT_MS, DISCLOSURE_PICK_TIMEOUT_MS, openHydratedContents (currently
lines 457-480), pinContentsRow, expectContentsPanelCappedInsideViewport and
expectBottomedPanelScrollsRowToPin (currently lines 651-699). That is 47 counted lines.

Update the imports:

* changelog.spec.ts and privacy.spec.ts: point the whole import at the new module.
* design.spec.ts: split the import; gotoApp and openSettingsModal stay in './helpers'.

Also change the path in the comment at web/src/lib/components/nav/TocDisclosure.svelte:45 to
tests/contents-helpers.ts.

Result: helpers.ts drops from 453 to 406 counted lines, 94 under the 500 cap. Leave the cap
unchanged. If the file later climbs back toward 425, split out the Settings open-and-measure cluster
next.

**Risks (proposer):** No bundle boundary is involved: web/tests is test-only code that never enters
a Rollup chunk. engine-smoke.spec.ts must stay cross-engine portable (web/tests/CLAUDE.md). It does
not import these helpers, and the moved code uses no CDP or dev-harness routes, so the new module is
portable anyway. Test placement: tools/tests/test-file-placement.test.mjs governs *.spec.ts and
*.test.ts. A plain support .ts in web/tests already exists as admin-helpers.ts, engine-harness.ts
and flows-harness.ts, so the new file is allowed; confirm it with `node --test`/vitest on
test-file-placement after the move. tools/tests/skill-spec-citations.test.mjs checks cited test
paths in skill and doc prose; the only path citation is the TocDisclosure.svelte comment, which is
updated. No import cycle: the new module imports nothing from helpers.ts. Named exports only
(eslint) are kept. Leaving the Settings cluster in place means helpers.ts can still outgrow the soft
cap later; its planned follow-up seam is described above.

## `web/tests/engine-pointer-recovery.spec.ts` (450 / 500)

**Reviewer (revise):** The seam is real, and I'd keep it. The edge-swipe guard tests exercise a
different engine mechanism from the rest of the file: the edge-band candidate decision, choosing the
guarded edge from orientation, and gesture insets. Their own block comment (lines 332-336) already
frames them as a group. They are the only users of BAND_START_PX, SWIPE_TRAVEL_PX,
EDGE_SWIPE_BAND_PX, EDGE_SWIPE_DECISION_PX and GESTURE_INSET_MIN_PX. Keeping the mouse hover-out
test in the recovery file is right: it is about handling pointerout for a pointer that never drew.
Test placement, the engine-harness import rule and bundle boundaries are all fine, since both files
are Playwright specs in web/tests. No ADR, snapshot or spec-name pin is involved.

Three problems need fixing:

1. The plan says the recovery tests never use CANVAS_PX. That is wrong. Line 30, in the premise
   check of the first test ('a pointer resumed far away after an idle gap…'), is
   `expect(Math.hypot(220, 220)).toBeGreaterThan(POINTER_RESUME_JUMP_RATIO * CANVAS_PX)`. Moving
   CANVAS_PX as proposed breaks that test's compile. Copying it into both specs would make two
   copies of a value that already mirrors the 300px CSS in
   web/src/routes/dev/engine/+page.svelte:353-354. A better fix: that test already calls
   boundingBox(), so use `box.width` there. Then CANVAS_PX moves only with the guard tests.

2. The line numbers are off by about 11. The hover test is at 475-490, not 486-501, and the guard
   blocks are 332-474 and 491-555. The hover test is 13 counted lines, not 10.

3. I measured with the max-lines rules (blank and comment lines skipped). The guard tests with their
   WHY comments are 111 + 53 = 164 counted lines, not 167. Moving them, the two BAND/SWIPE constants
   and CANVAS_PX, and dropping the three import names (Prettier then joins the two-name strokeMath
   import onto one line of about 88 characters, under printWidth 100) leaves about 450 - 164 - 3 -
   6 = 277-278 counted lines. The plan's figure of about 277 holds. The new file is about 164 + 5
   (multi-line strokeMath import) + 1 (harness import) + 3 constants, about 173. Both files end up
   far below the 425 soft target.

The docs/QUALITY.md:54 update is right. Line 108 and docs/TESTING.md:416 point at tests that stay,
so they need no change. Raising the cap would be worse: this is a clear two-responsibility split,
not a cohesive file.

**Recommendation:**

Split along the edge-swipe gesture-guard seam. Create web/tests/engine-edge-swipe.spec.ts and move
into it the 8 guard tests with their WHY comments. That is lines 332-474 (the portrait block
comment, bottom-edge discard, sideways-from-bottom, upward-above-band, stationary tap, discarded
swipe completing the group, trailing pointercancel after a discard) and lines 491-555 (phone
landscape short sides, tablet landscape bottom inset). Also move the constants CANVAS_PX,
BAND_START_PX and SWIPE_TRAVEL_PX with their comments, and the EDGE_SWIPE_BAND_PX,
EDGE_SWIPE_DECISION_PX and GESTURE_INSET_MIN_PX imports. The new file imports
`{ expect, state, test }` from './engine-harness', and only the names it actually uses. In
web/tests/engine-pointer-recovery.spec.ts, keep the hover-out test (lines 475-490). Change the
resume test's premise at line 30 from CANVAS_PX to `box.width`, because box is already in scope.
Trim the strokeMath import to POINTER_RESUME_GAP_MS and POINTER_RESUME_JUMP_RATIO. Add
engine-edge-swipe.spec.ts beside engine-pointer-recovery.spec.ts in the docs/QUALITY.md:54 evidence
line. Projected result: about 278 counted lines left in the recovery file (222 under the 500 cap)
and about 173 in the new file. No cap change.

**Risks (proposer):** Low. There is no bundle boundary because both files are Playwright specs under
web/tests, which matches the test-placement drift guard. The new spec has to import `test` from
./engine-harness, not @playwright/test, or tools/tests/e2e-harness-imports.test.mjs fails and the
tests run against about:blank. The landscape tests call window.__engine.resizeTo(400, 300) inside
their own page, and the harness fixture gives each test a fresh page, so moving them keeps them
isolated. Adding a spec file changes Playwright shard balancing slightly, but no spec list pins file
names. Any grep- or glob-based spec inventory (for example docs or CI filters that name
engine-*.spec.ts) picks up the new file automatically. Update docs/QUALITY.md so its 'Backed by'
evidence does not quietly drop the edge-guard coverage. The projection is about 277 counted lines
left in the recovery file (450 - 167 moved test lines - 3 constant lines - 3 import-name lines),
about 223 lines under the 500 cap. The new file is about 179 lines. Both are well within the 425
soft target.

## `web/src/lib/components/styleguide/PrimitiveSections.svelte` (444 / 500)

**Reviewer (endorse):** The seam is real and not driven by the line counter. The scroll-cue group is
the only part of web/src/lib/components/styleguide/PrimitiveSections.svelte with its own data
(overflowingLines/fittingLines, lines 63-81), its own five paragraphs and three live specimens
(lines 222-324), a style region nothing else uses (.cue-* and figcaption, lines 429-488), and an
invariant enforced by a test (--scrollport-bottom-padding on .cue-scroller). It matches the existing
precedent: ButtonSpecimens.svelte and FocusSpecimens.svelte already left this file the same way and
each carries its own h3/p styles.

I measured it with ESLint. Piping the file through `eslint --stdin` with the repo's max-lines
options gives the current count of 444. I then simulated the split: dropped lines 63-81, 223-324 and
429-488, and replaced line 10 and line 222 with the new import and `<ScrollCueSpecimens />`. The
result is 274 counted lines, not the ~285 the plan projected. That is 226 under the 500 cap and 151
under the 425 soft target. The moved region is about 166 counted lines (15 script + 99 markup + 52
style). With imports and about 20 lines of copied h3/code/.file-path/.sub-intro rules, the new file
lands at about 190, comfortably under any target.

Other checks:

* **Drift guard:** web/src/lib/components/design/ScrollCue.scrollportPadding.test.ts keys HOSTS by
  file path. It scans every .svelte file for a bare `<ScrollCue />` and requires an exact match, so
  the key must move to 'lib/components/styleguide/ScrollCueSpecimens.svelte' in the same commit, as
  the plan says. The moved .cue-scroller rule still declares the property.
* **Bundle boundary:** none. routes/design/+page.ts loads PrimitiveSections through a dynamic
  import(), so the static child import stays in the lazy styleguide chunk.
* **Selectors:** nothing in web/tests or web/src selects `.primitive-specimens`.
  `<ScrollCueSpecimens />` stays inside the `<section>`, outside `{#key theme}` as it is today, so
  the #scroll-cue id, aria-labels and class names render unchanged.
* **Snapshots:** I found no toHaveScreenshot calls in the scroll-cue or design specs.

Minor notes for whoever implements it:

* Copy the h3 rule with the same `22px 0 var(--space-1)` margin. FocusSpecimens uses
  `var(--space-6)`, and copying that instead would shift the layout.
* The new component can be a multi-root fragment (h3, p, div) with no wrapper element, so the
  parent's `section { margin-top }` and flow are untouched.
* The long a11y HTML comment and the svelte-ignore lines move with the markup.

A raise-cap verdict would be worse here. The file is a gallery of independent specimens, and this
group is the largest, most self-contained one.

**Recommendation:**

Split. Extract the Scroll cue specimen group into a new sibling,
web/src/lib/components/styleguide/ScrollCueSpecimens.svelte.

Move these:

* The ScrollCue import, a primitiveSections import, and the overflowingLines/fittingLines constants
  with their WHY comment (lines 63-81).
* The markup from the `primitiveSections.scrollCue.id` h3 through the closing `.cue-demo` div (lines
  222-324), including the a11y comment and the svelte-ignore directives.
* The styles .cue-demo, .cue-figure, .cue-scroller (keeping `--scrollport-bottom-padding` and its
  WHY comment), .cue-overlay-demo, .cue-overlay-scroller, .cue-lines and `.cue-figure figcaption`
  (lines 429-488).

Also copy the local h3 (keep the 22px top margin), code, .file-path and .sub-intro rules, following
the ButtonSpecimens/FocusSpecimens precedent.

In PrimitiveSections.svelte:

* Replace the ScrollCue import with `import ScrollCueSpecimens from './ScrollCueSpecimens.svelte'`.
* Render `<ScrollCueSpecimens />` in the same spot, inside `<section>` and outside `{#key theme}`.

In the same commit, move the HOSTS key in
web/src/lib/components/design/ScrollCue.scrollportPadding.test.ts to
'lib/components/styleguide/ScrollCueSpecimens.svelte' (value stays ['.cue-scroller']).

Measured with ESLint on a simulated split, PrimitiveSections.svelte drops from 444 to 274 counted
lines. ScrollCueSpecimens.svelte comes to about 190. The cap stays at 500.

**Risks (proposer):** 1) Drift guard: ScrollCue.scrollportPadding.test.ts keys its HOSTS map by file
path and requires the discovered hosts to match exactly, so its key must move in the same commit.
The `--scrollport-bottom-padding` declaration must stay on the moved `.cue-scroller` rule. 2) E2E
specs select these specimens on /design by aria-label, class names, and the #scroll-cue section id
(web/tests/scroll-cue.spec.ts, design.spec.ts, scrollbar-chrome.spec.ts,
page-short-viewport.spec.ts). Keep every class, aria-label, and the `data-sg-section` h3 unchanged
so the rendered DOM stays the same apart from Svelte's scoped hash. Check for pixel snapshots of the
/design scroll-cue region before relying on that. 3) Bundle boundary: none. PrimitiveSections loads
through a dynamic import() in routes/design/+page.ts, so a static child import from it stays in the
same lazy styleguide chunk and does not reach the startup path. 4) The duplicated
h3/code/.sub-intro/.file-path rules follow existing sibling precedent. If the reviewer objects, a
shared styleguide CSS partial would be the alternative, but the siblings already duplicate these
rules. 5) ScrollCue.svelte uses no deferred icons, so the new file does not need the
`$lib/components/deferredIcons` import. PrimitiveSections still needs it for the picker icons. 6)
PascalCase component name, no default-export concerns (a .svelte component). Count basis: the moved
region is about 175 nonblank lines (19 script + 103 markup + 53 style), about 12 of them comments,
so the counted removal is about 161 and adds 2, giving about 285 from 444. That is 215 lines of
headroom under 500 and well under the 425 soft target.

## `web/src/lib/components/settings/AiKeyManager.svelte` (442 / 500)

**Reviewer (endorse):** I read the file myself and re-measured it. ESLint max-lines with
skipBlankLines and skipComments reports 442, which matches the task.

**The seam is real.** The how-to block (lines 255-283) is static instructional copy:

* It takes no props and holds no state.
* It references no script symbol except the two imports that leave with it. `Disclosure` appears
  only at line 255, and `parentalGateLink` only at line 263.

It changes for reasons outside AiKeyManager's job: OpenAI's onboarding, verification and billing
rules. AiKeyManager's job is credential entry, verification, persistence and forgetting. I agree the
proposal's rejected alternatives are worse:

* Splitting out the saved-credential branch would mean threading `keyStatus`/`keyMessage` through
  callbacks.
* Moving `KEY_MESSAGES` would be a shuffle rather than a seam.

**The line arithmetic checks out.**

* Markup 255-283 is 29 lines, all nonblank.
* Styles 444-481 are 38 physical lines, minus 5 blanks, which leaves 33 counted. The 2-line comment
  at 442-443 is not counted.
* Imports: 2 leave and 1 arrives, and the `<OpenAiKeyHowTo />` tag adds 1.
* Result: 442 − 29 − 33 − 2 + 2 = 380. That is 120 under the 500 cap and 45 under the 425 soft
  target.
* The new file comes to about 70 counted lines.

**The wrapper-div pinning already has a precedent.**
`web/src/lib/components/beta/BetaTroubleshooting.svelte` wraps its root
`<Disclosure class="beta-disclosure">` in `<div class="trouble">` and pins its rules as
`.trouble :global(.beta-disclosure ...)`. The new component can copy that pattern exactly. Selectors
pinned that way count as pinned in `tools/tokens/lint-token-styles.mjs`, so:

* The new file needs no `UNPINNED_GLOBAL_SELECTOR_BASELINE` entry.
* AiKeyManager's allowance of 2 is unchanged, because the unpinned `:global(.byok-storage-icon)`
  rules stay behind.

`.byok-howto-note` is a scoped class on a `<p>` inside the child's own markup, so it moves
unchanged. It needs no `:global()` pinning, and its rule does not become `:global`.

**Nothing else breaks.**

* Nothing outside AiKeyManager references `byok-howto`, the summary text, or the api-keys URL (grep
  across `web/tests`, `web/src` and `tools`).
* The child is imported only from the lazily loaded settings section, so it stays in that lazy chunk
  and there is no bundle-boundary issue.
* The block renders no `<Icon>`, so the new file needs no `deferredIcons` import.
* Placement and naming follow the settings components' conventions.

**One implementation detail to add.** Keep the `margin: 0 0 14px` on the pinned `.byok-howto` rule
rather than moving it to the wrapper div. That keeps the layout identical: the wrapper is a plain
block, so the Disclosure's bottom margin still collapses the same way against the label below it.

The `use:parentalGateLink` action must stay on the anchor. The proposal already calls this out as a
kids-compliance requirement.

**Raising the cap would be worse.** The file is not cohesive enough to justify it when a clean,
dependency-free seam takes it well under the soft target.

**Recommendation:**

Split as proposed.

1. Create `web/src/lib/components/settings/OpenAiKeyHowTo.svelte` with a root
   `<div class="openai-key-howto">` wrapping the moved `<Disclosure class="byok-howto">` block
   (currently AiKeyManager lines 255-283). This follows the `BetaTroubleshooting.svelte` precedent
   (`.trouble :global(.beta-disclosure)`).
2. Import `Disclosure` and `parentalGateLink` in the new file, and keep `use:parentalGateLink` on
   the platform.openai.com anchor.
3. Move the style rules from lines 444-481, re-pinned as `.openai-key-howto :global(.byok-howto)`,
   `... summary`, `... ol`, `... a` and `... code`. Keep `margin: 0 0 14px` on the pinned
   `.byok-howto` rule. `.byok-howto-note` stays a plain scoped class.
4. In AiKeyManager, drop the `Disclosure` and `parentalGateLink` imports and the 2-line how-to
   comment, then add `import OpenAiKeyHowTo from './OpenAiKeyHowTo.svelte'` and `<OpenAiKeyHowTo />`
   in place of the block.

Projected size: AiKeyManager goes from 442 to 380 counted lines (120 under the 500 cap), and the new
file is about 70.

Verify with `npm run lint`, `npm run lint:tokens` (baseline unchanged) and `npm run check`, then run
`SPLOTCH_E2E_PORT=<port> npm run test:e2e -- flows-settings.spec.ts --workers=1`.

**Risks (proposer):** Line arithmetic (ESLint counting, so blank and comment lines skipped): the
moved markup is 29 lines. The moved styles are 33 lines: the 2-line comment at 442-443 is not
counted, and five blank lines are skipped. The two imports that leave (Disclosure, parentalGateLink)
are offset by the new import and the <OpenAiKeyHowTo /> tag. Net about -62, so 442 -> about 380,
which is about 120 under the 500 cap and under the 425 soft target. The new file is about 75 lines.

Other risks:

* Scoped-CSS pinning: the new component needs a scoped wrapper to pin the Disclosure :global()
  rules. The svelte.md rule forbids unpinned :global. Don't re-pin through .byok, because that
  ancestor lives in the parent.
* Token lint: tools/tokens/lint-token-styles.mjs keeps a per-file :global allowance
  ('lib/components/settings/AiKeyManager.svelte': 2). That allowance covers the unpinned
  :global(.byok-storage-icon) rules, which stay in AiKeyManager, so the count should not change. Run
  npm run lint:tokens anyway to confirm the pinned how-to selectors in the new file need no
  allowance entry.
* Deferred icons: the how-to renders no <Icon>, so the new file does not need import
  '$lib/components/deferredIcons' (deferredIcons.test.ts).
* Bundle boundaries: AiKeyManager is lazily loaded as a settings section via SectionBody.svelte. A
  child component imported only from it stays in that lazy chunk, so the startup bundle is
  unaffected.
* E2E coverage: web/tests/flows-settings.spec.ts drives the AI key flow by role and text, not by
  component name. Nothing references byok-howto by selector outside this file, so no spec or
  snapshot should break. Any screenshot baseline covering the locked panel should render identically
  if the wrapper adds no box styles. Verify with the settings E2E spec on an explicit port.
* Placement and naming: PascalCase component in lib/components/settings/ with a default Svelte
  component export only.
* The parentalGateLink action must move with the link. Without it the outbound link loses its
  parental gate, which is a kids-compliance regression. The implementer must keep
  use:parentalGateLink on the anchor.

## `web/src/lib/server/tokens.test.ts` (441 / 500)

**Reviewer (endorse):** I read the file and the proposal holds up.

**Line counts.** Using the same rule as ESLint max-lines (blank lines and whole-line `//` comments
skipped), the file counts 441 and lines 5-153 count 132. That matches the proposal's ~134. What
stays is 309 lines plus one named import of about 11 bindings: USAGE_SECRET, usageGrantKey,
envState, blobsState, storeFor and the six freshTokens* factories. Prettier will wrap that import to
roughly 12-13 lines, so the file lands at about 321. That is well under the 425 soft target and
about 179 under the 500 cap.

**Is the seam real?** Yes. The block is a fake Netlify Blobs store with etag compare-and-set
semantics, plus the three vi.mock registrations and fresh-module factories. It contains no
assertions, and it changes for different reasons than the tokens policy tests do. The repo already
uses this pattern in more than one place:

* `web/src/routes/api/generation-result/settlementTestHarness.ts` (vi.hoisted plus
  vi.mock('@netlify/blobs') in a non-test module, used by one test file)
* `web/src/lib/drawing/tiledRendererTestHarness.ts`

So this is not a shuffle to satisfy the counter.

**Import graph.** The mock-hoisting argument is correct. The file never imports ./tokens statically.
Every test reaches it through `vi.resetModules()` followed by a dynamic `import('./tokens')`, either
inside a factory or inline at lines 253 and 273. The harness module's vi.mock calls are therefore
registered before tokens.ts loads.

**Exports.** The inline tests at lines 252-290 set envState and blobsState and call storeFor
directly, and the cleanup tests (lines 487-511) use usageGrantKey and storeFor. The proposal's
export list covers all of them. devState can stay internal, since nothing after line 159 references
it.

**Other checks.**

* No bundle boundary is involved: this is lib/server test-only code.
* No snapshots depend on the file.
* Test placement is fine: the harness is not a .test.ts or .spec.ts file, so the placement guard
  ignores it.
* No ADR conflicts.

**Raise-cap instead?** It would be worse. The file is 16 over the soft target, and a clean,
precedented seam exists.

**Small additions.**

1. The two inline race tests (about lines 252-290) call vi.resetModules() and set envState and
   blobsState, but never reset devState. They only get production mode because an earlier test
   happened to leave `devState.value = false`. Moving devState into the harness makes this implicit
   dependency harder to see. The implementer should either export devState and set it to false in
   those two tests, or turn them into a factory. That also removes duplicated setup.
2. Keep the block comment explaining the two backing modes (currently lines 16-20) at the top of the
   harness, and add the one-line WHY noting that the mocks work only because every consumer imports
   ./tokens dynamically.
3. Run `npm run lint:dead` before pushing, as the proposal already says.

**Recommendation:**

Split. Create `web/src/lib/server/tokensTestHarness.ts`, a non-test camelCase module following the
`settlementTestHarness.ts` and `tiledRendererTestHarness.ts` precedent, and move lines 5-153 of
`tokens.test.ts` into it. That block is 132 counted lines:

* USAGE_SECRET and usageGrantKey
* the vi.hoisted fakeBlobStore, blobsState, storeFor, devState and envState
* the vi.mock calls for @netlify/blobs, $app/environment and $env/dynamic/private
* the six freshTokens* factories

Export as named exports everything the tests use: USAGE_SECRET, usageGrantKey, envState, blobsState,
storeFor and the six factories. `tokens.test.ts` keeps the `// @vitest-environment node` pragma, the
beforeEach and all 11 describe blocks. It lands at about 321 counted lines (309 plus a wrapped
import), with about 104 lines under the 425 soft target and about 179 under the 500 cap.

While moving the code, make the two inline race tests set devState explicitly instead of relying on
the value an earlier test left behind. Also add a comment on the harness's mock block saying the
mocks work only because consumers import ./tokens dynamically after vi.resetModules(). The cap stays
at the default 500.

**Risks (proposer):** - **Mock hoisting across modules.** vi.mock placed in an imported helper takes
effect only because this file never statically imports ./tokens. Every test goes through a
freshTokens* factory or its own `await import('./tokens')`, both after vi.resetModules(). A future
static `import ... from './tokens'` at the top of the test would load the real @netlify/blobs. A
comment on the harness's mock block should state this (a non-obvious WHY). settlementTestHarness.ts
already depends on the same mechanism in this repo.

* **Test environment.** The `// @vitest-environment node` pragma has to stay in tokens.test.ts,
  because Vitest reads it only from the test file.
* **Test-file placement.** The harness is not named *.test.ts, so Vitest does not collect it as a
  suite. That also means the Vitest lint rules scoped to *.test.ts (vacuous-test and it()/describe()
  vocabulary) do not apply to it. That is fine, since it holds no tests.
  tools/tests/test-file-placement.test.mjs only checks .spec.ts against .test.ts placement, so it is
  unaffected.
* **Dead-code, bundle and coverage config.** Run `npm run lint:dead` (knip) before pushing to
  confirm it resolves the harness's exports through the test-file entry, as it evidently does for
  settlementTestHarness.ts. Check that the Vitest coverage config does not count the harness as
  uncovered source. It lives under lib/server, which never ships to the client or the native bundle,
  so there is no startup-bundle boundary.
* **Behaviour preserved.** The usageGrantKey derivation ('splotch-managed-usage-v1') moves
  unchanged. The cleanup tests exercise tokens.ts end to end, so any mismatch still fails.
* **Headroom.** About 106 counted lines under the 425 soft target and about 181 under the 500 hard
  cap. The harness adds a new file of about 134 counted lines.
* **Constraints.** This split does not conflict with any ADR. The repo uses named exports only, and
  a new module under web/src needs no scripts-info entry.

## `web/tests/flows-magic-brush.spec.ts` (435 / 500)

**Reviewer (endorse):** I read the file and re-measured it with a nonblank, non-comment counter that
matches the ESLint max-lines rule. The whole file counts 435 lines (689 raw). Lines 149-381 count
157, so the remainder is 278, exactly as the plan says.

**The seam is real, not driven by the line counter.** The five tests at 149-381 are about the
`.brush-ring` lifecycle (issue #187), which `PointerHalos.svelte` renders:

* the ring appears, tracks the pointer and leaves, with pen and magic flavours
* its transform is written once per frame rather than once per input
* a palette press mid-stroke removes it through `releaseAllPointers` / `lostpointercapture`
* two tests cover the ring growing from `onStrokeStart` on an adopted orphan-pen stream

Only the first test touches the magic brush, and only to check the ring's `magic` class. The region
uses none of the file's reveal helpers or constants (`REVEAL_SETTLE_MS`, `distinctOpaqueColors`, the
band/ink helpers).

**Imports check out.** Past line 381, `Locator` is used only in the import on line 1, so dropping it
from the original file is correct. `Page` is still used elsewhere, so it stays. `swatch`,
`TEST_PALETTE`, `openDrawer` and `pickBrush` are all still used in the remaining tests, so the
original file's import lists only lose `Locator`. The new file needs `expect`, `test`, `Locator` and
`Page`, plus `gotoApp`, `swatch` and `TEST_PALETTE` from `./helpers`, plus `openDrawer` and
`pickBrush` from `./flows-harness`. That comes to about 161 counted lines.

**Nothing downstream breaks:**

* **Snapshots:** the file has no snapshot directory, so nothing to move.
* **Routing:** no `ENGINE_SMOKE` tag, so the new file routes the same way.
* **Name lists:** no tool or CI file lists spec files by name.
* **Placement:** `.spec.ts` in `web/tests`, named imports only.
* **Bundle boundaries:** none apply to test specs.
* **ADRs:** 0043, 0078 and 0080, and `engine-smoke.spec.ts`, mention `flows-magic-brush.spec.ts`
  only for the reveal and settle behaviour, which stays put. After the move, ADR-0080's amplifier
  command (`flows-magic-brush.spec.ts --repeat-each`) no longer runs the ring tests. That is
  correct, since the command targets the reveal race.

**Naming.** Prefer `brush-ring.spec.ts`. It sits beside the existing unprefixed
`clear-ring.spec.ts`, and the ring is canvas-overlay chrome rather than a flows-harness user flow,
even though it borrows `openDrawer` / `pickBrush`.

**The opposite verdict is worse.** At 435 the file is already over the 425 soft cap. Raising its cap
would leave two unrelated contracts in one file, when the split gives both files more than 140 lines
of headroom.

**Minor note.** `adoptDownLessPenStream` / `liftAdoptedPen` have no other callers, so moving them
duplicates no helper. Checking the coalescing test with `--workers=1` on an explicit
`SPLOTCH_E2E_PORT` and `--repeat-each` is the right way to verify, rather than running the full
suite.

**Recommendation:**

Split. Move lines 149-381 of `web/tests/flows-magic-brush.spec.ts` into a new
`web/tests/brush-ring.spec.ts`, keeping every WHY comment with its code:

* the five brush-ring lifecycle tests
* `RING_COALESCING_DRIVE_MS` and `RING_COALESCING_MOVE_GAP_MS`
* `adoptDownLessPenStream` and `liftAdoptedPen`

The new file imports:

* `{ expect, test, type Locator, type Page }` from `@playwright/test`
* `{ gotoApp, swatch, TEST_PALETTE }` from `./helpers`
* `{ openDrawer, pickBrush }` from `./flows-harness`

In the original file, drop only `type Locator` from the Playwright import. Projected sizes:
`flows-magic-brush.spec.ts` goes from 435 to 278 counted lines, and `brush-ring.spec.ts` is
about 161. The cap stays at the default 500.

Verify with `npm run lint` (covers max-lines and unused imports),
`tools/tests/test-file-placement.test.mjs`, and
`SPLOTCH_E2E_PORT=<port> npm run test:e2e -- brush-ring.spec.ts --workers=1 --repeat-each=5`.

**Risks (proposer):** This spec is not a smoke spec: it has no ENGINE_SMOKE_TAG, so the new file
also runs untagged under Chromium only, which is the same routing as today. No helper is duplicated
between specs, because adoptDownLessPenStream and liftAdoptedPen have no other caller, so the rule
against copying page-driving helpers between specs is not triggered. Placement follows the rules: a
.spec.ts in web/tests with named imports only. Counts use the nonblank, non-comment rule: 157
counted lines move, leaving about 278 in flows-magic-brush.spec.ts, and the new file is about 162.
Both sit well under 425. The coalescing test is sensitive to CPU load. Moving it to its own file
changes how Playwright spreads work across workers but not the test itself. Still, verify it with
--workers=1 on an explicit SPLOTCH_E2E_PORT, plus --repeat-each, and not by running the full suite.
After the move, run lint, which covers max-lines and the unused Locator import, and
tools/tests/test-file-placement.test.mjs. No ADR constrains this file.

## `web/src/lib/drawing/exportDrawing.test.ts` (433 / 500)

**Reviewer (endorse):** I read the file and checked every count the plan relies on; all of them are
right. The file has 433 counted lines (493 raw). The five tiled-worker tests at lines 140-288 are
133 counted lines. The shared setup at lines 1-42 is 35, and createOverlaySource is 6. That leaves
300 in the original, or 292 after the optional pngEncoder trim. The trim is 8 lines: the hoist at
lines 6-8, the vi.mock factory at 11-14, and the mockReset at 34. The new file lands at about 176.

The seam is real, not a cut made to satisfy the counter. In web/src/lib/drawing/exportDrawing.ts,
composeExportPng branches on `'source' in snapshot` (around line 215) into a worker path that
settles tiles, the texture and the overlay, then calls encodeTiledCanvasPng. The other branch is the
main-thread canvas path. The five moved tests are exactly the ones that use TiledExportSnapshot and
assert on pngMock. None of the tests that stay reach encodeTiledCanvasPng. Two compatibility tests
pass a tiled `preview.source`, but only the OffscreenCanvas preview builder reads it. The top-level
snapshot in those tests is always an HTMLCanvasElement, so dropping pngMock from the original file
is safe.

The theme is resolved before the branch and paperColor is passed to the worker, so the tiled file
does need the appearance mock, as the plan says. It also needs the whole ControllableImage stub and
`requested`, because the two canonical-overlay tests drive onload/onerror on it. The file has to
keep vi.resetModules plus the dynamic import, because the paper-texture cache is module-scope.

Nothing else breaks:

* **Test placement:** the new file is colocated as .test.ts, and dot-joined names already exist next
  to it (screenshot.gallery.test.ts, aiImage.saveFailure.test.ts).
* **Bundles and ADRs:** only test files change, so no bundle boundary or ADR is affected. There are
  no snapshot files.

One small addition. The existing `describe('composeExportPng overlay')` name was already wrong,
because it holds preview and no-context tests too. When the tiled tests move out, rename the
remaining describe to something like 'composeExportPng compatibility export' so the two files mirror
the branch split.

Raising the cap would be the wrong call. The file has an obvious behaviour boundary that matches a
production branch, and splitting costs only about 41 lines of per-file setup, which
vi.hoisted/vi.mock force anyway.

**Recommendation:**

Split the file into the tiled worker path and the main-thread compatibility path, matching the two
branches of composeExportPng.

1. Move the five tiled-worker tests (web/src/lib/drawing/exportDrawing.test.ts lines 140-288, 133
   counted lines) into a new colocated web/src/lib/drawing/exportDrawing.tiled.test.ts under
   describe('composeExportPng tiled worker export'). Copy the per-file setup into it (the vitest
   import, the appearanceMock and pngMock hoists, both vi.mock calls, `requested` with
   ControllableImage, beforeEach with vi.resetModules, and afterEach), plus createOverlaySource. The
   new file comes to about 176 counted lines.
2. In the original file, remove the now-unused pngMock hoist, the vi.mock('./pngEncoder') factory
   and the mockReset line (8 counted lines). Keep ControllableImage, `requested` and
   createOverlaySource, because 'rejects instead of exporting without an unavailable canonical
   overlay' uses them. Rename the remaining describe to 'composeExportPng compatibility export'.

Projected: the original goes from 433 to about 292 counted lines and the new file is about 176, both
under 425. Verify with `npm run lint` and a vitest run of both files.

**Risks (proposer):** - **Test placement:** The new file is a colocated `.test.ts` under web/src, so
tools/tests/test-file-placement.test.mjs accepts it.

* **Copied setup:** About 40 counted lines of setup are copied into the new file. This is
  deliberate: vi.hoisted/vi.mock and the `Image` stub must live in each file. Moving them into a
  shared helper module would be the kind of test-only helper the repo avoids adding for a single
  second caller.
* **Mocks both files must keep:** Both files must keep `vi.resetModules()` plus the dynamic
  `await import('./exportDrawing')`. exportDrawing.ts caches the paper texture in module-scope
  `let`s (paperTextureImage/paperTexturePromise), so a static import would leak that cache between
  tests. The tiled file must keep the appearance mock, because the tiled branch calls
  `resolvedTheme()` for `paperColor`.
* **Trimming the pngEncoder mock:** Before removing it from the original file, check that no
  remaining compatibility test reaches `encodeTiledCanvasPng`. As read, none does: they all pass an
  HTMLCanvasElement snapshot, and the preview `source` is read only by the OffscreenCanvas preview
  builder.
* **Bundle boundary:** None is affected. exportDrawing.ts is lazily loaded and has no static
  importers (per its header and web/tests/startup-bundle.spec.ts), and only test files change here.
* **Lint rules:** `should` is banned in test titles, and each moved test must keep its assertions.
  All five do.
* **Behaviour:** Nothing in production changes. Run `npm run lint` and the vitest file pair to
  confirm the counts: the original drops to about 292 or 300 depending on the trim, and the new file
  is about 176, both well under 425.

## `web/src/lib/pwa/updates.test.ts` (429 / 500)

**Reviewer (endorse):** I read the file and counted lines the way ESLint max-lines does (blank lines
and // lines skipped). The file is 429 counted lines, and the plan's figures are exact. The header
(lines 1-49) is 35 lines, the checkVersionMismatch describe is 85, the deferred-registration
describe (171-354) is 136, and the initPWAUpdates describe is 173. Moving the registration block
leaves 429 - 136 = 293 in updates.test.ts. That is well under the 425 soft cap and has more than 75
lines of headroom. The new file lands at about 136 plus a header of about 30-35, so roughly 170.

The seam is real, not driven by the line counter:

* The block tests one function path in updates.ts: registerDeferredServiceWorker and
  scheduleRegistration, which cover Save-Data, the dev no-op, the idle deferral, retry, and the
  repeat-visit re-registration at init.
* It is the only describe that calls idle.flush or checks idle.queue.
* It sets up its own location, DEV flag, and fetch in its own beforeEach/afterEach.
* It matches the existing split by lifecycle phase (updates.activation.test.ts plus the
  updatesTestHarness.ts fixture module).

Placement is a colocated .test.ts under web/src/lib/pwa with a dot-joined name, which fits the
naming pattern. Test files carry no bundle-boundary concern, and no ADR applies.

Three corrections to the risks section:

1. The idle mock is not optional in updates.test.ts; it must stay. Several initPWAUpdates tests stub
   a real registration, for example 'applies a pending update when the document goes hidden', which
   uses makeRegistration with a waiting worker. The init path's repeat-visit branch then calls
   scheduleRegistration, which calls scheduleIdle. Without the mock, the real $lib/idle fallback
   would call register() after the test finishes. updates.test.ts could shrink it to a plain no-op
   scheduleIdle, since init tests never flush, but keeping the existing mock costs nothing.
2. The pruning risk mostly does not apply. makeWorker, makeRegistration, CURRENT_VERSION,
   stubDeployedVersion, and stubServiceWorker are all still used by the initPWAUpdates block.
   NEWER_VERSION and the visibility helpers are used only there. The existing import list probably
   survives unchanged, and `npm run lint` will confirm.
3. The new file needs only the harness imports the block uses: CURRENT_VERSION, makeRegistration,
   makeWorker, stubDeployedVersion, stubServiceWorker. It also needs the canvasState mock, because
   updates.ts imports canvas state and the checkForUpdates call inside the block reaches it.

I also considered moving checkVersionMismatch instead (85 lines, leaving 344). It is also cohesive,
but that route leaves both mocks duplicated anyway, and the registration block is the one tied to
the idle-queue fixture. The plan's seam is the better one. Raising the cap would be worse, because a
clean, precedented seam exists.

**Recommendation:**

Split. Move `describe('deferred service worker registration')` (lines 171-353, 136 counted lines, 12
tests, with its local flushAsync, stubConnection, flushIdle, and beforeEach/afterEach) into a new
web/src/lib/pwa/updates.registration.test.ts. That file's header needs:

* vitest imports and createPWAUpdates
* the harness imports CURRENT_VERSION, makeRegistration, makeWorker, stubDeployedVersion,
  stubServiceWorker
* the hoisted canvasState mock of $lib/state/canvas.svelte
* the hoisted controllable idle queue with its vi.mock('$lib/idle')
* the top-level beforeEach that creates pwaUpdates and resets canvasEmpty

The new file comes to about 170 counted lines.

Keep the idle mock in updates.test.ts. The initPWAUpdates tests that stub a real registration reach
scheduleIdle through repeat-visit registration.

Update the header comments in all three files so updates.test.ts describes the version-mismatch
cache-bust plus the init wiring, updates.activation.test.ts points registration at
updates.registration.test.ts, and the new file says it covers deferred registration.

Afterwards, run `npm run lint` to catch any unused harness import (none is expected) and run the pwa
vitest files. Projected size of updates.test.ts is 293 counted lines against the cap of 500.

**Risks (proposer):** 1) Mock duplication. vi.mock factories and vi.hoisted are per-file, so the
canvasState mock and (probably) the idle-queue mock have to exist in both files. That is about 15
counted lines of duplication. Leave it inline, because vi.hoisted cannot pull state out of the
harness cleanly. Before deleting the idle mock from updates.test.ts, check whether any
initPWAUpdates test reaches scheduleIdle. They stub a missing registration today, so it looks unused
there. Without the mock, the real scheduleIdle would run register() asynchronously after the test
ends. Keeping the mock is the safe default and still leaves about 293 lines. 2) The cross-reference
header comments must be updated in both updates.test.ts and updates.activation.test.ts (the
activation header says registration lives in updates.test.ts), and the new file needs a matching
header. That is prose, so it has no drift-guard concern. 3) Test placement: a .test.ts colocated
under web/src/lib/pwa follows tools/tests/test-file-placement.test.mjs, and the dot-joined name
matches the updates.activation.test.ts convention. 4) After the move, prune the now-unused harness
imports from updates.test.ts (for example makeWorker, if only the registration block used it), or
lint will fail on unused imports. 5) There are no bundle-boundary or ADR constraints, because these
are test-only files.

## `web/src/lib/components/AiImageResult.svelte` (427 / 500)

**Reviewer (revise):** The seam is real and the split verdict holds. I read the file myself. The
revealed-result footer (lines 164-181, plus style 367-460) is a self-contained region: it renders
only when `revealed && result`, owns its own entrance motion (the downloadPop keyframe, the
reduced-motion downloadFadeIn swap, and the hover and active states), and it is the obvious fourth
child next to AiResultStage, AiResultError, and AiResultDisclosure. Raising the cap would be the
wrong call. The file is 2 lines over the soft target, and this is a genuine responsibility, not a
move that only satisfies the counter.

**Line counts.** I measured these with ESLint's own max-lines rule on stdin, with no files written:

* The file counts 427 today.
* Deleting lines 164-181 and 367-460 brings it to 323. That removes 104 counted lines, not the ~93
  the proposal estimated. The rule counts comments inside the Svelte `<style>` block (the CSS
  comments are counted, not skipped), so the region's comment lines count too.
* The script loses 3 lines: the Icon import, the autoSaveFooter import, and the `footer` derived.
* The AiImageReport import stays, reduced to its `type ImageReportStatus`. The parent still needs
  that type for `reportStatus` and for AiResultError's binding.
* The parent gains 1 import line and about 8-9 lines for the `<AiResultFooter ... />` call.

That projects to about 330, not 342. Either figure is well under 425.

**Bundle boundary.** No risk. The only entry point is `overlayChunk.ts` (the deferred overlay
chunk), and the new child is statically imported inside that same chunk.

**Tests.** The E2E locators keep working because the class names do not change: `.ai-result-footer`
in ai-result.spec.ts:226, and `.ai-result-saved` / `.ai-result-download` in
reduce-motion.spec.ts:546/569. The reduce-motion test matches the animation name against
`^svelte-\w+-downloadPop$`. That still passes, because Svelte scopes the keyframes under the new
component's hash. The page-inventory captures should render pixel-identical, since the moved
selectors keep the same specificity.

**The polaroid hide rule.** This point is correct. It must become
`.ai-result-modal.polaroid-mode :global(.ai-result-footer)`. Without `:global`, Svelte prunes the
rule as unused CSS and the footer stays visible during the send-off. The class is still pinned by
`.ai-result-modal`, so this does not add an unpinned-global entry.

**What the proposal missed: the two-way token ratchet.** `tools/tokens/lint-token-styles.mjs` line
132 pins `'lib/components/AiImageResult.svelte': 3` in UNPINNED_GLOBAL_SELECTOR_BASELINE. The
ratchet fails on a count above the baseline and also on a count below it. The three unpinned globals
today are `:global(.ai-result-close)`, `:global(.ai-result-download-icon)`, and
`:global(.ai-result-download-icon svg)`. After the move the parent has 1, so `npm run lint:tokens`
fails until the baseline entry is lowered to 1. The new file would otherwise need its own entry
of 2.

The better fix is to pin the two icon rules in the child as
`.ai-result-download :global(.ai-result-download-icon)` and
`.ai-result-download :global(.ai-result-download-icon svg)`. That is correct, since the Icon lives
only inside that button. The new component then has zero unpinned globals and needs no baseline
entry, and the parent's entry drops to 1. Update the entry's comment to "The result positions the
close class forwarded into DialogHeader."

**Other details:**

* The `--loading-caption-height` coupling through the cascade is acceptable. It follows the
  precedent of AiResultStage reading `--result-stage-max-h/-w` from this parent.
* Keep `stampMotionAtStart` imported in both files. The parent uses it on `dialogEl` in
  handleDownload, and the child uses it as the `use:` action on the caption and the button.
* `ondownload` stays as the parent's handleDownload, because it needs `dialogEl` and `exiting`.
* `status` must be `$bindable` at every hop. `reportSettled` and the disclosure strip's mount
  timing, which keeps focus return working, depend on it.
* No ADR is affected. ADR-0116 (minimize) and ADR-0170 (the polaroid send-off outranks the shared
  exit) both stay in the parent.
* There is no drift test that requires docs/ARCHITECTURE.md to list components, and the sibling
  AiResult* components are not listed there either. Adding a row is optional.

**Recommendation:**

Split. Create web/src/lib/components/AiResultFooter.svelte as the fourth child region, next to
AiResultStage, AiResultError, and AiResultDisclosure.

**What moves into it:**

* **Markup:** the `.ai-result-footer` block (AiImageResult.svelte lines 164-181). That is the saved
  caption or the Download button, with `use:stampMotionAtStart`, and the AiImageReport underneath.
* **Script:** `footer = $derived(autoSaveFooter(result.autoSave))`, plus the imports of Icon,
  AiImageReport, autoSaveFooter, and stampMotionAtStart.
* **Props:** `result`, `drawingUrl`, `style`, `reportOrigin`, `status` ($bindable, passed through to
  AiImageReport), and `ondownload`.
* **Style (lines 367-460):** `.ai-result-saved`, `.ai-result-footer`, the `.ai-result-download`
  rules including hover and active, `@keyframes downloadPop` and `downloadFadeIn`, and the
  `[data-start-reduced-motion]` swap. Pin the icon rules as
  `.ai-result-download :global(.ai-result-download-icon)` and
  `.ai-result-download :global(.ai-result-download-icon svg)`, so the new file has zero unpinned
  globals.

**What changes in the parent:**

* It keeps handleDownload, passed as `ondownload`. That handler needs `dialogEl` and `exiting` for
  the polaroid send-off.
* It keeps the `type ImageReportStatus` import and `stampMotionAtStart`.
* Change the polaroid hide rule to `.ai-result-modal.polaroid-mode :global(.ai-result-footer)`.
* `--loading-caption-height` stays on `.ai-result-modal` and reaches the child's min-height through
  the cascade.

**Same commit:** in tools/tokens/lint-token-styles.mjs, lower
`'lib/components/AiImageResult.svelte'` in UNPINNED_GLOBAL_SELECTOR_BASELINE from 3 to 1, and reword
its comment to say it covers only the DialogHeader close class. The ratchet fails in both
directions, so this edit is required.

**Checks:** run `npm run lint`, `lint:tokens`, and `check`, plus these E2E specs: ai-result.spec.ts,
reduce-motion.spec.ts (footer and polaroid cases), and the page-inventory AiImageResult surfaces.

**Size:** measured with ESLint max-lines, the file goes from 427 to about 330 counted lines, roughly
170 under the 500 cap and 95 under the 425 soft target. The new file is about 110 lines.

**Risks (proposer):** No bundle-boundary risk. AiImageResult is exported only through
overlayChunk.ts (the deferred overlay chunk), and the new child is statically imported by it, so
both land in the same chunk. There is no startup-path edge, and startup-bundle.spec should be
unaffected. The one thing that couples the two files: the parent's --loading-caption-height custom
property sizes the child's .ai-result-footer min-height, and both must stay equal so the footer slot
matches the loading caption it replaces. It inherits through the cascade, so no code is shared, and
it matches how AiResultStage already consumes --result-stage-max-h/-w from this parent. The polaroid
hide rule now needs :global on .ai-result-footer. If that is missed, Svelte prunes the rule as
unused CSS and the footer stays visible during the send-off, which the ai-result/reduce-motion E2E
polaroid checks should catch. The reduced-motion footer tests in tests/reduce-motion.spec.ts (lines
~546-569) locate the footer by class and should run after the split. The bind:status chain now goes
parent -> AiResultFooter -> AiImageReport. It must stay $bindable at each hop so that reportSettled
and the disclosure strip's mount timing, which keeps focus return working, behave exactly as today.
Line counts are measured, not estimated: 427 counted lines now; the regions to move count 20
(markup) + 73 (style) + about 3 (script); the parent gains about 9 lines for the component call.
That gives about 342, well under 425. No ADR constraint applies; ADR-0116 concerns the minimize
behaviour, and that stays in the parent.
