# Spike: RN ink invisible after rotation

2026-11-10 01:14 → 03:45 EST. Half-day fix spike on the journeys-ipad defect "RN ink invisible after
rotation" (`journeys-ipad.md`, J14 and defect 2). Build under test: RN Release, probe off,
`427756f14` (`$C/builds/sim/rn/Splotch.app`). Spike build: the same plus one commit,
`claude/spike-rn-rotation-ink` @ 7d07dfe9d (local only, never pushed). Raw media, logs and scripts
are under `$C/spike-rotation/` (`$C` = the campaign scratch folder in the rig file).

## Method

| Item        | Value                                                                                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rigs        | Frozen: the shared `campaign-ipad-12.9` simulator (iPad Pro 12.9" 5th gen, iPadOS 26.5). Spike: own simulators `spike-rotation` (same model and OS) and `spike-rotation-13` (iPad Pro 13" M4, iPadOS 26.5)                                                                           |
| Input       | Appium/XCUITest W3C pointer actions, the journeys lane's method                                                                                                                                                                                                                      |
| One try     | Clear, ink a red zigzag in orientation A, rotate to B, wait 1.5 s, clear by dragging the Clear Button, pick Blue, draw a blue zigzag, wait 1 s. Ink visible = more than 0 changed pixels in the stroke's box against the cleared shot (a visible stroke changes 36,000–43,000 at 2×) |
| Instruments | XCUITest source tree before and after the stroke (frames of every `testID`), and the app's UIKit tree from `lldb` (`recursiveDescription`, plus `reactSubviews` of `SplotchPaperInputView`)                                                                                          |
| Churn       | "Page and theme churn": apply a Farm coloring page, flip the simulator to Dark and back (the default appearance is System), clear the page. Gate runs do this before tries 1, 4, 7 and 10                                                                                            |

## Q1 Reproduction (frozen RN)

| Run                                                                                       | Tries |   Invisible ink | Notes                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ----: | --------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| journeys-ipad lane (for reference)                                                        |     9 |               4 | Long session after coloring pages, theme changes, multi-finger tests                                                                                                    |
| Same app process, continuing after the journeys lane (`frozen-129/`)                      |    10 |    1 (t05, P→L) | The failing tree holds an extra `paper-texture` inside the native paper input, with no grain children. t02 shows the Indigo swatch moved off the palette onto the paper |
| Fresh launch, rotation only (`cause-129/`, a1–a6)                                         |     6 |               0 | Child list of the paper input correct before and after                                                                                                                  |
| Same process after one coloring page apply and clear (b1–b6)                              |     6 |               0 |                                                                                                                                                                         |
| Fresh launch, page + theme churn, then rotation (`churn-129/`)                            |     6 |               0 | Child list goes wrong during the churn (below), and the tries' layout updates repair it                                                                                 |
| Frozen control: the spike's gate script, churn before tries 1/4/7/10 (`gate-frozen-129/`) |    12 | **1 (g7, P→L)** | Same failure as t05. Every stroke measured paced (below)                                                                                                                |
| **Total in this lane**                                                                    |    40 |           **2** | 2 of 22 once the session has page or theme churn, 0 of 18 after a fresh launch without it                                                                               |

**Pinned sequence:** launch, apply a coloring page, flip Dark and back (or any page or theme
change), clear the page; then repeat: ink in portrait, rotate to landscape, clear, draw. Both
failures here were portrait → landscape; the journeys lane also saw landscape → portrait. Rotation
alone, just after launch, never failed. The page and theme changes corrupt the paper input's native
child list, and the rotation and the first contact after the clear are the layout updates that then
pull a stale view over the ink. The rate depends on session history, so "1 in 10 to 4 in 9 in a used
session, 0 just after launch" is the honest figure.

**What the failure looks like** (`frozen-129/t05-3-source.xml`, journeys `inkdelay/rot-rn-*.png`): a
flat, paper-colored view sits inside the native paper input, above the ink layer. In the journeys
shots it is exactly the old landscape sheet's size (1024 × 793 pt at the slot's top-left) in
portrait, the color is exactly the dark paper token (`#211F29`) with no grain, and the slot's own
grain shows below it. That is the `PaperTexture` view the paper mounts as its underlay when a
rotation lifts the sheet, recycled after the clear unmounted it and re-added over the ink.

## Q2 Cause (confirmed mechanism)

The native paper input is a **legacy (Paper-architecture) view manager**, which Fabric mounts
through its legacy interop layer, and it has **React children** (the ink layer, page art and touch
halos).

