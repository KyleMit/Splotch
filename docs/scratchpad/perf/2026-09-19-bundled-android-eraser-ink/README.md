# Bundled Android capture: the eraser erases verified ink (2026-09-19)

This is the evidence for the eraser repair to `npm run perf:android:bundled:frames`
(`tools/perf/android/capture-bundled-frames.mjs`). The defect was found as a follow-up in
[issue 2065's device validation](https://github.com/KyleMit/Splotch/issues/2065#issuecomment-5732834005).
The bundled CLI never filled ink for the eraser, so an eraser cell erased blank paper while its
artifact said `gesturePlan: "fixed-geometry-refilled"`.

This package proves the workload is valid. It makes no performance claim. A slow valid sample would
not be a validity failure, and nothing here compares timings.

## Outcome

* **Reproduced on main.** Run `b0` requested the eraser for 2 passes. The app relaunches on blank
  paper, because ink does not survive the CLI's force-stop. The artifact recorded
  `fixed-geometry-refilled` with no `eraserFill` or `eraserRefills` field. A readback after the run,
  in the session terminal (not packaged), found 0 inked samples.
* **Fixed.** An eraser capture now works like this:
  * **Setup.** After the eraser is committed, it applies the shared verified fill
    (`tools/perf/lib/eraser-fill.mjs`). It re-checks the fill without painting after a 500 ms
    settle.
  * **Before each pass,** a point census on a 64x64 lattice over every live tile backing must be
    fully opaque. Smoothing is off, so every sample is one backing pixel. Hidden tiles are sampled
    too, because their DOM rect is empty but their backing is what the eraser works on.
  * **After each pass,** at least 85% of the planned strokes must have reached the page, and every
    delivered stroke must have lifted, with no cancel. The census must show at least 0.5% of samples
    erased (alpha below 128), with no tile backing resized and no tile left with no ink.
  * **Between passes,** the verified refill runs, then two idle rAFs before the next contact.
  * **Failure** refuses the capture: no artifact is written.
* **The artifact records the workload.** It holds `eraserFill`; `eraserRefills` (repeats − 1
  entries, in the shape `anomalousEraserRefills` and `eraserRefillShortfall` check); `eraserPasses`
  (each pass's census before and after, its planned strokes, its lifts, and each readback's
  page-time interval); `eraserWidthSetting` (the stored level, where null is the product default);
  and, for every adb capture, `strokes: { planned, delivered }`.
* **Hand captures.** `--input=hand` with `--brush=eraser` is refused, because a hand capture has no
  pass boundaries to refill between.

## Identities

| Item               | Value                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installed product  | perf debug APK of main a8ff7916ea9395ed50534e9da9b22d489e256e86, sha256 `e5e2d0ed217fe8b76ae434c5a1e42e285ce785801bb5f05a56fed6fe14e35320`, verified on the device before the session. No product source changed between it and the harness bases below |
| Harness, before    | main 20d26b9ca86f37e3936959743c0bf83d0b5d6cbe (run `b0`)                                                                                                                                                                                                |
| Harness, fix       | branch `claude/bundled-eraser-verified-ink` on main bd2f0e00c590beef80a0c9efbb9196704806735c, which already carries the orientation repair (PR 2083). The PR records the merged SHA                                                                     |
| Device and runtime | Samsung SM-G990U1, Android 16, Android System WebView 151.0.7922.199, DPR 3. Live tiles are 20 backings of 180x268 or 180x269 in portrait                                                                                                               |
| Cadence            | panel `renderFrameRate 120`, with no refresh pins set                                                                                                                                                                                                   |
| Workload           | the fixed trusted-gesture plan (10 authored strokes, which become 16 `input swipe` calls per pass); eraser at the product default size (`eraserWidthSetting: null`); light theme. Repeats: 2, or the campaign's 10 for the full cell                    |

## Controls

| Run           | Request                                                           | Result                                                                                                                           | Artifact |
| ------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `b0`          | eraser, 2 passes, main before the fix                             | **Blank-paper eraser reproduced.** The artifact says `fixed-geometry-refilled` with no fill or refill evidence                   | written  |
| `b1-attempt1` | eraser, 2 passes, fix requiring all 16 strokes                    | Refused: only 14 of 16 strokes reached the page (see the delivery gap below)                                                     | none     |
| `b1`          | eraser PORTRAIT, 2 passes                                         | Both passes were fully inked before and erased 6,537 and 6,555 of 81,920 samples (8.0%). 1 healthy refill                        | written  |
| `b2`          | eraser PORTRAIT, the full 10-pass cell                            | All 10 passes were fully inked before and erased 6,515–6,549 samples each. 9 healthy refills at `afterStroke` 10–90              | written  |
| `b3`          | eraser LANDSCAPE, 2 passes                                        | The app lock was released (PR 2083). Observed 780x360; erased 8,678 and 8,682 samples (10.6%); 32 of 32 strokes delivered        | written  |
| `b4`          | pen PORTRAIT, 1 pass                                              | An ordinary ink-brush capture works. It has no eraser fields and a `fixed-geometry` plan, and records 14 of 16 strokes delivered | written  |
| `b5`          | eraser PORTRAIT, 2 passes, final code with the 85% delivery floor | 14/16 strokes per pass, accepted; erased 6,505 and 6,539 samples                                                                 | written  |
| `nb1`         | eraser, the fill skipped (diagnostic)                             | **Blank preparation refused:** `before pass 1, the paper is not fully inked … tile 0 0/4096 opaque …`                            | none     |
| `nb2`         | eraser, the refill paints nothing (diagnostic)                    | **Failed refill refused:** `the eraser refill after pass 1 failed … "transparentTiles":[4,10,11,14,15]`                          | none     |
| `nb3`         | eraser, the pass drawn with the pen (diagnostic)                  | **A stroke removing no ink refused:** `pass 1 erased 0 of 81920 census samples, under the 0.5% floor`                            | none     |

Every positive also passed trusted-input fidelity and the drawing gate. Its cleanup steps all
succeeded, and the rig read back `accelerometer_rotation=1`/`user_rotation=0` with the app lock on,
portrait. The three `diag/*.diagnostic-only.diff` files are the negative-control patches. Each was
applied, run once, and reverted with `git checkout`. **They must never be applied to production
source.**

The first `b1`–`b3` runs used the same logic but did not yet record readback intervals. They were
re-run to give the timing proof below, and the originals are not packaged. Their erased counts
matched these runs pass for pass to within 0.7% (`b1` pass 2: 6,509 against 6,555).

## Outside the scored window

The drawing gate scores in-contact frames. `check.mjs` proves from each positive artifact that:

* no census or refill interval overlaps any trusted canvas stroke, from pointerdown to pointerup by
  pointer id (28, 140, and 32 strokes);
* no frame the probe marked in contact falls inside a readback.

The settling is deliberate:

* the initial fill settles 500 ms and is re-verified before the probe installs;
* after a pass, the census waits until every delivered stroke has its pointerup and the counts hold
  for one 100 ms poll;
* after the last readback, two rAFs pass before the next swipe.

**Measured timings.** Across `b1`–`b3`:

* a readback took a median of about 43 ms, and at most 159 ms;
* the last lift preceded a readback by at least 309 ms;
* the next stroke followed a readback by at least 103 ms.

The readbacks still land in the phase's between-stroke frames, so whole-phase pacing includes them.
The in-contact figures do not.

## Portrait delivery gap (recorded, not fixed)

On this phone in portrait, two of the plan's 16 swipes per pass deliver **no pointer events** to the
page. These are segment 3 of each long stroke, and each starts at physical (540, 1008–1018), the
screen centre.

* The effect is deterministic, and it predates this repair. The pen capture `b4` shows it, as did
  `b0` on main (28 of 32).
* `diag/swipe-delivery-1.log.txt` isolates it. The same swipes deliver nothing when started at that
  point, but deliver normally when started 20 px to the side or run in reverse.
* Landscape never starts a swipe there and delivers 16 of 16.
* An accessibility navigation-bar overlay service is installed on the phone, but its windows are
  zero-width. The cause is unexplained.

The capture therefore **records** delivery (`strokes`, and each pass's `lifts`) and requires 85% of
each pass's planned strokes (`MIN_DELIVERED_STROKE_SHARE`), not all 16. Requiring all 16 failed
`b1-attempt1`, and it would make every portrait eraser cell uncapturable while pen cells with the
same gap passed. With no floor at all, which was the first review round's finding, a pass that
delivered 1 of 16 strokes but erased enough ink would have been accepted. The floor tolerates
exactly the evidenced 14 of 16 and refuses a third lost stroke. Run `b5` is the final code on the
device: 14 of 16 strokes per pass, accepted.

## Previously affected evidence

* **Proven missing refill.** Issue 2065's local validation eraser artifacts `01`, `02`, `03`, `08`,
  `14` (the full 10-repeat cell), `15`, and `17` record `fixed-geometry-refilled` with no
  `eraserFill`/`eraserRefills`. They sit under
  `perf-profiles/bundled/issue-2065-evidence-2026-09-18/artifacts/` in the primary checkout, local
  and never committed.
  * They measured erasing on blank paper.
  * Their brush-selection conclusion (the eraser was committed) stands.
  * They are not eraser performance evidence, and none was used as such.
* **Committed artifacts are not affected.** No committed bundled artifact is an eraser cell.
* **The committed matrix is not affected.** Its Android-native eraser cells come from the split
  transport, which has its own verified refill (`requestPageEraserRefill`), not from this CLI.

## Limitations

* **The readers' historical tolerance still admits a pre-fix bundled eraser artifact.** An artifact
  that records `fixed-geometry-refilled` with no `eraserRefills` field passes
  `anomalousEraserRefills`/`eraserRefillShortfall`, which return null for an absent field under the
  standing historical-tolerance decision in `docs/PROFILING-CAMPAIGNS.md`. The pre-fix bundled
  eraser artifacts above look exactly like that. None is committed or banked. The PR thread drafts a
  follow-up.
* **Other eraser sizes.** The census floor (0.5% erased per pass) was set from geometry. The
  smallest eraser level is a quarter of the default width, so it should clear about 2%. It was
  validated on the device only at the default size (about 8% portrait, 10.6% landscape).
* **Only one physical phone was tested.**

## Reproduce

`node docs/scratchpad/perf/2026-09-19-bundled-android-eraser-ink/check.mjs` verifies each file
against `MANIFEST.json` and re-derives every claim above from the packaged bytes. It uses the
capture's own floor constant and the campaign readers' refill validators. `package.mjs` rebuilt this
directory from the session's local capture directory.

On a device with a debug perf build installed, run:

```bash
npm run perf:android:bundled:frames -- --device-serial=<serial> --brush=eraser --orientation=PORTRAIT --gesture-repeats=2
npm run perf:android:bundled:frames -- --device-serial=<serial> --brush=eraser --orientation=PORTRAIT
npm run perf:android:bundled:frames -- --device-serial=<serial> --brush=pen --orientation=PORTRAIT --gesture-repeats=1
```

The negative controls apply one `diag/*.diagnostic-only.diff` each, run the first command, then
revert. `diag/swipe-delivery.mjs` and `diag/read-ink.mjs` ran from
`perf-profiles/bundled/units-2026-09-19/diag/`, and their relative imports expect that location.

## Effort

Cumulative active effort on this failure (the bundled eraser erasing blank paper) is about 25 min
through this package (2026-09-19, about 09:50 to 10:15 EDT, part of it overlapping the orientation
unit's CI wait). That includes about 10 min on the portrait delivery gap. It excludes intake shared
with the orientation unit, which is counted there. Issue 2065 found the defect as a side
observation, and no earlier effort was tracked separately. The review and merge time is recorded on
the PR.
