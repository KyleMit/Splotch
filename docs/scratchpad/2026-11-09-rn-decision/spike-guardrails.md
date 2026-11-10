# Spike: RN's two guardrail breaches (post-Clear stroke loss, Undo memory)

2026-11-10 02:08 → 04:12 EST, Claude. Device: the Galaxy (S21 FE, Android 16). **Frozen** =
`art.splotch.app.dev`, the installed RN probe Release `427756f14` (its Auto-Save on Delete was off,
was turned on for one run and back off). **Spike** = `art.splotch.app.dev.spike`, probe Releases of
the local branch `claude/spike-rn-guardrails` (never pushed), installed beside it and uninstalled at
the end. Raw evidence is in the campaign scratch folder under `spike-guardrails/` (`bin/`, `raw/`,
`logs/`).

Method: input through my own Appium 3.6 + UiAutomator2 server, one W3C action sequence per trial, so
Clear's release → pause → stroke is timed **on the device**. (`adb shell input` starts a process per
command, which adds 100–300 ms, so the journeys lane's 0.6 s was really ~0.8 s or more.) Memory
comes from `dumpsys meminfo`, what JavaScript received from the probe's `SplotchPerf` cohort lines,
and ink and saved-picture checks from ImageMagick.

## Verdicts

| Breach                 | Cause                                                                                                                                                                                                                                                                                        | Gate                                                                                                                                                     | Cost to land properly                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Post-Clear stroke loss | **Confirmed: dropped at input, never recorded.** With Auto-Save on, Clear exports the kept picture *before* clearing, under an input lock and `busy`, for ~1 s; a contact whose first packet lands then is `ignored` for life                                                                | **PASS** (spike): 12/12 at 0.1–0.6 s, saved pictures correct. But ink still appears 0.5–0.9 s late, because the export's PNG work blocks the JS thread   | ~1 agent-day for no loss; **+1.5–3 days** to remove the late-ink stall (export off the JS thread)      |
| Undo memory growth     | **Bounded on the frozen build, at ~2× shipping:** Skia's GPU cache fills with one texture per Undo ghost, then caps (PSS plateau 624–706 MB). Also: **react-native-skia's canvas pins its surface** (no `dispose()`, reports 1 KB), so each Undo's 8.7 MB layer raster waits for a Hermes GC | Growth **FAIL** (spike +128 MB against ≤ +72); plateau **PASS**: spike bounded at **412–427 MB** over 15 more cycles (frozen ~650, shipping ends at 314) | **1–2 agent-days** incl. a 1-line react-native-skia patch; GPU cache bound for Crayon/Magic still open |

**Could this flip the decision?** Neither breach is a structural blocker: both have a cause and a
working fix measured on the device. But neither fix is free, and each adds risk (a react-native-skia
C++ patch; a ~1 s JS stall that is still there with Auto-Save on). Pricing RN's repairs
symmetrically against shipping's, this adds roughly **3–6 agent-days** of RN-only work before RN
matches shipping on these two axes. It strengthens "keep shipping" and does not make RN better for
users.

## 1. Post-Clear stroke loss

| Delay after Clear's release (on-device) | 50  | 100 | 200 | 300 | 400 | 500 | 600 | 800 | 1000 | 1500 ms |
| --------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- | ---- | ------- |
| Frozen, Auto-Save **on**: inked         |     | 0/2 |     | 0/2 |     |     | 0/2 | 0/2 | 1/2  | 2/2     |
| Frozen, Auto-Save **off**: inked        | 2/2 | 2/2 | 2/2 |     |     |     |     |     |      |         |
| Spike build 1, Auto-Save on             |     | 0/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 |     |      |         |
| **Spike build 4**, Auto-Save on         | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 |     |      |         |

**Cause.** The lost strokes' packets reach JavaScript (14 packets, 20–26 samples each) but the probe
logs `strokes: 0`, `appended: 0` and no hand-off (`logs/perf_frozen_postclear.log.txt`):