| Where                                                                               | What it does                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/drawing/PaperInputView.tsx:21`                                                 | `requireNativeComponent('SplotchPaperInput')`: a legacy `RCTViewManager` (`ios/Splotch/SplotchPaperInput.swift:8,111`), so Fabric wraps it in `RCTLegacyViewManagerInteropComponentView`                            |
| `src/drawing/DrawingSurface.tsx:197-224`                                            | Renders `InkLayer`, `PageArt` and `PointerHalos` as that view's children. `InkLayer` is keyed by page and theme (line 211), so a page or theme change remounts it; page art mounts and unmounts with coloring pages |
| `node_modules/react-native/.../RCTLegacyViewManagerInteropComponentView.mm:173-201` | Inserts a child at once only when it appends; any other insert is deferred until the interop view's own next props or layout update (`finalizeUpdates`, line 214). Removes children **by index**                    |
| `RCTMountingManager.mm:74-98`                                                       | An Insert or Remove never finalizes the parent, so a deferred insert can wait across many transactions while later inserts and removes use indexes that no longer match                                             |
| `UIView+React.m:172` via interop lines 186 and 267                                  | `didUpdateReactSubviews` re-adds every view still in the paper input's own child list with `addSubview`, which moves it out of wherever Fabric has since mounted it                                                 |
| `src/rsdDrawing/NativePaper.tsx:70`                                                 | `underlay={lifted ? paperGrain : null}`: rotation with ink mounts a paper-colored `PaperTexture` under the sheet, and the clear unmounts it into Fabric's recycle pool                                              |

So the list drifts: a theme or page change removes the old ink layer and defers the new one, a later
index-based remove takes the wrong child, and a view that has left React stays in the native list.
Fabric recycles that view object into other UI (a `PaperTexture`, a palette swatch), and the next
layout update of the paper input, which every rotation causes, pulls it back on top of the ink.
Opening a menu "fixes" it because the menu mounts new views from the recycle pool, which moves the
stale object out again.

Evidence, all `lldb` on the simulator app:

| Snapshot                                                                     | Paper input's child list (React says: ink layer, [page art], halos)                                                                                                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh launch (`cause-129/A0`, `churn-129/D0`)                                | ink layer, halos canvas: correct                                                                                                                                                                                                      |
| Page applied (`D1`)                                                          | ink layer, page art, halos: correct                                                                                                                                                                                                   |
| Theme flipped to Dark (`D2`), back to Light (`D3`)                           | **page art, halos: the ink layer is missing** (its insert is deferred)                                                                                                                                                                |
| Page cleared, Dark again (`D4`, `D5`)                                        | **halos only**                                                                                                                                                                                                                        |
| After 6 rotation tries (`D6`)                                                | ink layer, halos: the rotations' layout updates applied the deferred insert                                                                                                                                                           |
| The long-lived process the journeys lane used (`frozen-129/vd-baseline.txt`) | ink layer and **a recycled 63 × 63 view at (−4, −4)** (a palette swatch's frame). **The halos canvas is gone**, so touch halos no longer draw in that session                                                                         |
| Frozen control, one object followed (`gate-frozen-129/C7`, `C10`, `G1`)      | `0x1103ee400` is the ink layer root at C7. After the next theme flip it stays listed with no React tag (recycled) at C10. By the end it is a 63 × 63 swatch ring at (−4, −4) inside the paper. The halos canvas is missing from C4 on |

Not reconstructed step by step: the exact transaction interleaving that leaves a particular object
behind. The mechanism is confirmed by the RN source, the drifted lists, and the stale views found in
the failing trees. Shipping draws in a WebView and has no native views with React children, so it
cannot hit this.

**Not input pacing.** The multi-finger spike found that XCUITest delivers a gesture to UIKit in one
burst. This defect does not live in the input path. The drift above appeared with taps and
appearance flips only, no drags (`D2`–`D5`). The stale view is a mount-tree object that rotation
pulls in, and the stroke only reveals it: the strokes were always recorded (Undo enabled, colors
applied), just covered. The strokes were also not bursts. UIKit's touch-frame log
(`Evaluating dispatch of UIEvent … type: 0`, the ipad-experiment lane's instrument) on the spike
simulator gave these results for the shapes used here (`calib.log.txt`):

| Action shape                                         | Touch frames reaching UIKit | Span vs planned | Spacing p50 / p90 / max |
| ---------------------------------------------------- | --------------------------: | --------------- | ----------------------- |
| This lane's zigzag and Clear drag: 30 ms timed moves |                          41 | 667 / 720 ms    | 17 / 26 / 34 ms         |
| 8 ms pauses between moves (`pause8`)                 |                           4 | 16 / 1,600 ms   | burst                   |
| 8 ms timed moves (`move8`)                           |                           4 | 16 / 1,600 ms   | burst                   |

So 30 ms steps arrive at about 60 Hz across the whole contact, and only finer steps collapse into a
burst. Real fingers arrive at about 120 Hz. In the frozen control every blue stroke was measured:
34–44 frames over 666–684 ms (0.93× planned), spacing p50 17 ms. The failing try g7 got 44 frames
over 666 ms, max gap 17 ms, the best-paced stroke of the run. **The bug survives realistic pacing.**
Its tree was clean before that stroke (`g7-2-source.xml`) and held the stale `paper-texture` after
it (`g7-3-source.xml`): an update during that first contact pulled the view in, whatever the input
rate.

## Q3 Fix (spike)

| Item   | Value                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change | `PaperInputView` (native only) no longer passes React children to the legacy view. It renders `<View style>` holding a `pointerEvents="none"` fill view with the ink, page art and halos, then the native input as a childless fill sibling on top. The ref, `onLayout`, `testID` and accessibility label stay on the native input, so geometry and hit-testing are unchanged |
| Size   | 1 file, `src/drawing/PaperInputView.tsx`, +36 / −9. No native or config change                                                                                                                                                                                                                                                                                                |
| Checks | `tsc -p tsconfig.json` clean, Prettier and ESLint clean. 5 mounted tool tests fail, all structural: they look for the ink inside `[data-testid="drawing-paper"]` (`native-drawing-artwork` ×4, `native-paper-rotation-mounted` ×1). Their selectors need the sibling plane                                                                                                    |
| Build  | Release simulator app `$C/builds/sim/spike-rotation/Splotch.app`, derived data `$C/builds/ios-dd-sim-spike-rotation` (xcodebuild 2 min, under rig.lock)                                                                                                                                                                                                                       |

## Q4 Gate (spike build)

| Run                                              | Tries | Invisible ink | Paper input children (lldb)            | Other                                                                                                                                                          |
| ------------------------------------------------ | ----: | ------------: | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spike-rotation` 12.9", 6 P→L + 6 L→P, churn ×4  |    12 |             0 | 0 at launch, after every churn, at end | The first two rounds flipped the theme but missed the page (the drawer was collapsed on a new simulator). Rounds before tries 7 and 10 ran in full             |
| `spike-rotation-13` 13", 6 P→L + 6 L→P, churn ×4 |    12 |             0 | 0 throughout                           | Pre-stroke tree clean on every try                                                                                                                             |
| No rotation, 4 colors, both sizes                |     4 |             0 | —                                      | 140,604 / 140,621 changed pixels; palette selection works. A Farm page with a Pen stroke draws its outline over the ink, as before (`spike-page/page-ink.png`) |
| **Gate**                                         |    24 |         **0** |                                        | Pass. 0 of 12 needed                                                                                                                                           |

