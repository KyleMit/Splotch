# Slice: chrome (palette, picker, Tool Drawer / Actions Panel, flyouts, toolbar styles, Clear, Save Picture)

Repo pinned at 64a9ca53a. Shipping paths are under `web/src/lib/` (written `lib/…`); RN paths under
`experiments/native-architecture/src/` (written `rn/…`). RN tests are named by basename (they live
in `tools/tests/` or `tools/migration/tests/`).

**Scope note: the live RN screen is `rn/ProbeApp.tsx` → `rsdDrawing/RsdDrawingScreen.tsx`.**
`rn/DrawingScreen.tsx`, `DrawingControls.tsx`, `useDrawingMenu.ts`, `drawing/PaintColors.tsx` and
`useColorPickerFocus.ts` are an older screen that nothing mounts. Tests that mount it are **not**
evidence for the live app: `native-custom-color-ui`, `native-paint-focus`,
`native-paint-selection-focus`, and `native-reduce-motion-mounted` (via
`native-drawing-screen-harness.mjs`).

**What "guard" means.** A guard is a test that reads or imports the shipping file AND compares it
with the RN side. "(partial)" means the guard pins only constants or labels, not behaviour.

## 1. Module ledger

Class counts (49 grouped rows):

| Class            | Rows                   |
| ---------------- | ---------------------- |
| imported         | 7                      |
| ported+guard     | 25 (9 of them partial) |
| ported-no-guard  | 9                      |
| not-needed-on-RN | 3                      |
| missing          | 5                      |