1. With Auto-Save on, `clearCurrentPicture` (`src/useDrawingScreen.ts`) runs inside `runCommand`.
   That takes `surface.lockInput()` and sets `busy`, which `NativePaper` passes as the paper's
   `disabled`. It holds both until the kept picture is exported, and only then clears.
2. The export (`exportPng` → `useSurfacePackets.capture` → `PictureCapture`) also holds
   `captureLock`. It reads the ink layer, renders and captures the outline SVG, lazy-loads
   `composePicture`, and encodes PNGs: about 1 s on the Galaxy.
3. Meanwhile `paperInputOwner.start` marks any new contact `ignored` for its whole life.

Shipping (`web/src/lib/drawing/saveOnDelete.ts`) snapshots synchronously, wipes at once, and encodes
off the main thread with `toBlob`.

**Spike fix (build 4).** Clear with known ink, the usual case, now finishes in one tick and takes no
command, lock or `busy`. It freezes the departing ink as a copy-on-write layer snapshot
(`scene.freeze`, `departingPlan`), clears, and exports the kept picture in its own `PictureCapture`
slot that holds nothing the paper waits on. Each departure is its own capture, so a second Clear
cannot cancel the first save. If the paper hasn't drawn the ink yet (a stroke this Clear just
finished), Clear falls back to the old waiting path. Build 1 still lost the 100 ms strokes, because
`runCommand`'s `busy` outlived the lock by one late render; that is why the command was removed.

**Gate result:**

* **12/12 strokes started 0.1–0.6 s after Clear land** (gate 10/10), plus 2/2 at 50 ms; the probe
  logs `strokes: 1` for each.
* **All 14 auto-saves are correct.** They are 1080×2016 like the frozen build's, hold the stroke
  drawn before the Clear (row ink 1.0) and never the stroke after (0.0). Paper and grain away from
  the strokes are pixel-identical to a frozen auto-save (AE 0) (`raw/saved_spike4.json`). Build 5
  repeated 14/14 and 14/14 correct.
* **Residual: late ink.** The export's PNG work (an ink encode, an SVG capture, two decodes, a cubic
  compose and the final encode) still blocks the JS thread for ~0.9 s after Clear. Strokes started
  200–600 ms after it show their first dot after **470–910 ms**; at 50–100 ms a dot appears within
  87–214 ms and then **stalls ~0.8 s mid-stroke**. With Auto-Save off, the first dot after a Clear
  takes 45–70 ms.
* **Residual: two rare paths still wait under the lock** and lose a stroke as before. One is a
  finger still drawing as Clear lands. The other is Clear within ~0.4–1 s of an Eraser lift, before
  the idle scan knows whether the page is blank; this one applies **with Auto-Save off too**
  (pre-existing, not tested on the device).

## 2. Undo memory

**Frozen build, 30 cycles of 20 strokes + 20 Undos in one session** (`raw/plateau_frozen.json`,
`raw/more_frozen.json`):

| After cycle    | start | 1   | 5   | 10  | 15  | 18  | 20  | 25  | 30  | +20 s idle |
| -------------- | ----- | --- | --- | --- | --- | --- | --- | --- | --- | ---------- |
| PSS MB         | 277   | 311 | 417 | 487 | 591 | 636 | 650 | 628 | 651 | 640        |
| GL mtrack MB   | 34    | 38  | 99  | 174 | 248 | 303 | 319 | 319 | 319 | 319        |
| Native heap MB | 56    | 73  | 108 | 95  | 120 | 110 | 113 | 91  | 112 | 111        |

GL rises only in Undo phases (~0.75 MB per Undo, about one ghost) and caps from cycle 19. Each Undo
ghost is a new CPU image of a new size, drawn by a `SkiaPictureView`, so Skia uploads a new texture.
react-native-skia 2.14 never purges its GPU cache (no `purgeUnlockedResources` or
`performDeferredCleanup` in its sources), so freed textures stay until Skia's budget is full (256 MB
by default, per Skia upstream). Over 15 Clears of 4 strokes each, frozen PSS also rose 264 → 400 MB,
with GL moving between 42 and 71 MB (`raw/clearburst_frozen.json`).

