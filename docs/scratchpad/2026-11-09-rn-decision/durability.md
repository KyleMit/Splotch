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

## Results (phase 2, 2026-11-11 07:03–08:17 EST, the Galaxy)

106 tries (51 pre-registered per arm, arms alternating, plus 4 diagnostic Dx), under
`dev-galaxy.lock` in three batches. Every try followed the pre-registered plan; the deviations are
listed below the tables. "Landed" is when the app's pid disappeared, measured from the scripted
release on the device clock.

### The picture on the page: lost in every try, both arms

| Cell                                | Kill landed (s)                   | RN best    | Shipping best |
| ----------------------------------- | --------------------------------- | ---------- | ------------- |
| K1 HOME at 0.2 / 1 / 5 s, `am kill` | 2.59–2.64 / 3.37–3.43 / 7.38–7.42 | 9/9 lost   | 9/9 lost      |
| K2 force-stop mid-stroke            | 1.09–1.14 into the stroke         | 3/3 lost   | 3/3 lost      |
| K3 force-stop 0.2 / 1 / 5 s         | 0.32–0.39 / 1.12–1.33 / 5.12–5.16 | 9/9 lost   | 9/9 lost      |
| K4 force-stop during Save           | as below                          | 9/9 lost   | 9/9 lost      |
| **Corrupted** (any try, any cell)   |                                   | **0 / 54** | **0 / 52**    |

Lost means a blank page: the saturated-pixel share of the scribble box was 0.000 after every
relaunch, against 0.36–0.39 (RN) and 0.39–0.43 (shipping) on the no-kill controls. Every relaunch
was a cold start to a usable page with Pen and Purple. The median launch was 298 ms for RN and 382
ms for shipping. No second exit and no garbled page came back. Auto-Save on Delete stayed on through
15 kills per arm.

### The gallery copy during an export

| Cell                                       | Kill landed (s) | RN best kept     | Shipping best kept |
| ------------------------------------------ | --------------- | ---------------- | ------------------ |
| K4 Save, force-stop at 0.2 s               | 0.33–0.38       | 0/3              | 0/3                |
| K4 Save, 1 s                               | 1.13–1.31       | **0/3**          | 3/3                |
| K4 Save, 5 s                               | 5.13–5.23       | 3/3              | 3/3                |
| K5 auto-saving Clear, force-stop at 0.2 s  | 0.34–0.38       | 0/3 (gone)       | 0/3 (gone)         |
| K5 auto-saving Clear, 1 s                  | 1.13–1.20       | **0/3 (gone)**   | 3/3                |
| K5 auto-saving Clear, 5 s                  | 5.13–5.20       | 3/3              | 3/3                |
| K5b Clear, HOME at 0.2 s, `am kill` at 1 s | 1.28–1.50       | **0/3 (gone)**   | 3/3                |
| K5b same, `am kill` at 5 s                 | 5.41–5.54       | **2/3** (1 gone) | 3/3                |
| **Corrupted** (published file that fails)  |                 | **0 / 16 files** | **0 / 26 files**   |

"Gone" means the page had already been wiped and no copy reached the gallery. All 42 published files
decode at 1080×2016, and their ink is in the range of each arm's no-kill saves (RN 0.083–0.097,
shipping 0.087–0.107). The shell never saw a leftover `.pending-*` row (directory listing and
`includePending` query). Such rows are likely hidden from the shell, so this is not evidence that
none exist.

### Exposure window: release to the published gallery file (no kill)

| Path                                    | RN best, ms (n)                                  | Shipping best, ms (n)   | RN ÷ shipping |
| --------------------------------------- | ------------------------------------------------ | ----------------------- | ------------- |
| Save (W + K4 at 5 s)                    | 1,102–1,347, median 1,339 (6)                    | 677–788, median 757 (9) | 1.8×          |
| Auto-saving Clear (W + K5 at 1 and 5 s) | 1,253–1,302, median 1,275 (6)                    | 687–731, median 710 (9) | 1.8×          |
| Clear then HOME at 0.2 s (K5b + Dx)     | 2,032–2,138, median 2,044 (5) + 1 never by 5.4 s | 752–830, median 784 (7) | 2.6×          |

