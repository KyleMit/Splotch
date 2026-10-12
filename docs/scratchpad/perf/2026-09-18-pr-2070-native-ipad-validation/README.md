# PR 2070: native iPad validation of the undo-ghost settle

Evidence for the native-app half of [PR 2070](https://github.com/KyleMit/Splotch/pull/2070), which
belongs to [issue 1750](https://github.com/KyleMit/Splotch/issues/1750). PR 2070 made the crayon and
magic undo ghost read one pixel back on iOS, before the undo restore writes the tiles it has just
read. The PR measured this in iPad Safari only. Its drafted leftover item 3 asked for a check in the
installed native app, whose WKWebView uses the native glaze-direct crayon pipeline. Those
measurements are here. The conclusion was posted on
[PR 2070](https://github.com/KyleMit/Splotch/pull/2070#issuecomment-5737623208) and
[issue 1750](https://github.com/KyleMit/Splotch/issues/1750#issuecomment-5737625438). This directory
makes it reproducible without the capture machine.

The companion Safari evidence is
[`../2026-09-18-issue-1750-ipad-baseline/`](../2026-09-18-issue-1750-ipad-baseline/README.md). Its
`analyze.mjs` scores the initial series here, unchanged.

## Result

**For the undo path, the native validation is satisfied.** The settle is neutral to beneficial under
the repository's undo gates. It has one disclosed cost: the frame containing the undo call is
sometimes a beat longer, because the settle's readback is paid synchronously. This is not a claim
that every criterion passed. Two exceptions are recorded below, and one of them is unresolved.

The confirmation series was pre-registered. It ran four blocks (C, T, T, C). Each block started with
a forced reinstall, then one unscored warmup, then two scored runs, for 4 scored runs per arm. Each
undo was scored on its own window, from its call to the next undo's call. Source:
[`results/confirmation-scored.txt`](results/confirmation-scored.txt).

| Per scored run                             | Control (7a2365631aba) | Treatment (33a4d43b6ef8) |
| ------------------------------------------ | ---------------------- | ------------------------ |
| Undos with a frame over 33.5 ms (of 20)    | 0, 1, 1, 0             | 0, 0, 0, 0               |
| Worst undo frame                           | 36 ms                  | 29 ms                    |
| Frames after the undo call, P95            | 26, 33, 26, 29 ms      | 18, 22, 19, 21 ms        |
| Median frame containing the undo call      | 17 ms in every run     | 17, 27, 17, 25 ms        |
| `engine.undo` P95 / max                    | 2 / 3–4 ms             | 9–12 / 12–15 ms          |
| Action to next frame (ADR-0086), P95 / max | 12–16 / 12–16 ms       | 13–16 / 14–22 ms         |

* **ADR-0086 gates on the treatment.** `engine.undo` P95 is at most 12 ms against a 20 ms limit.
  Action to next frame P95 is at most 16 ms against 33, and its max is 22 ms against 50.
* **The residual cost.** In 2 of 4 treatment runs, the frame containing the undo call slips one 60
  Hz beat: the median goes from 17 to 25–27 ms. That stays under every gate, and the frames after
  the call get shorter. It is disclosed here, not waived.
* **Correctness and memory were identical in every run of every series**
  ([`results/pixels-magic-correctness.txt`](results/pixels-magic-correctness.txt)):
  * all 20 undos ran, each with its own `engine.undo` measure and a visible ghost;
  * the history went from 20 retained snapshots to 0;
  * no ghost element was left after the tail;
  * the ink left after undo was 1,116,310 px for crayon;
  * raster, base-raster, and live-backing bytes were the same.
* **Pixels.** In the separate pixel-check runs (C, T, T, C), all four runs began undo from the same
  tile hash. Every pair matched on all 20 ghost hashes and all 20 tile states. That covers control
  against control and control against treatment.
* **Magic brush.** One pixel-check run per arm, as a structural check only. Both showed 20 of 20
  ghosts, history 20 → 0, identical coverage (1,390,596 px), and no leftover ghost element. Magic
  draws its gradient at random (`Math.random` in `magicBrush.ts`), so the starting tiles differ and
  pixel identity cannot be tested across runs.

### Exceptions, stated as they are

* **Unresolved: one 61 ms fold total.** The initial criterion 4 says fold totals must not rise
  beyond control's run-to-run spread. In the confirmation series, control's fold totals were 31, 34,
  36, and 41 ms, and treatment's were 41, 61, 37, and 35 ms. The pre-registered two-run exception
  rule covers draw, settle, tail, and commit, not fold totals. So the 61 ms run is an exception to
  the criterion as written, not a pass.
  * Across every run in both series, folds were 31–41 ms on control and 33–41 ms on treatment, apart
    from this one run.
  * Every fold finishes before the first undo, and the settle runs only inside undo, so the change
    is not a plausible cause. That is reasoning, not a measurement.
  * **Next discriminating experiment:** more pre-undo repeats of both arms, to see whether a 61 ms
    fold occurs on control too.
* **The initial series did not meet criterion 4 as written.** Across its treatment runs there was a
  48 ms draw frame (run 01), a 21 ms tail frame, and a 5 ms commit max (run 04). Control's maxima
  were 22 ms, 17 ms, and 2 ms. The confirmation series was designed after this to control for the
  cold first launch after install. Its two-run rule is not applied retroactively.
  [`results/initial-rescored.txt`](results/initial-rescored.txt) prints that rule's `ok` for the
  initial series only because the same scorer is reused.

## What was compared

* **Product.** The control is 7a2365631aba6078f94038235d661add6e2e42cb, PR 2070's parent. The
  treatment is 33a4d43b6ef8b43ca77c5d77578630220c37a4d9, the merge. They differ in product code only
  by `web/src/lib/drawing/inkMotion.ts` and its test.
* **Harness.** The shared libraries (`tools/perf/lib/undo-driver.mjs`, `webkit-inspector.mjs`, and
  `profile-device-session.mjs`) came from 33a4d43b6ef8, as recorded in every artifact's
  `harness.worktreeHead`.
* **Builds.** Each arm was built in a clean detached worktree with `npm run perf:build:cap` (the
  `PERF_MARKS` and dev-harness seams), then with a Debug `xcodebuild` into its own derived-data
  path. Both were installed with `devicectl` over the same bundle id. See
  [`build-provenance.json`](build-provenance.json) for the method and per-arm facts. Neither bundle
  sets `server.url` or adds `NSAppTransportSecurity`. The page loaded from `capacitor://localhost`.
  The settle readback (`getImageData(0,0,1,1)`) appears only in the treatment's chunks.

  | Arm       | Entry chunk         | App-tree digest  | `public/` digest |
  | --------- | ------------------- | ---------------- | ---------------- |
  | Control   | `start.C4bxo72t.js` | 75a0786335cbb65f | e5f697863b46335e |
  | Treatment | `start.Coc95Aql.js` | 9a1bbfcc6d49da90 | a3e5f263422d61ec |

  Every run reads the entry chunk its page actually loaded and fails on a mismatch. The confirmation
  artifacts also carry both digests in `appDigest`.
* **Runtime.** A 12.9-inch iPad Pro on iPadOS 26.5, running the app's WKWebView. Its user agent is
  the desktop-class Mac one, with `maxTouchPoints` 5, so `isIosDevice()` is true and the settle
  runs. The device was in landscape, at 1366×1004 and DPR 2. rAF ran at **60 Hz** (a median interval
  of 17 ms), where iPad Safari runs at 120 Hz. The crayon pipeline was the build's own glaze-direct.
* **Workload** ([`native-session-payload.js`](native-session-payload.js)). This is #2070's paced
  session, ported to the app, which has no `/dev/engine` and no `window.__engine`:
  * select the brush through the real Brushes menu and verify it with `__committedBrushMode`;
  * draw 30 crayon scribbles with #2070's geometry, as touch `PointerEvent`s dispatched to
    `#drawingCanvas` at 2 moves per frame, 300 ms apart;
  * wait for history folding to settle, then 4 s more;
  * run 20 undos through the repo's shared `undoActionFunctionSource`, 700 ms apart measured from
    each call's start;
  * run a 4 s tail.

  One continuous rAF sampler covers the whole session, with one stamp kept on each side. The host
  only installs, launches (a fresh app process per run), injects, and polls over the WebKit
  Inspector ([`native-run-session.mjs`](native-run-session.mjs)).
* **Order and attempts.** [`ledger.json`](ledger.json) lists every attempt, whether each was scored,
  and whether an install came just before it.
  * Smoke: one control run. It is kept, and never scored.
  * Initial series: T, C, C (failed), T, T, C, C, T, then a replacement C. Run 03 lost its inspector
    target during polling and wrote no artifact.
  * Pixel checks: C, T, T, C.
  * Magic checks: C, T.
  * Confirmation series: four blocks of warmup, s1, and s2. The warmups are archived and excluded
    from scoring.

## Scoring, and how review corrected it

* **Initial series, as first scored.** [`results/initial-analyze.txt`](results/initial-analyze.txt)
  is the Safari analyzer, unchanged. It scores complete rAF intervals, and its undo window runs from
  one call to 700 ms later.
  * Undos over the gate: 6/80 on control against 1/80 on treatment, per run 2, 0, 2, 2 against 1, 0,
    0, 0.
  * The worst frame was 42 ms in both arms. The treatment's 42 ms interval contains its own 23 ms
    synchronous undo, so only the size is pre-existing, not the mechanism.
* **Rival round 1** ([`review/rival-round1.md`](review/rival-round1.md)) found three problems:
  * **Overlapping windows.** The analyzer's windows overlap the next undo's action frame at 145 of
    152 boundaries. The over-gate counts are unaffected, but a ">25 ms" comparison drawn from the
    draft was contaminated. It is withdrawn.
  * **Statistics that assume independence.** Twenty undos in one run are not independent trials. The
    pooled Fisher tests in the draft are withdrawn; the run is the replicated unit.
  * **Unrecorded criterion-4 exceptions** in the initial series, listed above.

  The response was [`score-confirm.py`](score-confirm.py), with non-overlapping windows running from
  one undo call to the next, and the pre-registered confirmation series. Its amendment is in
  [`ACCEPTANCE.md`](ACCEPTANCE.md), which states when each section applied.
* **Rival round 2** ([`review/rival-round2.md`](review/rival-round2.md)) rescored the confirmation
  artifacts from the raw stamps and matched every figure. It also:
  * corrected which initial treatment run held which exception;
  * ruled that the 61 ms fold could not be passed under a rule that never covered fold totals.

  It also doubted that the second treatment block reinstalled the app. `ledger.json` shows an
  install before each block's warmup.

[`review/draft-conclusion-reviewed.md`](review/draft-conclusion-reviewed.md) is the superseded draft
both rounds reviewed. It is kept as the review record, not as a result.

## Limits

* **Drawing input is synthetic.** Untrusted `PointerEvent`s build an identical history; this is not
  a touch-fidelity result.
* **Undo is dispatched in the page.** It uses ADR-0086's shared screen-harness method, not a trusted
  native tap.
* **Presentation is a proxy.** "Action to next frame" is measured to the next rAF callback, not to
  display presentation.
* **Scope.** A Debug native shell, one device, one orientation, and 8 scored runs per arm across
  both series.

## Reproduce

No device is needed. From this directory:

```sh
./reproduce.sh
```

It does four things:

1. Checks every archive against [`SHA256SUMS`](SHA256SUMS).
2. Decompresses `raw/` into a temporary directory.
3. Reruns the pinned analyzer, `../2026-09-18-issue-1750-ipad-baseline/analyze.mjs`,
   [`score-confirm.py`](score-confirm.py), and [`verify-pixels.py`](verify-pixels.py).
4. Diffs the output against [`results/`](results/) and prints `OK` when every summary reproduces.

The analyzer's last change is 1a51eb7d57256eb096da6a3e716471125bfbb80b, the same revision the
captures were scored with. It needs node and python3.

`raw/<series>/<label>.json.gz` holds each run as the runner wrote it, compressed with `gzip -n`.
Each file contains every rAF stamp, every `engine.*` measure, each undo row (with pixel hashes for
pixel-check runs), the history and work counters, and the entry chunk.

To capture again on a device:

1. Build each arm as in `build-provenance.json`, into `$BUILDS_DIR/dd-control` and
   `$BUILDS_DIR/dd-treatment`.
2. Set `IOS_UDID` and `BUILDS_DIR`.
3. From this directory, run [`run-series.sh`](run-series.sh) or [`run-confirm.sh`](run-confirm.sh).
   These need `ios_webkit_debug_proxy`, and the Debug build's WKWebView must be inspectable.

`docs/PROFILING-IPAD.md` ("Scripted in-page capture of the bundled app") documents that route.

## Changes from the scripts as run

Four edits were made after capture. None changes a captured value:

* `native-run-session.mjs` now attaches the inspector to `IOS_UDID` and verifies it. As run, it took
  the relay's first device; only the one iPad was attached, so the captures are unaffected.
* `native-run-session.mjs` and the two series scripts now take the device, the build directory, and
  the harness checkout from the environment. They previously held local paths.
* `score-confirm.py` prints its correctness tuple sorted, so the output is deterministic.
* `verify-pixels.py` and `reproduce.sh` were written for this package. They perform the pixel and
  correctness comparisons that were run inline during the session.

## Preservation gaps

* **The initial and pixel series artifacts predate the `appDigest` field.** Their build identity
  rests on the entry chunk each page loaded, which is unique to each arm, and on the digests above.
* **The failed run 03 left no artifact.** What remains is its console failure in `ledger.json`.
* **The build logs and signed bundles are not published.** Signed material is private.
  `build-provenance.json` records the configuration and the bundle facts that matter.