**The J25 session script** (`bin/session.py`: 200 strokes at one per 3 s with colour changes, 20
Undos, 3 × (20 strokes + 20 Undos), 20 s idle; J25's seeds, coordinates and pacing; Pen at the
largest width; Sound on):

| Run (build)                                                | Start PSS | After 200 strokes | After 20 Undos | End   | Growth   | Of which after the strokes | Native after 20 Undos | GL at end |
| ---------------------------------------------------------- | --------- | ----------------- | -------------- | ----- | -------- | -------------------------- | --------------------- | --------- |
| Shipping, J25 (app + WebView renderer)                     | 277.8     | 297.0             | 300.5          | 314   | **+36**  | +17                        | —                     | —         |
| Frozen RN, J25 (plain build)                               | 274.6     | 310.5             | 382.9          | 413   | +138     | +102.5                     | 135                   | —         |
| Frozen RN probe, today                                     | 261.3     | 325.3             | 384.2          | 435.3 | +174     | +110                       | 141                   | 81        |
| Spike build 1 (`cf1c24fac`, width 24 px)                   | 272.8     | 334.8             | 436.7          | 436.3 | +163.5   | +101.5                     | 175                   | 14        |
| Spike build 4 (`d1cf98ad5`)                                | 278.8     | 322.1             | 445.7          | 469.8 | +191     | +148                       | 207                   | 14        |
| **Spike build 5** (`24928fead`, react-native-skia patched) | 259.8     | 327.4             | 350.1          | 387.6 | **+128** | **+60**                    | 101                   | 14        |

Today's runs measure "before" on blank paper, so they include a +25 MB EGL step when the ink view's
surface appears with the first stroke. That makes the draw phase read +64–68 MB on both RN builds
(J25 RN: +36). The gate (≤ 2× shipping = +72 MB) **fails on build 5 even allowing for that step**
(~+103), though the Undo share fell from +110 to +60.

What holds the memory:

* **GPU textures (frozen):** the ghost textures above. In the spike, Pen ghosts are recorded as
  vector pictures, so no texture is uploaded: GL is flat at 14 MB.
* **Native heap (both): the Undo's layer rebuild, through a react-native-skia pin.** From a fresh
  launch, 60 strokes and then 20 Undos added **+126 MB native with the ghost and +131 MB with the
  app's Reduce Motion on (no ghost, no snapshots)**, about 8.7 MB per Undo: exactly one 1080×2016
  RGBA buffer, the ink layer's raster (`raw/undoab_*.json`). `JsiSkSurface::getCanvas()` hands out a
  canvas that keeps a strong reference to its surface (for Graphite readback). That canvas has **no
  `dispose()`** and reports **1 KB** to Hermes. The ink layer caches its canvas, so each rebuild's
  `surface.dispose()` frees nothing until a collection Hermes has no reason to run.
* **It is garbage, not a leak.** After build 4's session, backgrounding the app and sending
  `TRIM_MEMORY_BACKGROUND` (React Native answers it with a full Hermes GC) dropped native **Heap
  Alloc from 247 to 62 MB**, and PSS on resume was 292.7 MB, +14 over the session start
  (`raw/gcprobe_spike4.json`). (`RUNNING_CRITICAL` is refused for a foreground app on Android 16.)
* **The one-line patch** (keep the surface only under Graphite) cut 20 Undos from +126 to **+27 MB
  native PSS (+10 MB allocated)** with the ghost, and to +13 MB without it.
* Disposing the big Undo snapshots *without* the patch made native memory **worse** (builds 1 and
  4), plausibly because it removed the external-memory pressure that used to prompt collections.

**Bounded on build 5.** Continuing the same session for cycles 4–18 (`raw/more_spike5.json`):

| After cycle    | 4   | 6   | 8   | 10  | 12  | 14  | 16  | 18  | +20 s idle |
| -------------- | --- | --- | --- | --- | --- | --- | --- | --- | ---------- |
| PSS MB         | 419 | 412 | 420 | 415 | 422 | 425 | 422 | 427 | 417        |
| Native heap MB | 113 | 113 | 115 | 115 | 117 | 121 | 118 | 120 | 120        |
| GL mtrack MB   | 14  | 14  | 14  | 14  | 14  | 14  | 14  | 14  | 14         |
| Unknown MB     | 86  | 79  | 84  | 80  | 82  | 81  | 82  | 84  | 84         |

