# Spike: pricing the Galaxy lane's four RN-only defects

2026-11-10 06:26 → 07:35 EST, Claude. Device: the Galaxy (S21 FE, Android 16). **Frozen** =
`art.splotch.app.dev`, the RN probe Release `427756f14` (APK sha256 `7e6af612…28bb`). **Spike** =
probe Releases of the local branch `claude/spike-rn-input-loss` (off `427756f14`, never pushed),
installed over `art.splotch.app.dev` (data kept: Auto-Save on Delete off, Pen, Size 3, checked by
screenshot) and replaced by the frozen probe at the end. Input, timing and scoring are the
`perf-galaxy-brushes` lane's: Android's `uinput` virtual touchscreen with on-device delays, its
`eraser-clear-<n>` and `first-*` scripts, `getevent` timestamps, and its row-ink, error-card and
video-witness scorers. Raw runs, logs and scripts: `spike-input-loss/` in the campaign scratch
folder (rig file).

Added for cause-finding: the probe's `SplotchPerf` cohort lines (one per contact group: packets the
paper received, strokes it admitted) and **dot trains**, 19 short taps on the paper at fixed delays
after an action, which time how long the paper stays deaf.

## Verdicts

| Defect                                              | Cause                                                                                                                                                                                                                                                                                                                                        | Spike fix and gate                                                                                                                                                                                                     | Estimate to land                                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Clear within ~1 s of an Eraser lift (Auto-Save off) | **Confirmed, and wider than reported.** Clear can't tell an erased page from a blank one until a pixel read-back answers, so it waits under the input lock; the lock lasted **3.0–3.8 s** after Clear. The error card is Clear's decode colliding with the idle scan's on one shared decoder                                                 | **PASS 10/10** (frozen 0/10 clean). Clear with nothing to keep no longer reads back; unread erased ink counts as showing. 2 lines                                                                                      | **~0.5–1 day** as built (8 pinned tests to re-point); **1–1.5 days** to keep shipping's "a blank page records no clear"                                |
| Stroke ~0.3 s after closing Settings draws nothing  | **Corrected and narrowed.** Not `paperBlocked`: the leaving dialog is a React Native `Modal`, its own native window, and it takes every touch until JavaScript commits its dismissal after the 200 ms fly-back. Shipping also refuses touches while its dialog leaves (until ~0.24 s); RN's refusal runs ~40–120 ms longer (to ~0.28–0.34 s) | **PASS 5/5** (frozen 0/5). Native dialogs leave at once on close (no fly-back). Window 300–340 ms → 100–140 ms, shorter than shipping's 220–260. 6 lines                                                               | **~0.5–1 day**: the validated instant exit (drops the close animation; 19 pinned tests) or taking the window down on time after the fly-back (unbuilt) |
| Slow Undo on a dense Crayon picture                 | Every Undo throws the ink layer away, allocates a new full-paper raster and **replays every op of every remaining stroke** on the JavaScript thread. The native ink has no undo snapshots or checkpoints                                                                                                                                     | Not built (code reading; the lane's timings stand)                                                                                                                                                                     | **2–3 days** (tile snapshots like shipping's history, within a memory budget); 1–1.5 days for coarse checkpoints at +8.7 MB each                       |
| Memory growth from drawing alone (dense Crayon)     | Each Crayon stroke allocates two full-paper surfaces (the glaze pass buffer and the pre-group copy, 8.7 MB each) and frees them when the stroke ends. react-native-skia's canvas pin keeps each until a Hermes GC: the guardrails spike's Undo-memory mechanism                                                                              | Not built. **Measured guardrails build 5** (one 10.7-min run): native heap bounded (119–133 MB vs 245–290), Crayon-phase growth halved (+171 vs +305–313 MB), but still **2.2× shipping** (+78), 4.4× over the session | Patch already in the guardrails' 1–2 days; **+1–2 days, uncertain**, to get under 2×                                                                   |

**Could this flip the decision?** Not toward RN. The two input-loss defects are cheap and local: two
and six lines, both gates passed, with a parity detail to settle in each (an extra Undo step on an
erased-blank page; the dialog close animation). The dialog one is also narrower than reported:
shipping refuses touches while a dialog leaves too, and RN's refusal only runs ~40–120 ms longer.
Slow Undo and drawing memory are design-level. Undo has no mechanism besides a full replay, and
drawing memory still grows 2.2× shipping after the known patch. Together the four add **~4–7.5
agent-days**, which takes RN's priced bill from ~5–8.5 to **~9–16 agent-days**, against shipping's
~1. The input-loss defects share one design trait: RN decides a contact's fate once, when it lands,
so anything still holding the paper (a JavaScript-thread read-back under the input lock, a native
window not yet taken down) silently eats strokes. The guardrails' post-Clear loss is the same
pattern. All of it is shared code, so the iPad very likely has it too (not run).