Same script on the frozen build (`campaign-ipad-12.9`, `gate-frozen-129/`): **1 of 12 invisible**
(g7), and the paper input's child list was wrong after every churn round (C1, C4, C7, C10). The
spike input never held a child at any check, so it has no list to drift.

## Price and risk

| Item                                | Estimate                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paper input fix, production quality | **About 1 day.** The spike diff; move the 5 tests' selectors to a sibling-plane `testID`; a mounted guard test that the native `SplotchPaperInput` element never receives children (negative control: the old adapter fails it); Galaxy check (same `PaperInputView.tsx`, Android `ReactViewManager`); a hand check on the physical iPad                                         |
| Same class elsewhere                | `KeyboardScope` (`src/platform/KeyboardScope.tsx:45,74`) wraps the whole drawing screen and every modal in another legacy view with React children (`SplotchShortcutKeyboard`). Not tested here. Childless legacy views (`GateKeyboard`, `BackdropBlur`) are safe. Audit and fix: **+0.5–1 day**, more if it must become a Fabric (codegen) component to keep hardware-key focus |
| Upstream                            | The interop bug is React Native's (0.88). Worth an upstream report, but the app-side rule "legacy views get no React children" removes the exposure                                                                                                                                                                                                                              |
| Real iPad                           | **Plausible.** Nothing depends on simulator rotation timing or burst input: the triggers are rotation, coloring-page changes and theme changes, and the default System appearance flips the theme when iPadOS switches to Dark. The rate on a device is unknown and history-dependent. Not checked on the physical iPad (no scripted touch, and another spike holds it)          |

**Owner case 6 needs a precondition.** Just after launch the defect did not show in 18 tries, so
rotating a fresh app proves little. Suggested wording for the orchestrator (this lane does not edit
the packet): "First open a coloring page, set Settings › Appearance to Dark and back, and clear the
page. Then rotate 3–4 times, clearing and drawing a short line after each rotation. Does every line
show up straight away, and does any colour swatch land on the paper?" Once UI Automation is enabled
on the iPad (case 1), the same churn-and-rotate sequence (`$C/spike-rotation/bin/gate.sh`) can be
adapted to the device, with Settings › Appearance in place of `simctl ui` and no `lldb` step.

## Defects

| Defect                                                                                                                                                                                                        | Arm | Severity                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------- |
| After a session's page and theme changes, the paper input's native child list drifts. Rotation then can cover new ink with a stale paper sheet, move a palette swatch onto the paper, or drop the touch halos | RN  | Major (fix priced at about 1 day, cause known) |
| The same legacy-interop exposure in `KeyboardScope`                                                                                                                                                           | RN  | Unverified risk                                |

## Could this flip the decision?

No. It is a real, user-facing iPad defect in RN, but its cause is known and the fix is one file plus
tests, about a day. It adds one rule to RN's upkeep: legacy native views must stay childless, or
become Fabric components.