| shipping module                                                      | class                            | RN counterpart(s)                                                                                                | guard test(s)                                                                                                   | what could diverge                                                                                                                                                                  | risk    | shipping specs                                   |
| -------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------ |
| `palette.ts`                                                         | ported+guard                     | `rn/drawing/palette.ts`                                                                                          | native-drawing-tokens (colours + TRIM_ORDER); native-custom-colors (DEFAULT_STROKE_COLOR)                       | RN keeps up to 6 remembered custom paints as extra bar swatches, and `visiblePaints` always keeps the selected paint. Neither exists in shipping, and no test compares them (§3 D1) | H       | palette-trim, flows-palette-rendering            |
| `colorRing.ts`                                                       | ported+guard                     | `rn/rsdDrawing/paletteGeometry.ts`, `RsdSwatch.tsx`                                                              | rsd-native-drawing-frame (getRingColor in both themes; ring and gap widths)                                     | the selection-bloom animation is absent (D10)                                                                                                                                       | L       | flows-palette-rendering                          |
| `hexPickerLayout.ts`                                                 | imported                         | `rn/rsdDrawing/hexPicker.ts`, `RsdParentGateSheet.tsx`                                                           | rsd-native-color-picker, rsd-native-parent-center                                                               | —                                                                                                                                                                                   | L       | picker-trim                                      |
| `landscapeToolbar.ts`                                                | ported+guard                     | `rn/rsdDrawing/colorMenuLayout.ts`, `bareGlassSpace.ts`                                                          | rsd-native-color-control (colours, first rank, ladder rung by rung); rsd-native-bare-toolbar                    | —                                                                                                                                                                                   | L       | phone-landscape-toolbar                          |
| `breakpoints.ts`                                                     | imported                         | 8 files (`edgeLayout.ts`, `hexPicker.ts`, `modalGeometry.ts`, …)                                                 | rsd-native-actions-panel, rsd-native-color-control, others                                                      | —                                                                                                                                                                                   | L       | phone-landscape-toolbar                          |
| `design/trimGeometry.ts`                                             | imported                         | `hexPicker.ts`, `RsdColorPicker.tsx`; ladders re-derived in `paletteGeometry.ts`                                 | rsd-native-drawing-frame (row ladder 120–1100px, column ladder 600–1240px), rsd-native-color-control            | the ladder test counts palette colours only. Custom paints and RN's bottom-inset trim are not compared (D1, D11)                                                                    | M       | palette-trim                                     |
| `design/colorContrast.ts`                                            | ported+guard                     | `rn/rsdDrawing/inkKeyline.ts`                                                                                    | rsd-native-actions-panel (imports colorLuminance; pins DARK_INK threshold)                                      | —                                                                                                                                                                                   | L       | text-contrast                                    |
| `design/tokens.ts`                                                   | imported                         | `rn/rsdDrawing/tokens.css.ts`; 3 direct imports                                                                  | ~27 tests (native-drawing-tokens, rsd-native-bare-toolbar, native-polaroid-flight, …)                           | —                                                                                                                                                                                   | L       | (all)                                            |
| `actionButtonLayout.ts`                                              | ported+guard                     | `rn/rsdDrawing/edgeLayout.ts`, `RsdIconButton.tsx`                                                               | rsd-native-actions-panel (every layout constant, base sizes), rsd-native-button-size                            | RN shows the AI button offline (shipping hides it and recounts). The Button Size ceiling is fixed at 130 (D21)                                                                      | M       | actions-panel-layout                             |
| `actionUnavailableFeedback.ts`                                       | missing                          | none; RN sets `disabled` on Undo and the camera instead                                                          | none                                                                                                            | no shake + brand flash on Undo at end of history or on a refused camera tap (D7)                                                                                                    | M       | flows-undo-persistence, flows-screenshot         |
| `actions/actionPanelEvents.ts`                                       | ported-no-guard                  | `useFlyoutSlot.capturePress` (`rn/rsdDrawing/RsdActionsPanel.tsx:47-90`), `platform/flyoutFocus*.ts`             | native-flyout-focus (RN-only)                                                                                   | Outside-press close and Escape on web are ported. Native has no Escape (iPad keyboard)                                                                                              | L       | flows-actions-panel                              |
| `actions/clickConsumeWindow.ts`                                      | imported                         | `rn/rsdDrawing/RsdColorButton.tsx`                                                                               | —                                                                                                               | —                                                                                                                                                                                   | L       | flows-palette-brush                              |
| `actions/colorFoldGesture.ts`                                        | ported+guard                     | `RsdColorButton.tsx` (FOLD_TAP_TRAVEL_PX)                                                                        | rsd-native-color-control                                                                                        | A horizontal drag of 18px or more still fires as a tap on RN (low)                                                                                                                  | L       | phone-landscape-toolbar                          |
| `actions/dragToClear.ts` + `dragToClearGeometry.ts`                  | ported+guard                     | `rn/clear/dragToClear.ts`, `useClearGesture.ts`, `clearDock.ts` (geometry imported)                              | native-clear-projection (gesture, motion, coachmark, haptic, gain literals); rsd-native-clear                   | Shipping ends every live stroke when Clear is pressed; RN refuses Clear while any contact is down (D3). RN's clear is async and dims the chrome (D4)                                | H       | clear-ring, clear-tutorial, drawing-motion-clear |
| `actions/drawerCascade.ts`                                           | missing                          | none (tiles mount and unmount instantly)                                                                         | none                                                                                                            | no button cascade on open, no collapse fade, no chevron turn animation (D10)                                                                                                        | L       | flows-actions-panel                              |
| `actions/elementRegistry.ts`                                         | not-needed-on-RN                 | —                                                                                                                | —                                                                                                               | Svelte `bind:this` workaround for the Settings nav lists                                                                                                                            | —       | —                                                |
| `actions/hexSnapGesture.ts`                                          | ported+guard                     | `rn/rsdDrawing/hexPicker.ts`, `RsdColorPicker.tsx`                                                               | rsd-native-color-picker (reads hexSnapGesture.ts and ColorPicker.svelte literals)                               | a second finger cancels the pick on RN; shipping re-highlights and the first lift picks (low)                                                                                       | L       | flows-palette-brush                              |
| `actions/pressFeedback.ts`                                           | ported-no-guard                  | `RsdActivePageChip.tsx`, dialog headers                                                                          | none                                                                                                            | single-flight latch, outside the toolbar proper                                                                                                                                     | L       | —                                                |
| `actions/pressRelease.ts`                                            | missing                          | none (RN has only the `:active` 0.9 scale)                                                                       | none (drawing-frame pins the press scale, which lives in ColorSwatch CSS)                                       | no springy release on swatches or on the Stroke trigger (D10)                                                                                                                       | L       | flows-palette-brush                              |
| `actions/launchGuard.ts`                                             | ported+guard (partial)           | `rn/rsdDrawing/tapZone.ts`, used only for the coloring picker's book→pages swap                                  | rsd-native-coloring-picker                                                                                      | no 72px / 600ms launch dead zone on any RN dialog: picker, Coloring books, Settings (D5)                                                                                            | H       | (modalDialog specs)                              |
| `bareToolbar.ts` + `glassPanes.ts`                                   | ported+guard                     | `rn/rsdDrawing/bareGlassSpace.ts`, `bareGlassLayout.ts`                                                          | rsd-native-bare-toolbar                                                                                         | feeds only the web build; native draws no panes (D14)                                                                                                                               | M       | bare-toolbar                                     |
| `glassPaneGeometry.ts`                                               | imported (web only)              | `RsdBareGlass.web.tsx`; native `RsdBareGlass.tsx:66-68` returns null                                             | rsd-native-bare-toolbar, bareGlassFullscreen.web, bareGlassHold.web                                             | native Flat has no frosted panes and an opaque rail (D14)                                                                                                                           | M       | bare-toolbar                                     |
| `state/colors.svelte.ts`                                             | ported+guard (partial)           | `rn/settings/soundSettings.ts` `setColor`, `rn/drawing/palette.ts`                                               | rsd-native-actions-panel (WHITE_INK, DARK_INK threshold); native-appearance-paint                               | One custom swatch vs six remembered paints. Tapping Custom selects it in shipping. RN stores strokes as `'Black'` and re-themes drawn ink (D1, D2, D16)                             | H       | flows-palette-*, phone-landscape-toolbar         |
| `state/tool.svelte.ts` (UI)                                          | ported+guard (partial)           | `rn/settings/brushPreferences.ts`, `useBrushPreferences.ts`                                                      | rsd-native-actions-panel (BRUSH_OPTIONS labels/icons); behaviour tested RN-side only (native-brush-preferences) | Brush is stored under a separate key. A failed read gives Pen only, with every optional brush off (D20)                                                                             | M       | flows-optional-brushes                           |
| `state/ui.svelte.ts`                                                 | ported-no-guard                  | `resizing` prop (`RsdEdgeControls.tsx:79-102`), `openColorPicker`                                                | none                                                                                                            | The Button Size drag force-open is ported                                                                                                                                           | L       | —                                                |
| `state/layout.svelte.ts`                                             | not-needed-on-RN                 | `useWindowDimensions` + safe-area context                                                                        | —                                                                                                               | the 200ms rotation settle hold is not reproduced                                                                                                                                    | L       | —                                                |
| `state/overlayDemand.ts`, `state/readonlyView.ts`                    | not-needed-on-RN                 | —                                                                                                                | —                                                                                                               | Svelte lazy-overlay demand and read-only store views                                                                                                                                | —       | —                                                |
| `drawing/screenshot.ts`                                              | ported-no-guard                  | `rn/useDrawingScreen.ts:330-356` (createSave), `useSavePicture.ts`, `keepPicture.ts`, `platform/photoLibrary.ts` | none reads it; RN-side rsd-native-save-flight, native-save-failure                                              | The save locks the paper and dims the chrome. No cooldown or burst coalescing. Android 7–10 cannot save. Unsaved pictures are lost on relaunch (D4, D8, D9)                         | H       | flows-screenshot, save-failure-announcement      |
| `drawing/screenshotFeedback.ts`                                      | missing                          | none                                                                                                             | none                                                                                                            | no camera shutter squash on capture; no shake on a refused tap (D7)                                                                                                                 | M       | flows-screenshot, reduce-motion                  |
| `drawing/screenshotTiming.ts`                                        | imported                         | `RsdPolaroidFlight.tsx` (POLAROID_FLIGHT_MS)                                                                     | native-polaroid-flight                                                                                          | SCREENSHOT_COOLDOWN_MS is unused on RN (D8)                                                                                                                                         | M       | flows-screenshot                                 |
| `drawing/polaroidAnimation.ts` + `polaroidGeometry.ts`               | ported+guard                     | `rn/rsdDrawing/polaroidFlight.ts`, `RsdPolaroidFlight.tsx`                                                       | native-polaroid-flight (keyframes, curves, duration, reduced-motion fade, size); rsd-native-save-flight         | The flight starts only after the full PNG capture. A second save cuts the first polaroid. The overlay is inside the safe-area frame (low)                                           | M       | flows-screenshot                                 |
| `drawing/saveOnDelete.ts`                                            | ported-no-guard                  | `rn/useDrawingScreen.ts:420-458` (clearCurrentPicture), `keepPicture.ts`                                         | none reads it; RN-side native-save-to-photos-mounted                                                            | RN waits for the save before clearing, and on failure keeps the drawing. Shipping clears at once and offers retry (D6)                                                              | H       | save-failure-announcement, engine-export         |
| `audio/clearSound.ts` (clear)                                        | ported+guard (partial)           | `rn/platform/clearSound*.ts`, `audio/pageTurnSound.ts`                                                           | native-clear-projection (page-turn curve and gain); native-sound-sources (gates); native-clear-sound            | the drag-note ladder and the 3-note "unwind" on release are missing. Native page-turn volume is capped at unity (D2, D19)                                                           | H       | clear-ring                                       |
| `components/ActionsPanel.svelte`                                     | ported+guard (partial)           | `rn/rsdDrawing/RsdActionsPanel.tsx`                                                                              | rsd-native-actions-panel (chevron turns, margins, flyout offsets, dim filter)                                   | No motion. Menus refuse to open mid-stroke. A menu returns after a keyboard Settings session (D3, D10)                                                                              | M       | actions-panel-layout, flows-actions-panel        |
| `BareToolbarPaper.svelte`, `GlassPanes.svelte`                       | ported+guard                     | `RsdBareGlass.tsx` / `.web.tsx`, `bareGlassStyle.ts`, `marginRuleInk.ts`                                         | rsd-native-bare-toolbar, rsd-native-paper-grain, rsd-native-flat-palette (tokens)                               | The native rail is opaque with no panes. Switching style lifts the paper (D13, D14)                                                                                                 | H       | bare-toolbar, bare-toolbar-paper                 |
| `BrushButtonFaces`, `BrushControl`, `BrushMenu`                      | ported+guard (partial)           | `brushTool` (`RsdActionsPanel.tsx:128-170`), `RsdToolFlyouts.tsx`, `brushMenuOptions.ts`                         | rsd-native-actions-panel (labels and icons)                                                                     | the face-roll animation on a pick is missing (D10)                                                                                                                                  | L       | flows-optional-brushes                           |
| `ClearButton`, `ClearRing`, `ClearCoachmark`, `clearRingContours.ts` | ported+guard (contours imported) | `RsdClearControl.tsx`, `RsdClearFace.tsx`, `RsdClearRing.tsx`, `RsdClearCoachmark.tsx`, `RsdClearUnderlay.tsx`   | native-clear-projection (dock, finishes, ring inks, label, coachmark); rsd-native-clear                         | Many motion easings are linear or instant. The grain drops during the flight. Clipped at the safe-area frame (D22)                                                                  | M       | clear-ring, clear-tutorial, drawing-motion-clear |
| `ColorControl`, `ColorMenu`                                          | ported+guard                     | `RsdColorButton.tsx`, `RsdColorMenu.tsx`, `colorMenuLayout.ts`                                                   | rsd-native-color-control                                                                                        | closest to shipping of all RN palette surfaces (it rings the custom option and selects ink)                                                                                         | L       | phone-landscape-toolbar                          |
| `ColorPalette`, `ColorSwatch`                                        | ported+guard (partial: geometry) | `RsdPalette` (`rn/rsdDrawing/RsdEdgeControls.tsx:216-280`), `RsdSwatch.tsx`, `paletteGeometry.ts`                | rsd-native-drawing-frame                                                                                        | Which swatches show, what Custom does, the ring while erasing, motion (D1, D2, D11, D12)                                                                                            | H       | palette-trim, flows-palette-*                    |
| `ColorPicker`                                                        | ported+guard                     | `RsdColorPicker.tsx`, `hexPicker.ts`                                                                             | rsd-native-color-picker                                                                                         | Dismisses on release rather than on press. Flies from the press point, not the button centre (low)                                                                                  | L       | picker-trim, flows-palette-brush                 |
| `CrayonStrip`                                                        | ported+guard                     | not-found page                                                                                                   | rsd-native-not-found                                                                                            | outside the drawing chrome                                                                                                                                                          | L       | —                                                |
| `FullscreenToggle`                                                   | ported-no-guard                  | `RsdFullscreenToggle.tsx`, `platform/useFullscreen*.ts`                                                          | fullscreen.web, bareGlassFullscreen.web (RN-only)                                                               | Inert while the chrome is disabled. Android browser only, in both apps                                                                                                              | L       | bare-toolbar                                     |
| `ScreenshotButton`                                                   | ported+guard (partial: label)    | camera tool (`RsdActionsPanel.tsx:213-228`)                                                                      | rsd-native-actions-panel (aria-label only)                                                                      | see D7, D8, D9                                                                                                                                                                      | H       | flows-screenshot                                 |
| `SettingsButton`                                                     | ported-no-guard                  | `RsdIconButton skin="corner"` (`RsdEdgeControls.tsx:155-164`)                                                    | rsd-native-drawing-frame checks the corner skin (RN-only)                                                       | RN ignores the press while disabled or mid-stroke                                                                                                                                   | L       | —                                                |
| `StrokeControl`, `StrokeWidthMenu`                                   | ported+guard                     | `strokeTool` (`RsdActionsPanel.tsx:171-189`), `RsdToolFlyouts.tsx`                                               | rsd-native-actions-panel (labels, eraser preview size); native-stroke-widths (five levels)                      | Each pick publishes `status:'saving'`, which briefly disables the Stroke tile and the palette (D4)                                                                                  | M       | flows-undo-persistence, flows-magic-brush        |
| `UndoButton`                                                         | ported-no-guard                  | undo tool (`RsdActionsPanel.tsx:255-267`)                                                                        | rsd-native-toolbar (RN-only)                                                                                    | Truly `disabled` at end of history, so no cue. No undo spin and no ghost of the undone ink (D7)                                                                                     | M       | flows-undo-persistence                           |
| `flyoutExit.ts`                                                      | missing                          | none                                                                                                             | none                                                                                                            | menus vanish instantly and have no entrance pop (D10)                                                                                                                               | L       | —                                                |
| `Icon.svelte`                                                        | ported+guard                     | `RsdIcon.tsx`, `icons.generated.ts`                                                                              | native-icons (SVGs, COLOR_ICONS, themed inks)                                                                   | —                                                                                                                                                                                   | L       | flows-icons                                      |
| `iconRegistry.svelte.ts`, `deferredIcons.ts`                         | ported-no-guard                  | `rn/rsdDrawing/iconRegistry.ts`, `deferredIconWarmup*.ts`                                                        | native-icons pins the generated set                                                                             | RN web defers the drawer icons (brush, line-weight, camera …), so tiles start blank (D21)                                                                                           | M (web) | —                                                |