## 1. Clear right after an Eraser lift

The lane's `eraser-clear-<n>` scripts unchanged: two Pen strokes, Eraser across both, lift, Purple
(back to Pen), Clear released 0.5–1.0 s after the lift, a 300 ms stroke 0.1–1.0 s after Clear.

| Run                                    | Tries | Cleared | Stroke landed | Error card | Clean     |
| -------------------------------------- | ----- | ------- | ------------- | ---------- | --------- |
| Frozen, lane (plain build)             | 10    | 4       | 4             | 6          | **0/10**  |
| Frozen probe, cause check (tries 0, 4) | 2     | 1       | 0             | 1          | 0/2       |
| **Spike build 2**                      | 10    | 10      | 10            | 0          | **10/10** |

**How long the paper stays deaf (Clear released 896 ms after the lift):**

| Run           | Dots after Clear's release    | Dots landed | Probe: contacts reaching the paper / admitted |
| ------------- | ----------------------------- | ----------- | --------------------------------------------- |
| Frozen probe  | 19 dots, 60–1,500 ms          | **0/19**    | 19 / 0                                        |
| Frozen probe  | 19 dots, 100–2,980 ms         | **0/19**    | 19 / 0                                        |
| Frozen probe  | strokes at 2,002 and 3,814 ms | 1/2         | the 2.0 s stroke lost, the 3.8 s one drawn    |
| Spike build 2 | 19 dots, 60–1,500 ms          | **19/19**   | 19 / 19                                       |

**Cause, confirmed and widened.**

* Every lost contact reaches JavaScript (the probe logs its packets) and is refused at admission
  (`strokes: 0`): `paperInputOwner.start` marks a contact that starts while the paper is locked
  `ignored` for life. The lock is `clearCurrentPicture`'s waiting path (`src/useDrawingScreen.ts`):
  after an Eraser lift `knownEmpty` is `undefined` until the idle scan answers, so Clear takes
  `runCommand` (input lock, `busy`), reads the ink back (`captureInk`: GPU raster → PNG encode) and
  decodes it in pure-JavaScript inflate (`pngAlpha.ts`) before it clears. On the Galaxy that lock
  outlived Clear's release by **3.0–3.8 s** (the last lost dot at 2.98 s, a stroke at 3.81 s drawn),
  not the ~1 s the lane probed. The idle scan itself had not answered 0.9 s after the lift either;
  shipping's equivalent scan is a 4.5 ms synchronous read (`idleEmptyScan.ts`), which its Clear
  simply flushes.
* The error card: `inkCoverage.ts` builds one module-scope `createPngAlphaDecoder()` for both
  observers, and its `active` guard throws "A picture observation is still settling." when Clear's
  decode starts while the scan's (cancelled by Clear's lock, but not yet unwound) still runs. That
  contradicts `drawingScan.ts`'s comment that the scan has its own observer "so it never holds
  Clear's". A test pins the single decoder (`native-mounted-alpha.test.mjs`, "keeps an unmounted
  decoder owned until its real finally"), so the sharing looks deliberate.

**Spike fix** (`src/useDrawingScreen.ts`, 2 code lines): Clear with nothing to keep never waits.
When the scan hasn't answered, it clears at once and records the Clear as an Undo step, the rule
`useVisibleInk` already applies ("erased ink no scan has read counts as showing"). With Auto-Save
off Clear never decodes, so the decoder collision cannot happen on this path. Test: a mounted test
in `native-ink-scan-mounted.test.mjs` (Clear during an unanswered scan takes no capture, is not
busy, keeps the Undo step and admits the next contact); it fails on the frozen source.

**What it costs.** One parity point: an erased-to-blank page cleared before the scan answers (~1–3 s
on the Galaxy) now records an Undo step that restores a blank-looking page; shipping records none
("A blank page records no clear", `engine.ts`). Nine existing tests pin the read-back Clear. The
spike re-points one at `clear(true)`; the other eight fail by design (7 in
`native-mounted-alpha.test.mjs`, 1 in `native-ink-scan-mounted.test.mjs`). **Not fixed:** with
Auto-Save on, Clear still needs the pixels for the save, so it still waits under the lock and can
still hit the decoder collision. That is the guardrails spike's residual "Clear within ~0.4–1 s of
an Eraser lift" path, already in its ~1-day item.

## 2. Stroke right after closing Settings

