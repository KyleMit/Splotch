# Durability: does the picture survive when the OS kills the app?

2026-11-11, Claude (lane durability). Codex round 3's second unchecked flip risk: a parent switches
apps, the OS reclaims memory, the app is gone. Does the drawing come back, and what happens to a
picture that was mid-export? Arms, best versions: RN `art.splotch.app.dev.best` (`claude/best-rn` @
`e703b8b79a08`) and shipping `art.splotch.app.baseline.best` (`claude/best-shipping` @
`f9d3b6ff67d5`). Device: the Galaxy (the iPad is passcode-locked). Raw media and tools:
`durability/` in the campaign scratch folder (rig file).

## Phase 1: what the code does (no device)

Neither best version touches persistence: their commits on top of the frozen candidates are drawing,
memory, Undo, dialog, sound and layout fixes.

| Question                              | RN best                                                                                                                                                                                                                                                                                      | Shipping best                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is the in-progress picture persisted? | **No.** Ink lives in the JS `Drawing` model and Skia surfaces. The AppState listener (`src/product/useDrawingProduct.ts`) closes sheets and interrupts contacts on background; it saves nothing. The app's own Back dialog says "It is lost if Splotch closes" (`src/product/systemBack.ts`) | **No.** Ink lives in the tiled canvas. ADR-0168: "The drawing route … does not persist ink." `visibilitychange`/`resume` only resync layout. Same Back dialog copy (`LeaveConfirm.svelte`)                                                                                                                                       |
| What is persisted                     | Settings and brush choice (expo-file-system, `*.pending` → rename, two revisions); pictures whose save *failed* (`splotch-unsaved-pictures-v1`)                                                                                                                                              | Settings (localStorage mirrored to Capacitor Preferences); pictures whose save failed (IndexedDB `splotch-unsaved-pictures`)                                                                                                                                                                                                     |
| Relaunch after process death          | `MainActivity.onCreate` passes `null` to `super.onCreate`: a fresh React tree, blank page                                                                                                                                                                                                    | `BridgeActivity` restores only plugin call state; the WebView loads the app fresh, blank page                                                                                                                                                                                                                                    |
| Separate processes that can die alone | none (one app process)                                                                                                                                                                                                                                                                       | **WebView renderer** (Android: a sandboxed WebView process; iPad: WebContent). Android: no `onRenderProcessGone` listener is registered, so Capacitor 8.5.2's `BridgeWebViewClient` returns false and WebView kills the app. iOS: Capacitor calls `bridge.reset()` and `webView.reload()`: the app lives, the page reloads blank |
| Activity recreation without a kill    | `configChanges` also lists `fontScale`, `fontWeightAdjustment`, `layoutDirection`, `assetsPaths`; the React tree would not survive a recreation either, but these changes do not cause one                                                                                                   | `configChanges` lacks those four: a font-size, bold-text or theme-overlay change while Splotch is in the background recreates the activity and a new WebView, so the page is blank on return (predicted; not run, needs a system-setting change)                                                                                 |
| Save (camera button)                  | `useSavePicture`: `exportPng` on the JS thread (~1.1 s on a dense picture, `stall-ink.md`), base64 to a cache file, native `SplotchPhotoLibrary` writes MediaStore with `IS_PENDING` 1 → 0                                                                                                   | export via the tiled snapshot and PNG worker, base64 slices over the bridge (256 K each), `PhotoLibraryPlugin.saveImage` writes MediaStore with `IS_PENDING` 1 → 0                                                                                                                                                               |
| Auto-saving Clear                     | the page wipes at once; `keepDepartingPicture` exports and saves after (JS thread)                                                                                                                                                                                                           | the snapshot is taken, the page wipes at once, encode and save follow (`saveOnDelete.ts`)                                                                                                                                                                                                                                        |
| A kill mid-save                       | an unpublished `.pending-*` MediaStore row can remain (hidden; MediaProvider expires it); the staged cache file stays in the app cache                                                                                                                                                       | an unpublished `.pending-*` row can remain; the slices are in memory only                                                                                                                                                                                                                                                        |

So the in-progress picture is lost on any process death in **both** arms, by design. What can
differ: (a) how long a Save or auto-saving Clear leaves the picture with no durable copy (after an
auto-saving Clear the page is already wiped, so a kill there loses it entirely); (b) shipping's
extra ways to lose the page without the app process dying (renderer death on the iPad, recreation on
Android settings changes); (c) corruption, which neither arm should show (MediaStore pending rows,
RN's rename-committed settings, WebView's LevelDB storage). Already on record: shipping's one ANR in
69 auto-saving Clears killed the app and lost the drawing and its save (`stall-ink.md`).

## Pre-registered plan (written 2026-11-11 ~04:30 EST, before any device run)

**Input and kills.** The stall lane's on-device `uinput` driver (`mt.py`), never `adb shell input`
for strokes. Kills run from an on-device shell on the uinput script's clock (the `resume.sh`
pattern), so each offset is measured from the scripted release. Without root the shell cannot signal
an app's process, so:

* **low-memory kill** = HOME, then `am kill <pkg>` (kills only a background process, as the
  low-memory killer would);