**Dx (diagnostic, added after K5b's missing RN save; not pre-registered).** Auto-saving Clear, then
HOME at 0.2 s, no kill, resume at 20 s. RN saved 3/3 in the background (2,044–2,138 ms) and shipping
1/1 (784 ms). So RN's departing export usually finishes in the background, ~0.8 s slower than in the
foreground. The 1 in 6 that had not landed 5.4 s after the Clear did not recur. Why it missed (a
stall, or a slow export) is unknown. If such a stall outlived the export's 10 s timeout
(`PNG_TIMEOUT_MS`), the picture would be lost without any kill; that was not tested.

### K6: shipping's WebView renderer

On this Android the renderer is a separate isolated process
(`com.google.android.webview: sandboxed_process0`). Measured while shipping best sat cached at
07:04, before any try:

| Process                  | `oom_score_adj` | PSS / RSS    |
| ------------------------ | --------------- | ------------ |
| shipping host            | 850             | 153 / 142 MB |
| shipping renderer        | **900**         | 94 / 91 MB   |
| RN best (single process) | 850             | 378 / 186 MB |

The PSS figures include swap. Two seconds after HOME, the host was at 700 and its renderer at 701.

Android's low-memory killer works down from the highest `oom_score_adj`, so a cached shipping app's
renderer is first in line, ahead of either host. A force-stop or `am kill` of the host took its
renderer down in the same instant: exit-info logs "isolated not needed" every time. Killing the
renderer alone could not be injected here: there is no root, and the Release is not debuggable. The
code says the outcome: no `onRenderProcessGone` listener is registered, so WebView kills the app,
and the page is lost exactly as in K1.

### Deviations from the plan

* **Gallery watcher.** The watcher stats the candidate file names for the surrounding seconds every
  ~5 ms instead of listing `Pictures/Splotch`, because a full listing of its ~1,600 files takes 0.59
  s. Each hit agreed with the MediaStore row's `date_added`.
* **Rig lock.** Not taken. The orchestrator directed it only where a plan needs host timing, and
  every offset here was timed on the device clock.
* **Kill latency.** The kills land after their nominal offsets: `force-stop` 0.12–0.33 s later, and
  `am kill` ~0.4 s after it is issued. The tables report when each kill landed.
* **Dx** was added as a second attempt at K5b's anomaly.
* **Not run:**
  * the optional iOS-simulator WebContent check;
  * the iPad (locked);
  * shipping's activity recreation on a font-size or theme change, which needs a system-setting
    change.
* **Lock gap.** Once, `dev-galaxy.lock` was re-taken 22 s after its release. It was released again
  and re-taken after 62 s.

### Findings and classes

| Finding                                                                                                                                                                                         | Arm      | Severity                                                 | Class                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The picture in progress is lost on every process death: 30/30 page tries per arm, from background, mid-stroke, after a stroke or during Save. Both apps' Back dialog says so                    | both     | major (shared)                                           | **fixable**, unbuilt in both (save the picture on background, restore at launch). Not a floor in either; RN keeps a stroke model, shipping a tiled raster. Unpriced |
| A kill during Save or an auto-saving Clear loses the gallery copy for longer in RN: kept 0/9 vs shipping 9/9 at a kill landing 1.1–1.5 s. Windows are 1.8× (foreground) and 2.6× (left at once) | RN       | minor (a kill must land within ~1.3–2.1 s of the export) | **unclear**: the export runs on the JS thread (`stall-ink.md`'s "export off the JS thread", 1.5–3 days, uncertain); no lane has validated a fix                     |
| 1 of 6 background auto-saves had not landed 5.4 s after the Clear                                                                                                                               | RN       | unclear (1/6, not repeated in 3)                         | **unclear** (bug or bones unknown)                                                                                                                                  |
| Renderer death is not handled; the renderer is first in line for the low-memory killer while cached. Android: the app dies; iPad: the page reloads blank (code)                                 | shipping | same outcome as row 1, one more way to reach it          | **fixable** (a renderer-gone handler plus row 1's persistence); not injectable here                                                                                 |
| `configChanges` lacks `fontScale`, `fontWeightAdjustment`, `assetsPaths`, `layoutDirection`: a font-size or theme change in the background recreates the page blank (code)                      | shipping | minor (rare trigger)                                     | **fixable** (manifest), not run                                                                                                                                     |
| Corruption: a broken gallery file, a failed relaunch, lost settings                                                                                                                             | neither  | n/a                                                      | 0/106 tries and 0/42 files                                                                                                                                          |

### Could this flip the decision?

No. Neither arm keeps the picture in progress through any kill; this is a shared, fixable product
gap, so by the tie rule it is not a differentiator. The one measured difference meets the
pre-registered line "RN loses the gallery copy at an offset where shipping keeps it in ≥ 2 of 3
tries": 0/9 vs 9/9 at 1 s. That rule says "toward shipping, weakly". It adds evidence to an item the
verdict already holds open (RN's export on the JS thread) rather than opening a new one. Shipping's
extra ways to lose the page (renderer death, recreation) lose no more than a kill does and are cheap
to close. The iPad was not run. Code predicts the same per-arm results there, plus shipping's
WebContent reload.

### State left behind

* **Best builds.** Both `art.splotch.app.dev.best` and `art.splotch.app.baseline.best`: page
  cleared, Pen, Purple, Auto-Save on Delete **off** (on 07:47–08:16; key frames
  `durability/look/{sh,rn}-saving-off-s.png`, `{sh,rn}-end-s.png`), AI off, Sound untouched,
  launcher in front.
* **Kills.** Each was force-stopped or killed 45 times. Neither was reinstalled, and no data was
  cleared.
* **Untouched:** the store app, `.dev`, `.dev.mem`, `.baseline.main`, `.dev.bestplain`, and both
  `.export` builds.
* **Gallery.** 43 new test pictures, MediaStore ids 1000001816–1000001858: 26 shipping, 17 RN. One
  of them is a setup save, made when shipping's control picture was cleared with Auto-Save on.
  Nothing was deleted.
* **Raw files.** No recordings were made. Per-try screenshots, logs and pulled gallery files are in
  `durability/runs/` (scratch).