The lane's `first-settings` script unchanged: gear, 1.5 s, × tapped, stroke A 300 ms after the ×
lifts, warm stroke B 1.5 s later. Dot trains: 19 dots every 40 ms from 60 ms after the release (the
× for Settings; a blue cell for More colors).

| Run                        | Stroke A at +300 ms | After closing Settings: last dot lost / first drawn | After a More colors pick: last lost / first drawn |
| -------------------------- | ------------------- | --------------------------------------------------- | ------------------------------------------------- |
| Shipping (2 + 2 runs)      | 5/5 (lane)          | 220 / 260 ms                                        | 220 / 260 ms                                      |
| Frozen RN (2 + 2 runs)     | **0/5** (lane), 0/1 | **300 / 340 ms**                                    | **260 / 300 ms**                                  |
| **Spike build 2** (2 runs) | **5/5**             | 100 / 140 ms                                        | not rerun (same `ModalStage` path)                |

Every train was identical across its runs. In RN the lost dots log **no packets at all**: they never
reach the paper.

**Both apps refuse touches while a dialog leaves; RN refuses ~40–120 ms longer.** Shipping's dialogs
are modal `<dialog>` elements that stay open through their 200 ms fly-back (`app.css`
`dialogFlyBack`: "the action awaits this animation"), so the canvas is inert until ~0.24 s after the
release. RN's frozen tests pin the same rule ("admits the first packet cohort immediately after the
Settings exit retires"). The RN-only defect is the tail: frozen RN stays deaf until ~0.30–0.34 s
after Settings closes and ~0.28 s after a colour pick. A stroke started in that extra 40–120 ms is
lost in RN only, which is exactly where the lane's 300 ms stroke fell. Narrower than "the first
stroke after Settings": a child has to start drawing within about a third of a second.

**Cause, corrected.** The lane pointed at `isProductModalBlocked(route.shown, …)` keeping the paper
`disabled`. A disabled paper still receives a contact's packets and refuses it at admission, which
the probe logs; these contacts never arrive. Every dialog is a `ModalStage`
(`ModalShellContent.tsx`), which renders a React Native `Modal` with `visible={presented}` and keeps
it presented through its 200 ms fly-back. It comes down only after JavaScript gets the native-driven
animation's end, sets state and commits. A `Modal` is its own native window (a `Dialog` on Android,
a presented view controller on iOS), so every touch until then goes to the leaving dialog, whose
backdrop no longer responds. `route.shown` clears in the same callback, so the paper block is real
but never the binding one. The extra ~100 ms is that JavaScript round trip, paid on a thread busy
re-rendering the screen the dialog closed over.

**Spike fix** (`ModalShellContent.tsx`, 6 code lines): on native, a dialog's exit skips the
animation and dismisses at once, so the window goes in the close's own commit. What remains is that
commit, ~100–140 ms, now shorter than shipping's window. Test: a native-renderer test in
`rsd-native-modal-frame.test.mjs` holds any exit animation and expects the dialog gone and its
dismissal reported on close; it fails on the frozen source.

**What it costs.** It overshoots parity. Every native dialog loses its close animation, which
shipping keeps, so this is a visual-parity regression. **19 native-renderer tests** pin the exit and
the order things happen when a dialog retires, and fail by design (4 in `rsd-native-modal-frame`, 9
in `rsd-native-modal-backdrop`, 4 in `rsd-native-chrome-behind-dialogs`, 2 in
`rsd-native-first-stroke`). The coloring-book picker also applies a chosen page only once it has
retired. The parity fix is narrower: keep the fly-back and take the window down on time, by not
waiting on the JavaScript round trip after the 200 ms ends (unbuilt). The same `ModalStage` serves
Settings, More colors, the coloring-book picker, the AI sheets, the parental gate and the Leave
card. iOS presents a `Modal` the same way, so the iPad very likely has the same tail (not run).

## 3. Slow Undo and drawing memory (estimate only)

### Slow Undo: a full replay per tap

`useUndoAction` only sets the history. The ink layer then sees strokes that no longer extend the
base it painted (`createInkScene().sync`, `src/drawing/skiaInkScene.ts`) and calls `rebuild()`: it
disposes the layer, allocates a new full-paper raster (`createInkLayer`, 8.7 MB on the Galaxy) and
paints `orderedOps(next.strokes)`, **every op of every remaining stroke**, synchronously on the
JavaScript thread. Nothing caps it: the native Skia layer keeps no undo snapshots or checkpoints
(`checkpoints.ts` serves the web renderer), so one Undo costs as much as drawing the whole picture
again, and grows with it. Crayon ops cost the most (glaze pass buffer, pre-group tile copies, band
shaders), hence 0.6–0.85 s per tap on ~40 s of dense Crayon in the lane, and the brush tap dropped 2
s after three Undos on the 5-minute picture: the thread is still replaying when the tap lands.
Shipping keeps a tiled undo history: snapshots of the tiles a stroke changed, capped at
`MAX_UNDO_DEPTH` and compacted into a base, so an Undo restores tiles instead of replaying.