## 2. Behaviour inventory

| behaviour (user-visible)                                                                                             | shipping spec(s)                                 | RN evidence                                                                         | likely to differ?                                                                |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Palette and picker**                                                                                               |                                                  |                                                                                     |                                                                                  |
| Tapping a swatch loads that ink and paints with it                                                                   | flows-palette-rendering                          | rsd-native-toolbar, native-custom-color-output                                      | N                                                                                |
| Same 15 colours and order; Purple at launch; colour and custom colour not kept across relaunch                       | (palette.ts, colors.svelte.ts)                   | native-drawing-tokens, native-custom-colors                                         | N                                                                                |
| Black paints white on dark paper and follows a live theme switch                                                     | flows-palette-rendering                          | native-appearance-paint                                                             | N for the selected ink; **Y** for already-drawn ink (D16)                        |
| Selected swatch ringed in a ±10% shade of itself                                                                     | flows-palette-rendering, phone-landscape-toolbar | rsd-native-drawing-frame                                                            | N                                                                                |
| Ring hides while the eraser is held                                                                                  | (ColorPalette/ColorMenu)                         | rsd-native-color-control (menu only)                                                | **Y** on the RN bar (D12)                                                        |
| A pick plays a ring bloom and a springy release                                                                      | (ColorSwatch, pressRelease)                      | none                                                                                | **Y** (D10)                                                                      |
| Picking a colour while erasing or using magic returns to the last ink brush                                          | flows-palette-brush                              | native-brush-preferences                                                            | N for swatches; **Y** for the bar's More colors (D2)                             |
| Custom swatch: one tap selects it (last custom ink, ringed) and opens the picker; dismissing leaves nothing ringed   | phone-landscape-toolbar                          | rsd-native-color-control (menu ring)                                                | **Y** on the RN bar (D2)                                                         |
| Only one custom colour; the palette's swatch set never changes when one is picked                                    | palette-trim                                     | native-custom-colors, rsd-native-toolbar (both assert RN's 6-paint memory)          | **Y** (D1)                                                                       |
| Palette shows as many swatches as fit, by fixed rank; phone landscape hides the bar                                  | palette-trim                                     | rsd-native-drawing-frame (count ladder), rsd-native-color-control                   | **Y** with custom paints (D1); **Y** on iPad landscape with a bottom inset (D11) |
| Picker: a drag highlights and the lift picks once; a gap tap snaps to the nearest hexagon; keyboard activation works | flows-palette-brush                              | rsd-native-color-picker                                                             | N (two-finger case differs, low)                                                 |
| Picker grid trims rows and columns per viewport; large tablet grows swatches                                         | picker-trim                                      | rsd-native-color-picker                                                             | N                                                                                |
| A pick closes the picker; scrim, Escape and Back close without picking                                               | flows-palette-brush                              | rsd-native-color-picker                                                             | N                                                                                |
| A double tap on the opener does not immediately close the new dialog (launch zone)                                   | (modalDialog/launchGuard)                        | none                                                                                | **Y** (D5)                                                                       |
| Touching the palette mid-stroke picks the colour and ends the stroke                                                 | brush-ring                                       | rsd-native-stroke-chrome (asserts RN's opposite)                                    | **Y** (D3)                                                                       |
| Scribble guard on stylus taps                                                                                        | flows-palette-brush (5 tests)                    | none                                                                                | not-needed-on-RN (WebView-only iPadOS Scribble)                                  |
| **Phone-landscape Color Button and Color Menu**                                                                      |                                                  |                                                                                     |                                                                                  |
| L-shaped toolbar fits a short phone; canvas stays full width                                                         | phone-landscape-toolbar                          | rsd-native-color-control, rsd-native-bare-layout                                    | N                                                                                |
| Menu pick loads the ink and closes; custom option ringed in the custom ink; rings hide while erasing                 | phone-landscape-toolbar                          | rsd-native-color-control                                                            | N                                                                                |
| Drawing dismisses the menu; swipe folds the drawer; rotating upright closes it; it survives every control being off  | phone-landscape-toolbar                          | rsd-native-stroke-chrome, rsd-native-color-control, rsd-native-tool-drawer-settings | N                                                                                |
| Menu trims to whole swatches; custom kept; final set in the first frame                                              | phone-landscape-toolbar                          | rsd-native-color-control (ladder)                                                   | N                                                                                |
| Dismissing the first custom picker leaves its option unpressed                                                       | phone-landscape-toolbar                          | none                                                                                | unclear (the RN menu selects ink but never a custom swatch)                      |
| **Tool Drawer, Actions Panel and flyouts**                                                                           |                                                  |                                                                                     |                                                                                  |
| Drawer closed on first launch; open state kept across relaunch                                                       | flows-undo-persistence                           | rsd-native-drawer-open, drawerOpen                                                  | N                                                                                |
| Tools in order: Brush, Stroke, Coloring, Camera, AI, Undo; chevron after them; Settings separate                     | actions-panel-layout                             | rsd-native-toolbar                                                                  | N                                                                                |
| AI button hidden offline, so the others resize                                                                       | actions-panel-layout                             | none                                                                                | **Y** (D21; AI slice)                                                            |
| Drawer open cascades, close collapses, chevron turn animates                                                         | flows-actions-panel                              | none                                                                                | **Y** (D10)                                                                      |
| Brush and Stroke menus pop in and fold away                                                                          | (app.css flyout-shell, flyoutExit)               | none                                                                                | **Y** (D10)                                                                      |
| An open menu greys the other tiles (0.35) and the chevron (0.2)                                                      | bare-toolbar                                     | rsd-native-actions-panel                                                            | N                                                                                |
| Escape and keyboard pick restore focus; second trigger tap closes; outside press closes without being swallowed      | flows-actions-panel                              | native-flyout-focus, rsd-native-actions-panel                                       | N (no Escape on RN native)                                                       |
| Menus, drawer, Undo and Settings respond while another finger or a palm is on the paper                              | (BrushMenu "motionless", releaseAllPointers)     | rsd-native-stroke-chrome (asserts RN refuses)                                       | **Y** (D3)                                                                       |
| Toolbar keeps its look while a dialog is open, during a save or clear, and after a settings write                    | (ActionsPanel settings-covered only)             | rsd-native-drawer-style-switch (asserts RN fades)                                   | **Y** (D4)                                                                       |
| Brush control: none / toggle / menu of Pen + enabled brushes; disabling the held brush returns to Pen                | flows-optional-brushes                           | native-brush-preferences, rsd-native-toolbar                                        | N                                                                                |
| Brush face rolls in on a pick                                                                                        | (BrushButtonFaces)                               | none                                                                                | **Y** (D10)                                                                      |
| Picked brush (never the eraser) kept across relaunch                                                                 | flows-undo-persistence                           | native-brush-preferences                                                            | N on relaunch; **Y** on upgrade (D15)                                            |
| Pen and eraser widths independent and kept; five sizes "Size N" / "Eraser size N"                                    | flows-undo-persistence                           | native-stroke-widths, rsd-native-actions-panel                                      | N                                                                                |
| Stroke trigger shows the brush glyph in the ink, keylined for white and near-black                                   | flows-magic-brush                                | rsd-native-actions-panel                                                            | N                                                                                |
| Undo reverts a stroke; Ctrl/Cmd+Z works with the button hidden                                                       | flows-undo-persistence                           | rsd-native-toolbar, native-undo-shortcut                                            | N (RN refuses mid-stroke, low)                                                   |
| Undo at end of history shakes and flashes (flash only under reduced motion)                                          | flows-undo-persistence                           | none                                                                                | **Y** (D7)                                                                       |
| Undo icon winds back; undone ink ghosts toward the button                                                            | (app.css undo-spin, inkMotion)                   | none                                                                                | **Y** (D7)                                                                       |
| Tool Drawer switch hides only its own tools; chevron goes only when nothing is left                                  | flows-undo-persistence, flows-actions-panel      | rsd-native-tool-drawer-settings                                                     | N                                                                                |
| A corrupt stored setting falls back to its own default only                                                          | flows-undo-persistence                           | native-control-preferences (asserts whole-record rejection)                         | **Y** (D20)                                                                      |
| First paint already shows the persisted toolbar                                                                      | actions-panel-layout, first-paint                | bareGlassHold.web                                                                   | **Y** (RN shows bare paper until settings load; low)                             |
| Six-button landscape row stops short of Settings at every Button Size                                                | actions-panel-layout                             | rsd-native-button-size                                                              | N                                                                                |
| Button Size scales drawer tiles only; a drag force-opens the drawer; ceiling adapts to the screen                    | bare-toolbar                                     | rsd-native-button-size                                                              | N for scaling; **Y** for the ceiling (D21)                                       |
| A menu open behind a keyboard Settings session does not come back                                                    | flows-optional-brushes                           | none                                                                                | **Y** (low; `RsdActionsPanel.tsx:58` keeps the flyout state)                     |
| **Toolbar style (Raised / Flat)**                                                                                    |                                                  |                                                                                     |                                                                                  |
| Default Raised; choice kept across relaunch                                                                          | bare-toolbar                                     | native-sound-sources, native-settings-sections                                      | N on relaunch; **Y** on upgrade (D15)                                            |
| Switching style keeps ink and coloring art at the same screen pixels                                                 | bare-toolbar, bare-toolbar-paper                 | none                                                                                | **Y** (D13)                                                                      |
| Switching keeps HUD controls in place                                                                                | bare-toolbar                                     | rsd-native-bare-layout                                                              | N                                                                                |
| Flat: frosted panes under the drawer, menus and Settings corner; frosted rail                                        | bare-toolbar                                     | rsd-native-bare-toolbar (web)                                                       | **Y** on iOS and Android (D14)                                                   |
| Flat glass shrinks, fades between controls, hides stale panes during rotation; halos stay above the glass            | bare-toolbar                                     | bareGlassFullscreen.web, bareGlassHold.web                                          | **Y** on native (no panes); **Y** on web for halo order and stale panes (low)    |
| Flat disabled Undo stays transparent when pressed                                                                    | bare-toolbar                                     | rsd-native-bare-toolbar                                                             | N                                                                                |
| **Clear**                                                                                                            |                                                  |                                                                                     |                                                                                  |
| Drag past the accept ring (0.4 × short side) clears; releasing short springs back                                    | clear-ring, drawing-motion-clear                 | rsd-native-clear, native-clear-projection                                           | N                                                                                |
| Rising water-drop notes while dragging; three falling notes on a short release                                       | (clearSound ladder)                              | none                                                                                | **Y** (D2)                                                                       |
| One Medium haptic per outward crossing; page-turn sound on commit at the sound volume                                | (dragToClear, clearSound)                        | rsd-native-clear, native-clear-sound                                                | N (native volume capped above 50: D19)                                           |
| Departing page flies into the dock; none under reduced motion                                                        | drawing-motion-clear                             | rsd-native-clear                                                                    | N (RN flies a sheet for an erased-blank page, low)                               |
| Clear committed across a rotation flies into the new dock                                                            | drawing-motion-clear                             | none                                                                                | unclear                                                                          |
| Triple tap or a 500ms hold shows the wordless coachmark; no memory, shows again later                                | clear-tutorial                                   | rsd-native-clear, native-clear-projection                                           | N                                                                                |
| Cleared button cannot re-arm from the release point                                                                  | clear-tutorial                                   | rsd-native-clear                                                                    | N                                                                                |
| Clear works with a hand on the paper (it ends the strokes)                                                           | (dragToClear `releaseAllPointers`)               | rsd-native-stroke-chrome (asserts RN refuses)                                       | **Y** (D3)                                                                       |
| The page clears at once and drawing resumes immediately                                                              | (engine clearCanvas, synchronous)                | none                                                                                | **Y** (D4, D6)                                                                   |
| Clearing with the eraser held returns to the last ink; Magic stays                                                   | (resetToolAfterClear)                            | native-brush-preferences                                                            | N                                                                                |
| Undo during the flight restores the ink at once                                                                      | drawing-motion                                   | none                                                                                | **Y** (low)                                                                      |
| Auto-Save on Delete (default off): save and clear both happen; a failed save offers Try again                        | save-failure-announcement, engine-export         | native-save-to-photos-mounted (asserts RN keeps the drawing)                        | **Y** (D6)                                                                       |
| **Save Picture and polaroid**                                                                                        |                                                  |                                                                                     |                                                                                  |
| Camera on by default; Saving switch; disabled on a blank page                                                        | flows-screenshot                                 | rsd-native-toolbar, rsd-native-tool-drawer-settings                                 | N                                                                                |
| Camera squashes on capture                                                                                           | flows-screenshot, reduce-motion                  | none                                                                                | **Y** (D7)                                                                       |
| A burst of taps shares one save; then a 4s cooldown; refused taps shake                                              | flows-screenshot                                 | none                                                                                | **Y** (D8)                                                                       |
| Drawing continues while a save runs                                                                                  | (screenshot.ts)                                  | none                                                                                | **Y** (D4)                                                                       |
| Polaroid flies from the camera (flash; fade under reduced motion); a failed save takes it back                       | flows-screenshot                                 | native-polaroid-flight, rsd-native-save-flight                                      | N (starts later on RN)                                                           |
| Saves land in Pictures/Splotch on every supported Android                                                            | (PhotoLibraryPlugin)                             | native-photo-library (asserts RN "unavailable" below Android 11)                    | **Y** (D9)                                                                       |
| Save Failure Banner copy, gated Open Settings, Try again with the same bytes, re-announce                            | save-failure-announcement                        | rsd-native-save-flight, native-save-failure                                         | N                                                                                |
| An unsaved picture's banner survives a relaunch                                                                      | save-failure-announcement                        | none                                                                                | **Y** (D9)                                                                       |
| **Icons and primitives**                                                                                             |                                                  |                                                                                     |                                                                                  |
| Icons come from the shipping SVG set, with the colour-icon opt-out                                                   | flows-icons                                      | native-icons                                                                        | N                                                                                |
| button-states, touch-targets, page-short-viewport, text-contrast                                                     | (styleguide, feedback page, contrast harness)    | rsd-native-button, rsd-native-design-primitives                                     | outside this slice                                                               |

## 3. Concrete differences

Severity scale:

| Severity | Meaning                                    |
| -------- | ------------------------------------------ |
| H        | a child or parent notices in normal use    |
| M        | noticed in specific situations or settings |
| L        | cosmetic or edge case                      |

### D1. Custom colours become extra swatches that push palette colours off the bar (H)

* **Shipping:**
  * There is one custom (honeycomb) swatch.
  * While a picked custom colour is active, that swatch is ringed in the exact custom ink
    (`lib/components/ColorPalette.svelte:107-112`, `ColorSwatch.svelte:203-210`).
  * Palette swatches are trimmed by CSS rank only (`ColorPalette.svelte:195-312`), so they never
    move.
* **RN:**
  * Remembers up to 6 custom paints (`rn/drawing/palette.ts:75`, `:156-162`).
  * `visiblePaints` (`palette.ts:102-117`, used at `rn/rsdDrawing/RsdEdgeControls.tsx:234`) adds
    each paint as a plain disc.
  * It always keeps the selected paint by dropping the lowest-priority palette colour still on the
    bar.
  * "More colors" is never ringed (`RsdSwatch.tsx:163-191`).
* **Effect:** on a portrait phone, picking a custom colour makes Green vanish and a new disc appear.
  Picking Purple removes the disc and brings Green back.
* **Tests:** RN tests pin the RN behaviour: native-custom-colors "keeps six distinct recent custom
  paints", rsd-native-toolbar "keeps the loaded paint on the bar".
* **RN is inconsistent with itself:** the RN phone-landscape Color Menu follows shipping
  (`RsdColorMenu.tsx:104-134`).

### D2. Clear drag is silent until the commit (H)

* **Shipping:** `lib/audio/clearSound.ts:7-49` and `:98-137`, driven from
  `lib/actions/dragToClear.ts:230` and `:315`.
  * Dragging plays a pentatonic water-drop ladder: 9 approach notes plus 9 more past the threshold,
    out to 2.6× the radius.
  * Pulling back walks it down.
  * Releasing short plays 3 falling notes, "the only thing … that tells a child the drawing
    survived".
* **RN:** `rn/audio/pageTurnSound.ts:65-78` has only start, commit and cancel for the page-turn
  clip. `rn/clear/useClearGesture.ts:160-164` (follow) and `:187-190` (cancel) play nothing. No
  ladder exists in RN.
* **Effect:** the delete sound is on by default, so every Clear drag on RN is mute until the page
  turn.
* **Tests:** native-clear-projection pins the page-turn gain and curve but not the ladder.

### D3. A finger or palm on the paper makes the chrome unresponsive to touch (H)

* **Shipping:** every pointer reaches the chrome independently.
  * A palette press (`lib/components/ColorPalette.svelte:62-65`), a colour-menu press
    (`ColorControl.svelte:40-57`) or a Clear press (`lib/actions/dragToClear.ts:189`) calls
    `releaseAllPointers()`. That ends the live strokes and then acts.
  * The Brush and Stroke menus open mid-stroke without motion (`BrushMenu.svelte:48`,
    `StrokeWidthMenu.svelte:45`).
  * The drawer toggles mid-stroke (`ActionsPanel.svelte:124-131`).
* **RN:** "touches stay with the paper's responder" (commit 13e62c9bf,
  `rn/useDrawingScreen.ts:85-92`). In `contactResponder.ts:246-272`, a second touch whose target is
  not the paper is ignored.
  * On top of that, Clear is `disabled: disabled || screen.drawing`
    (`rn/rsdDrawing/RsdEdgeControls.tsx:109`; it also cancels a drag in progress,
    `useClearGesture.ts:318-320`).
  * Menus refuse to open while drawing (`RsdActionsPanel.tsx:72`).
  * Undo, Settings and AI refuse too (`useDrawingScreen.ts:94-100`, `RsdEdgeControls.tsx:161-163`).
* **Effect:** a toddler resting one hand on the paper cannot pick a colour, clear, undo or open a
  menu with the other hand. Shipping allows all of these and ends the resting stroke.
* **Tests:** RN pins its own behaviour (rsd-native-stroke-chrome, native-stroke-chrome-mounted). The
  shipping evidence is brush-ring "a palette press mid-stroke removes the live brush ring".

### D4. The whole toolbar greys out, and the paper locks, during routine work and behind dialogs (H)

* **RN:** one `disabled` flag covers several states.
  * Source: `busy || preparing || pagePickerOpen || settings.sheetOpen || brushes not ready`
    (`rn/useDrawingScreen.ts:91-92`), plus `modalBlocked`
    (`rn/rsdDrawing/RsdDrawingScreen.tsx:246-250`).
  * When it is set, every drawer tile drops to opacity 0.3, muted (`RsdIconButton.tsx:28`,
    `:138-145`, `:465`), and is unpressable.
  * Palette swatches, More colors and the Clear face drop to 0.65 (`RsdSwatch.tsx:65`,
    `RsdClearFace.tsx:87`).
  * `busy` is set by `runCommand` (`useDrawingScreen.ts:386-404`), which also calls
    `surface.lockInput()` for the whole Save Picture (capture, iOS permission prompt, photo-library
    write) and the whole Clear (capture, ink scan, and with Auto-Save the save as well).
  * `preparing` (SkiaInk not ready) greys the toolbar at launch, on a page change and on a theme
    switch.
  * Every Stroke Width or other settings pick publishes `status:'saving'`
    (`rn/settings/soundSettings.ts:406-413`). That disables the Stroke tile, the menu and the
    palette (`RsdActionsPanel.tsx:185`, `:389`, `:470`; `RsdDrawingScreen.tsx:250`) until the async
    write lands.
* **Shipping:**
  * Behind Settings the only change is that transition durations go to 0
    (`lib/components/ActionsPanel.svelte:230`, `:379-381`).
  * A save snapshots synchronously and runs in the background (`lib/drawing/screenshot.ts:81-110`).
  * Clear is synchronous (`ClearButton.svelte:59-69`).
  * The palette has no disabled state.
* **Effect:**
  * Every camera tap and every clear flashes the whole chrome to 30%.
  * Strokes drawn during a save are refused.
  * The toolbar is faded behind every dialog's scrim. This is the known "faded behind dialogs"
    issue, still present at HEAD and pinned as intended by rsd-native-drawer-style-switch.

### D5. No launch dead zone on dialogs (H)

* **Shipping:** opening any modal arms a dead zone around the launching button
  (`lib/actions/launchGuard.ts:27`, `:32`, applied in `actions/modalDialog.svelte.ts:240`, `:272`,
  `:343`). Repeat taps on the backdrop or content within 72px for 600ms are swallowed. This covers
  the picker, Coloring books (`ActionsPanel.svelte:218`) and Settings (`SettingsButton.svelte:13`).
* **RN:** the backdrop closes on any release as soon as it is visible
  (`rn/rsdDrawing/ModalShell.tsx:233-239`). `tapZone.ts` is used only for the coloring picker's
  book→pages swap (`RsdColoringBookPicker.tsx:152`).
* **Effect:** a toddler's double tap on More colors, Coloring books or Settings opens the dialog and
  closes it at once.

### D6. Auto-Save on Delete: RN delays the clear and keeps the drawing if the save fails (M; default off)

* **Shipping:** `ClearButton.svelte:59-69`.
  * The save runs fire-and-forget: "the save must not delay the clear". The snapshot is taken
    synchronously before `clearCanvas` (`lib/drawing/saveOnDelete.ts:12-29`).
  * A failure goes to the banner holding the blob. The blob is persisted, so Try again survives a
    relaunch (`lib/state/saveFailure.svelte.ts:161-173`).
* **RN:** `rn/useDrawingScreen.ts:442-447`.
  * It awaits `keepPicture` before clearing history, including any first-time Photos permission
    prompt.
  * If the save fails it returns without clearing ("a picture Auto-Save could not keep stays on the
    paper").
  * The gesture has already played the page flight and sound (`useClearGesture.ts:166-185`), so the
    drawing pops back with a banner.
* **Effect:** with Photos denied, every clear fails. With the setting on, every clear is visibly
  late and the chrome stays greyed (D4) for the length of the save.
* **Tests:** RN pins this in native-save-to-photos-mounted, "keeps the picture on the paper when the
  photo library refuses it".

### D7. No "not now" cue, no camera shutter, and no Undo animations (M)

* **Shipping:**
  * Undo stays tappable at the end of history (`aria-disabled`,
    `lib/components/UndoButton.svelte:21-33`). A tap plays the shake plus brand-glow cue
    (`lib/actionUnavailableFeedback.ts:16-33`, `app.css:1041-1106`); under reduced motion it plays
    the flash only (spec "end-of-history cue still plays with reduced motion").
  * Undo winds its icon back (`app.css:1350-1379`), and the undone ink ghosts toward the button
    (`lib/drawing/engine.ts:1139-1145`).
  * The camera squashes on capture (`lib/drawing/screenshotFeedback.ts:14-21`, `app.css:1028-1037`)
    and shakes on a refused tap or a failed save (`screenshot.ts:77`, `:84`, `:90`).
* **RN:**
  * Undo is truly `disabled={… || screen.history.undo.length === 0}`
    (`rn/rsdDrawing/RsdActionsPanel.tsx:264`; `RsdIconButton.tsx:445`), so a tap does nothing.
  * RN has no spin, ghost, shutter or shake code at all; a grep confirms it.

### D8. No screenshot cooldown or burst coalescing; a second polaroid cuts the first (M)

* **Shipping:** a burst of taps shares one save. After that, taps are refused with the shake for
  `SCREENSHOT_COOLDOWN_MS = 4000` (`lib/drawing/screenshotTiming.ts:10`, `screenshot.ts:75-110`).
* **RN:** extra taps during a save are silently dropped, because the camera is disabled while busy.
  The camera is live again as soon as the save ends.
  * `launch()` replaces the single flight (`rn/useSavePicture.ts:37-41`), so a quick second save
    makes the 1.9s polaroid vanish mid-flight.
  * The RN polaroid starts only after the full PNG capture (`useDrawingScreen.ts:350-353`). Shipping
    starts it from a preview raster during export (`polaroidAnimation.ts:93-117`).

### D9. Android 7–10 cannot save, and unsaved pictures don't survive a relaunch (H on those devices / M)

* **Android 7–10:** RN returns `'unavailable'` below API 30 (`rn/platform/photoLibrary.ts:11`,
  `:22-23`; pinned by native-photo-library). The banner reads "needs Android 11 or later" and offers
  no Try again.
  * Shipping saves on API 29+ through MediaStore. On API 24–28 it uses a storage-permission write
    with an app-media fallback
    (`android/app/src/main/java/art/splotch/app/PhotoLibraryPlugin.java:37-43`, `:116-123`).
  * Both apps have minSdk 24. This also breaks Auto-Save on Delete on those devices (D6).
* **Unsaved pictures:** RN holds them in memory only (`rn/export/saveFailure.ts:4-6`). Shipping
  persists them to IndexedDB and restores the banner at boot
  (`lib/state/saveFailure.svelte.ts:68-71`, `:210-234`).

### D10. Chrome motion is largely absent (M as a group)

All of these are missing or instant on RN (`RsdActionsPanel.tsx:344-363`, `RsdIconButton.tsx`,
`RsdSwatch.tsx:38-41`):

* **Drawer:** the 30ms-staggered button cascade (`lib/actions/drawerCascade.ts`,
  `app.css:1411-1425`), the collapse (`ActionsPanel.svelte:346-423`) and the animated chevron turn.
* **Menus:** the entrance (`app.css:1263-1312`) and exit (`lib/components/flyoutExit.ts:22-33`).
* **Brush face:** the roll on a pick (`BrushButtonFaces.svelte:8-49`).
* **Swatches:** the selection ring bloom, 620ms + 700ms (`ColorSwatch.svelte:133-175`), and the
  springy release (`lib/actions/pressRelease.ts`).
* **Clear button:** the ease-pop ring reveal, the radius morph, and the lid and glow fades. RN uses
  linear 300ms (`useClearGesture.ts:154-158`); shipping uses `ClearButton.svelte:158-183`.

### D11. iPad landscape palette shows one colour fewer (M)

* **RN:** trims by the viewport minus the bottom safe-area inset
  (`rn/rsdDrawing/NativeScrollAreas.tsx:109-114`, `:160`; pinned deliberately by
  rsd-native-drawing-frame "trims by the viewport less the bottom inset").
* **Shipping:** trims by the full height (`ColorPalette.svelte:273-312`).
* **Effect:**

| Device (landscape) | Shipping | RN | Colour RN drops |
| ------------------ | -------- | -- | --------------- |
| iPad mini          | 9        | 8  | Teal            |
| iPad Air           | 10       | 9  | Brown           |
| 13" iPad           | 13       | 12 | Indigo          |

### D12. More colors tap and the eraser ring on the RN bar (M)

* **Shipping:**
  * The custom swatch first calls `selectInkBrush()` and `selectCustomSwatch()`, then opens the
    picker (`ColorPalette.svelte:55-60`). The last custom ink comes back at once.
  * All rings hide while erasing (`ColorPalette.svelte:39-40`).
* **RN bar:**
  * More colors only calls `screen.openColorPicker` (`RsdEdgeControls.tsx:271`), so a dismissed
    picker leaves the eraser or magic brush on and the old swatch ringed.
  * The selected paint stays ringed while erasing (`RsdEdgeControls.tsx:259`,
    `selected={color === selectedColor}`).
* **The RN phone-landscape menu gets both right** (`RsdActionsPanel.tsx:514-518`,
  `RsdColorMenu.tsx:157`).

### D13. Switching Raised ↔ Flat with ink "lifts" the paper (H; the known issue, still at HEAD)

* **Shipping:** ADR-0166 (`docs/adrs/0166-bare-toolbar-paper-glass.md:19-25`).
  * Flat makes the canvas full width.
  * An occupied paper keeps its size, and the view translation compensates.
  * bare-toolbar-paper.spec pins that ink and art stay at the same pixels.
* **RN:**
  * In Flat the bar floats and the paper area grows (`rn/rsdDrawing/NativeScrollAreas.tsx:122-129`).
  * The adopted paper is contain-fitted and recentred with no translation compensation
    (`rn/drawing/paperGeometry.ts:74-94`).
  * The result is a lifted sheet on the margin tone.
* **Caution:** the pending fix c47f3e47b7af2399737d6fe2b99bfcdfd56d8486 ("Keep the flat palette bar
  in the flow natively", Refs \#2905) is not in HEAD. Its premise contradicts ADR-0166, and it would
  make RN's Flat canvas exclude the strip under the rail. Shipping includes that strip.

### D14. Native Flat style has no frosted glass (M; Flat is opt-in)

* **RN native:** `RsdGlassPanes` returns null (`rn/rsdDrawing/RsdBareGlass.tsx:66-68`).
  * There are no panes under the drawer tiles, open menus, the Settings corner or the compact L, so
    Flat icons print straight onto ink.
  * The rail is opaque paper with no blur (`:20-37`).
  * The margin rules have no fiber mask.
* **Shipping:** renders frosted panes and rail glass in Capacitor too: tint plus 5.1px / 4.6px blur,
  with an opaque fallback only for reduced transparency (`lib/components/GlassPanes.svelte:35-46`,
  `BareToolbarPaper.svelte:103-118`).
* **RN web** matches shipping.

### D15. Upgrading from shipping to RN loses every chrome setting (H at release; cross-cutting)

* **Shipping:** stores per-key `splotch-*` values (`lib/storageKeys.ts`), mirrored to Capacitor
  Preferences on native.
* **RN:**
  * Most settings live in one JSON record: `Documents/splotch-sound-settings-v1/` on native,
    `splotch-candidate:sound-v1` on web (`rn/platform/soundSettings*.ts`).
  * Brush settings live in their own store: `splotch-brush-settings-v1` /
    `splotch-candidate:brush-v1` (`rn/platform/brushPreferences*.ts`).
  * Only `drawerOpen` uses a shipping key name, and on native it is a Documents file
    (`rn/platform/drawerOpen.ts:11-13`), not Preferences.
  * There is no importer.
* **Effect:** toolbar style, Button Size, brush and optional brushes, widths,
  undo/screenshot/stroke/tool-drawer switches and save-on-delete all revert to defaults.
* **Not affected:** relaunch persistence inside RN matches shipping. The colour is not persisted in
  either.

### D16. Already-drawn Black ink re-themes in RN (M; deliberate per ADR-0178)

* **Shipping:** a stroke keeps the hex it was drawn with (`DrawingCanvas.svelte:162-164`).
* **RN:** strokes store `'Black'` (`rn/drawing/model.ts:42-43`) and are painted at render time
  (`skiaInkPainter.ts:220`, `:260`).
* **Effect:** switching the theme turns existing black lines white, or white lines black.

### Lower-severity items (L unless noted)

* **D19 (M) Native page-turn volume capped at unity:** `rn/platform/clearSound.ts:8`, `:46`.
  Shipping goes up to gain 2 at volume 100 (`clearSound.ts:256`).
* **D20 Corrupt or unreadable settings:**
  * RN rejects the whole record. Sound and coloring book go off, the AI is protected, and a banner
    shows (`rn/settings/soundSettings.ts:95-117`).
  * An unreadable brush store turns crayon, magic and eraser off
    (`rn/settings/brushPreferences.ts:82-90`).
  * Shipping falls back per key (spec "a corrupt default-on setting stays enabled").
* **D21 (M) Layout and loading details:**
  * The AI button stays visible offline; shipping hides it and recounts
    (`actionButtonLayout.ts:131-155` vs `RsdActionsPanel.tsx:231`).
  * The Button Size slider is fixed at 70–130; shipping's ceiling adapts to the screen
    (`ButtonSizeSetting.svelte:20-36`).
  * On RN web, the drawer icons sit in the deferred chunk (`icons.deferred.generated.ts`,
    `deferredIconWarmup.web.ts:8-10`), so a remembered-open drawer shows blank tiles.
  * First paint shows bare paper until settings load (`RsdDrawingScreen.tsx:82-85`).
* **D22 Clear details:**
  * The paper grain vanishes during the 560ms flight (`RsdClearUnderlay.tsx:55`).
  * Undo during the flight stays hidden under the cover.
  * The button is clipped at the safe-area frame (`NativeScrollAreas.tsx:31-32`).
  * The square hit area includes the corner wedges.
  * The coachmark always anchors to the dock and dismisses on any resize.
  * Rotating mid-drag redraws the ring at the new radius while the threshold keeps the old one.
  * After a clear, magic rotates to the next rainbow instead of a random one (`model.ts:161`).
  * An erased-blank page still flies a sheet.
  * The Clear press closes an open menu (shipping keeps it).
  * VoiceOver and TalkBack can clear on RN; shipping's comment says they cannot.
* **D23 Accessibility names:**
  * Swatch "Purple paint" vs "Purple".
  * Black-in-dark is "Black paint" vs "White".
  * "More colors" vs "Custom Color".
  * radio/radiogroup/switch roles vs buttons with `aria-pressed`.
  * The chevron's `aria-expanded` follows the forced-open state during a Button Size drag.
* **D24 Picker details:**
  * A second finger cancels the pick (shipping: the first lift picks).
  * The scrim closes on release rather than on press.
  * The fly-in starts from the press point, not the button centre.
  * There is no 100ms ignore window for strokes after a colour change (`strokeMath.ts:140-143`).
  * A colour picked in the landscape menu stays visible on the portrait bar after rotation, by
    dropping Green.
* **D25 Polaroid and Flat chrome:**
  * The polaroid and its flash are confined inside the safe-area padding
    (`RsdPolaroidFlight.tsx:66`, `NativeFrame.tsx:62-66`).
  * Flat safe-area strips have no grain.
  * On RN web, pointer halos render under the glass panes (shipping puts them above, ADR-0166).
* **D26 Behind-dialog flyout:** a Brush Menu left open behind a keyboard Settings session reappears
  afterwards, even as a two-entry menu beside a toggle (`RsdActionsPanel.tsx:58`). Shipping releases
  it.

### Verified the same (from code)

**Palette and colour**

* Palette hexes, labels, order and trim priority match. Purple is the launch default. Colour is not
  persisted.
* Ring formula, widths and the 1px seam match. Swatch, bar and press geometry match.
* The ink keylines match (white, and luminance below 0.14).
* The hex picker matches: families, ladders, 1.3× on large screens, snap radius, hover, keyboard
  detail-0 picks, close on pick.
* The Color Menu matches: 11 colours, ladder, custom ring, erase-hides-ring, fold gesture at 18px.

**Drawer and flyouts**

* Defaults match: drawer closed; all controls on; Button Size 100 (range 70–130); pen; width level 3
  for both.
* The eraser is never persisted. Magic is restored, with Pen as its last ink brush.
* The Tool Drawer switch hides only its own tools, and the chevron goes only when nothing is left.
* The drawer contents, order and chevron angles match.
* Flyout dismissal matches: outside press, second tap, pick, drawer close, rotation, Escape on web.
* Open-menu dim matches: grayscale at 0.35, chevron at 0.2.
* Size classes, gaps and the phone-landscape L geometry match.

**Clear**

* Threshold, tap/hold/triple-tap coachmark rules (no persisted counter, 6s auto-dismiss), haptic,
  page-turn clip (byte-identical), flood/wash and dock geometry all match.
* Tool reset after a clear matches, and a clear is undoable in both.
* Save-on-delete is off by default, is skipped on a blank page, and uses the same label.

**Save Picture, polaroid and styles**

* Filename, Android album and iOS add-only save match.
* Polaroid size, keyframes, flash and reduced-motion fade match.
* Save Failure Banner copy, gate, retry and re-announce match.
* Default toolbar style is Raised. The Flat tile skin and the web glass geometry match.

**Issues fixed in RN**

* Chrome no longer fades mid-stroke (`rn/useDrawingScreen.ts:85-92`).
* Drawer-open state persists.
* Colour is no longer persisted.