* **hard kill** (stand-in for `kill -9`; also a swipe-away) = `cmd activity force-stop <pkg>`, which
  SIGKILLs the app's processes, the WebView renderer included.

The kill's landing time is when the app's pid disappears (polled on the device). Relaunch: the
launcher intent, 3 s, screenshot.

**Picture.** Clear, four 2 s Crayon scribbles in the top third (the stall lane's `dense()`), then a
Pen line on a lower row (the "last stroke"). Same seed for both arms per try.

| Code | Scenario                                       | Kill                                                                                                                                                                | Offsets (from)             |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| K1   | Background, then low-memory kill               | HOME at the offset, `am kill` 2 s after HOME                                                                                                                        | 0.2 / 1 / 5 s (last lift)  |
| K2   | Hard kill mid-stroke                           | force-stop 1.0 s into a 2 s Crayon stroke                                                                                                                           | one offset                 |
| K3   | Hard kill just after a stroke, foreground      | force-stop                                                                                                                                                          | 0.2 / 1 / 5 s (last lift)  |
| K4   | Hard kill during Save                          | force-stop                                                                                                                                                          | 0.2 / 1 / 5 s (Save tap)   |
| K5   | Hard kill during an auto-saving Clear          | force-stop (Auto-Save on Delete on)                                                                                                                                 | 0.2 / 1 / 5 s (Clear drag) |
| K5b  | Auto-saving Clear, HOME, then low-memory kill  | HOME 0.2 s after the Clear, `am kill` at the offset                                                                                                                 | 1 / 5 s (Clear drag)       |
| W    | Control: Save and auto-saving Clear, no kill   | none; an on-device poller lists `Pictures/Splotch`                                                                                                                  | n/a                        |
| K6   | Shipping only: the WebView renderer dies alone | not injectable on this rig (no root, non-debuggable Release); check the process layout instead: renderer pid, `oom_score_adj` and PSS against the host while cached | n/a                        |

3 tries per cell and offset, arms alternating. W gives each arm's **exposure window**: release →
`.pending-*` file → published file, 3 Saves and 3 Clears per arm. The rig lock is held for W, K4, K5
and K5b (their outcome depends on export timing); `dev-galaxy.lock` for every batch.

**Scoring.**

| Outcome         | Page (relaunch screenshot, ink pixels in the paper vs the arm's no-kill reference)                      | Gallery (K4, K5, K5b: new published row owned by the app)                            |
| --------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **kept**        | ≥ 95% of the reference ink                                                                              | the file decodes, same size as the arm's control save, ink within ±5% of the control |
| **partly lost** | 5–95%                                                                                                   | decodes with ink missing                                                             |
| **lost**        | < 5% (blank page)                                                                                       | no new published row (a leftover `.pending-*` file is listed separately)             |
| **corrupted**   | no usable page within 10 s of relaunch, a second crash, garbled ink, or the brush/colour setting broken | a published row that fails to decode, is truncated or blank                          |

**Predictions from the code** (page / gallery):

| Cell        | RN best                                                                | Shipping best                                                 |
| ----------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| K1, K2, K3  | lost at every offset                                                   | lost at every offset                                          |
| K4 0.2 s    | page lost / gallery lost (still exporting on JS)                       | page lost / gallery lost (still encoding)                     |
| K4 1 s      | page lost / **gallery lost** (export ~1.1 s before the write)          | page lost / gallery kept or lost (window ~0.6–1 s, uncertain) |
| K4 5 s      | page lost / gallery kept                                               | page lost / gallery kept                                      |
| K5 (all)    | as K4 for the gallery; the page is wiped by design                     | as K4                                                         |
| K5b 1 / 5 s | lost / kept (the export finishes in the background before the freezer) | kept or lost / kept                                           |
| W           | window ~1.3–1.8 s                                                      | window ~0.6–1.0 s                                             |
| Corrupted   | none                                                                   | none                                                          |

**What would change the decision** (RN must be clearly better; a tie goes to shipping):

| Finding                                                                                                                                  | Effect                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Both arms lose the in-progress picture on every kill (predicted)                                                                         | **no change**: a shared product gap, fixable in both (unbuilt picture persistence), not a floor                                  |
| Shipping loses a page or gallery copy in a cell RN keeps, from a WebView-owned cause (renderer death, a recreation) with no cheap remedy | toward RN: a shipping floor candidate                                                                                            |
| RN's exposure window is ≥ 2× shipping's, or RN loses the gallery copy at an offset where shipping keeps it in ≥ 2 of 3 tries             | toward shipping, weakly: more evidence for the unclear item "export off the JS thread"; a fixable defect while that move is open |
| Corruption in one arm only (a broken gallery file, an app that will not relaunch, settings lost)                                         | **major** for that arm; a floor only if platform storage (WebView or the RN file system) is the cause, not app code              |

Not run here: the iPad (locked). Code predicts the same per-arm results there, plus shipping's
WebContent process dying alone in the background, which reloads the page blank while the app lives.
If an iOS simulator and its WDA are free, one optional check kills the simulator's WebContent
process (`kill -9` on the host) in shipping and the app process in RN.

## Results

Phase 2 not yet run (the Galaxy is held by the export-soak lane until ~07:30).