This is design, not a slip: ADR-0178's native ink is "the same ops paint a rebuild", and a rebuild
is the only Undo there is. A fix is a new undo mechanism, and it must fit a memory budget that
already fails (section below):

| Option                                                                                                               | Estimate                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Tile snapshots per commit, as shipping does: restore changed tiles, cap depth, compact, carry the Crayon glaze state | **2–3 agent-days**, plus an iPad (Metal) check                                                   |
| Full-layer checkpoints every N strokes, replay from the nearest                                                      | 1–1.5 agent-days; each checkpoint is another 8.7 MB, against a memory guardrail RN already fails |

### Memory growth from drawing alone

**Cause (code).** Every Crayon stroke opens a glaze group, which allocates two full-paper CPU
surfaces in `skiaInkLayer.ts`: the pass buffer (`passBuffer()`) and the pre-group copy (`under`,
`keepPristine()`), 8.7 MB each. Each stroke's end trims both (`glaze.trim()` → `release()`), and the
next stroke allocates them again. Both are drawn through `getCanvas()`, whose canvas keeps a strong
reference to its surface and reports ~1 KB to Hermes. So `surface.dispose()` frees nothing until a
Hermes collection, and dense Crayon pins up to ~17 MB per stroke. This is the guardrails spike's
Undo-memory pin, reached by drawing alone. Pen never opens a glaze group, which is why the
guardrails' Pen sessions grew less.

**Measured: one 10.7-minute run of guardrails build 5** (`24928fead`, the react-native-skia patch
that stops `getCanvas()` pinning its surface, with its Undo disposals), installed as
`art.splotch.app.dev.spike` (fresh install, defaults: Size 3, Sound on 50%, Auto-Save off), the
lane's `memory` script with Undo moved to the fresh layout's button (`scripts/memory-fresh.jsonl`,
30 changed taps). TOTAL PSS MB (native heap MB):

| Sample                    | Shipping (lane) | Frozen RN run 1 (lane) | Frozen RN run 2 (lane) | **Guardrails build 5** |
| ------------------------- | --------------- | ---------------------- | ---------------------- | ---------------------- |
| Before                    | 274.8           | 264.2 (45)             | 267.7 (55)             | 264.5 (54)             |
| ~1 min                    | 327.1           | 369.4 (123)            | 361.9 (122)            | 351.7 (103)            |
| ~2 min                    | 347.1           | 513.8 (249)            | 551.3 (287)            | 395.2 (123)            |
| ~3 min                    | 349.8           | 522.8 (244)            | 545.9 (275)            | 425.0 (119)            |
| ~5 min                    | 352.7           | 577.1 (282)            | 572.8 (281)            | 435.2 (124)            |
| ~10 min                   | 366.3           | 557.4 (231)            | 558.5 (223)            | 492.1 (133)            |
| After the last Undos      | 341.9           | 538.1 (193)            | 752.6 (406)            | 561.0 (203)            |
| **Crayon phase, 0–5 min** | **+77.9**       | +312.9                 | +305.1                 | **+170.7**             |
| **End − start**           | **+67.0**       | +258.1                 | +478.1                 | **+296.3**             |

* **The patch bounds the native heap but doesn't close the guardrail.** Build 5's native heap levels
  off at 119–133 MB through drawing, against the frozen build's 245–290 MB, and the Crayon phase
  grows about half as much. It still grows **2.2× shipping** in that phase and **4.4×** over the
  session (limit 2×).
* What still grows is "Unknown" (+90 MB, 16 → 106), graphics (+33 MB) and a native step at the last
  Undo burst (+70 MB). None is attributed here. The guardrails spike saw the same "Unknown" rise and
  suspected the Hermes heap; it would take a heap snapshot to know.
* As in both frozen runs, the switch to Magic didn't take (the end picture is all Crayon), so all
  three RN runs drew Crayon for ten minutes. Build 5 is a probe build and the lane's frozen runs
  were plain; one run.