PSS holds at 412–427 MB: about 1.35× shipping's session end (314 MB), against the frozen build's
624–706 MB plateau. A forced GC afterwards returned native Heap Alloc 98 → 70 MB, and PSS was 345 MB
on resume (`raw/gcprobe_spike5.json`). What survives a GC is mostly "Unknown", +67 MB over the
session start and not attributed here. It is likely the Hermes heap holding the 200-stroke drawing
and its Undo history, which would need a heap snapshot to confirm.

## 3. Spike builds

Branch `claude/spike-rn-guardrails` off `427756f14`, local only. Probe Releases, arm64, debug key.
`npm run check` passes, and so do `test:migration:rsd-selection` (1045/1045) and `test:tools`
(8231/8233). The two tool failures are the GHSA-evidence test, which fails on the untouched frozen
tree too, and `native-app.test.mjs`, which the spike-only `.dev.spike` suffix trips by design. Each
new guard was run against the code it replaces and fails there (`logs/negative-control-*.log.txt`).

| Build | Commit      | Adds                                                                                                                                                                                                      |
| ----- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `cf1c24fac` | Frozen-ink departing export; Undo snapshot and ghost-handle disposal; vector Pen ghosts (`f8f9851b4`) + spike-only application ID suffix                                                                  |
| 2     | `aaf9fe8dc` | Clear with known ink takes no command (not run on the device separately)                                                                                                                                  |
| 4     | `d1cf98ad5` | `07fc15980`: fall back to the waiting Clear when the ink isn't drawn yet (caught by `native-stroke-chrome-mounted.test.mjs`); old-contract tests updated. `d1cf98ad5`: dispose each op's path and builder |
| 5     | `24928fead` | `pnpm patch` of react-native-skia 2.14.0: `getCanvas()` keeps the surface only under Graphite                                                                                                             |

Diff from `427756f14` (spike-only suffix excluded): post-Clear, 7 source files ≈ +210/−70 (about a
third is lint-driven extraction); memory, 5 source files ≈ +125/−45 plus the react-native-skia patch
(one changed line); tests, +172/−36 across 8 files.

## 4. Cost to land, and risks

| Fix                             | To production quality                                                                                                                                                                                                                                                                                                    | Estimate                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Post-Clear: no lost strokes     | iPad and web checks (the web plan is pure stroke data; iOS composes ink inside the SVG); a test of two quick auto-saving Clears; reporting a save lost to unmount mid-export; the two rare locked paths                                                                                                                  | **~1 agent-day**                |
| Post-Clear: no ~0.9 s ink stall | Take the PNG work off the JS thread: hand the frozen `SkImage` straight to `composePicture`, skip the outline capture on blank pages, and move compose + encode to a background worklet runtime or native code (no Skia-on-background-runtime precedent in the app)                                                      | **1.5–3 agent-days**, uncertain |
| Undo memory                     | Audit every `getCanvas()` call site for use after its surface goes; confirm on the iPad (Metal); bound Skia's GPU cache for Crayon/Magic ghosts, which still upload a texture per Undo (`setResourceCacheLimit` or an idle purge in the same patch); report the canvas pin upstream; owner-eye check of the vector ghost | **1–2 agent-days**              |

Risks the fixes add:

* **Post-Clear:** each pending kept picture holds a frozen full-layer snapshot (~8.7 MB) until its
  export ends. Unmounting mid-export loses that save (it is reported). The two rare paths keep the
  old ~1 s lock.
* **Memory:** a C++ patch to a native dependency (ADR-0119 review). Without the canvas's reference,
  a use of a canvas after its surface is gone becomes a native crash. A GPU-rasterised vector ghost
  may anti-alias slightly differently from the CPU layer while it lifts away. The snapshot disposals
  must land with the patch, not ahead of it.