| Item                                   | Estimate                                                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The canvas-pin patch                   | Already in the guardrails' Undo-memory item (1–2 days); this run shows it also halves drawing growth                                                                                                      |
| Bring drawing growth under 2× shipping | **+1–2 agent-days, uncertain**: attribute "Unknown" with a heap snapshot, keep the two glaze buffers across strokes instead of reallocating 17 MB per stroke, bound the GPU cache. It may still not close |

## 4. Spike build

Branch `claude/spike-rn-input-loss` off `427756f14`, local only, worktree
`.claude/worktrees/spike-rn-input-loss`. Probe Releases, arm64, debug key, application ID
`art.splotch.app.dev` (installed over the frozen probe, data kept).

| Build | Commit      | APK sha256      | Adds                                                                                              |
| ----- | ----------- | --------------- | ------------------------------------------------------------------------------------------------- |
| 1     | `6c34b6f7a` | `96f4cae0…3610` | Both fixes plus one decoder per observer (built, never installed; the decoder change was dropped) |
| **2** | `1e5049c8f` | `04644646…4dc6` | The two fixes and their tests: every device result above                                          |

Diff from `427756f14`: source 2 files **+12/−2** (4 of the added lines are comments); tests 2 files
+42/−1. The two new tests pass on the spike and fail on the frozen source
(`logs/negative-control-{clear,modal}.log.txt`). Full tiers (`logs/checks.log.txt`): `npm run check`
passes. `test:tools` passes 8,221 of 8,230; the 9 failures are the 8 Clear-contract tests above plus
the GHSA-evidence test, which also fails on the untouched frozen tree (guardrails spike).
`test:migration:rsd-selection` passes 1,026 of 1,045; the 19 failures are the dialog-exit tests in
section 2. ESLint flags one thing: the new dialog test pushes `rsd-native-modal-frame.test.mjs` to
508 lines (limit 500), so landing it needs its own file.

**No regression on the lane's no-load checks** (probe build, so compare with the frozen probe):

| Kind                                     | Spike build 2: Δ first ink, ms | Longest hold in A, ms | Frozen probe (same script): Δ, ms | Lane, frozen plain build: Δ median (range) |
| ---------------------------------------- | ------------------------------ | --------------------- | --------------------------------- | ------------------------------------------ |
| Cold launch (+3.5 s)                     | 46                             | 19                    | —                                 | 47 (31–64)                                 |
| Clear released, +300 ms (Pen, no eraser) | 57, 47, 40                     | 18, 25, 42            | 48, 32, 37 (holds 19–43)          | 30 (15–45)                                 |

The spike reads ~10 ms later on the post-Clear check (median 47 vs 37, three each, ranges
overlapping), within noise for three samples. A Pen-only Clear has a known verdict, so it never
reaches the changed lines. Probe builds read ~10 ms above the lane's plain build. No hold exceeds 43
ms.

## Rows for `provisional.md` "Known repair work"

| Arm | Item                                                                          | Estimate                                                                                       |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| RN  | Clear right after an Eraser lift                                              | ~0.5–1 day (validated 10/10), or 1–1.5 days keeping shipping's "a blank page records no clear" |
| RN  | Stroke right after closing a dialog (RN deaf ~40–120 ms longer than shipping) | ~0.5–1 day (validated 5/5 by dropping the native close animation; on-time dismissal unbuilt)   |
| RN  | Slow Undo on a dense picture                                                  | 2–3 days (a new undo mechanism; unvalidated)                                                   |
| RN  | Memory growth from drawing alone                                              | Guardrails' patch measured: halves it, still 2.2× shipping. +1–2 days beyond it, uncertain     |
| RN  | **Added by this lane**                                                        | **~4–7.5 agent-days**; RN's priced total **~9–16** (was ~5–8.5)                                |

## State left behind

* Galaxy, RN: `art.splotch.app.dev` = frozen RN probe again (installed 07:10, on-device sha256
  `7e6af612…28bb`, equal to `builds/rn-probe/app-release.apk`), page cleared, Pen, Size 3, Purple,
  Auto-Save off (never changed). `art.splotch.app.dev.spike` (guardrails build 5) was installed at
  06:54 for the memory run and **uninstalled** at 07:10.
* Galaxy, shipping: `art.splotch.app.baseline.main` ran four functional dot trains at 07:29–07:31
  (Settings close, More colors pick). Purple re-selected after each pick, page cleared, Pen and Size
  3 checked by screenshot. The store app was never touched.
* Builds: `builds/rn-spike-input-loss-1/` (`96f4cae0…3610`) and `-2/` (`04644646…4dc6`) in the
  campaign scratch folder. Worktree `.claude/worktrees/spike-rn-input-loss` and its local branch:
  add to campaign-end cleanup (keep the branch until the decision lands).
