# Issue 1700 — what the post-crayon-burst stall is, and whether it still happens

Runner-side attribution for issue 1700. No physical device was available for this pass (the iPad's
XCTest automation grant had expired and the phone was locked), so the issue's "shown not to occur on
the physical iPad" half is **not** answered here.

## Question

[`2026-09-06-issue-1578-history-settle.md`](2026-09-06-issue-1578-history-settle.md) found one
uninterruptible browser task of 4,601–9,673 ms right after the `crayon-scribbles` synchronous burst
on `macos-latest`. It had no `engine.*` measure and one rAF stamp in the window. The runs came from
2026-09-06, on Playwright WebKit 26.5, before PR 1733. The note bounded the stall to WebKit itself
and named a layer flush or collection as candidates. It did not name the task.

## Finding 1 — the stall has not recurred since 2026-09-11

Every push-to-main `Tests` run whose `webkit-undo-fast-diagnostics` or
`webkit-undo-fast-retry-diagnostics` artifact still existed on 2026-09-18 was read. That was 197
`crayon-scribbles` samples from 2026-09-11T02:29Z to 2026-09-18T01:43Z, all on Playwright WebKit
26.6 and all on product trees after PR 1733. The rows are in
[`2026-09-18-issue-1700-runner-survey.json`](2026-09-18-issue-1700-runner-survey.json).
`firstPollAtMs` is the interval the 2026-09-06 note measured: from the end of the synchronous draw
evaluate to the first settle poll's return.

| Runner mode                                     | Samples | `firstPollAtMs` max | `engine.crayonShadow` max |
| ----------------------------------------------- | ------: | ------------------: | ------------------------: |
| Draw-charged (crayon commit P95 ≤ 500 ms)       |     191 |              723 ms |                    113 ms |
| Commit-charged (crayon commit P95 2.2–4.9 s)    |       6 |                3 ms |                      1 ms |
| 2026-09-06 runs this issue quotes (WebKit 26.5) |       5 |      4,601–9,673 ms |            2,070–3,263 ms |

The median `firstPollAtMs` over the 197 samples is 188 ms. No sample reproduces the stall in either
mode that the issue's latest comment distinguishes.

**What this does not establish.** The 2026-09-06 artifacts had expired before this survey. The
retained window also contains no WebKit 26.5 or pre-PR-1733 run. So the survey cannot say whether
the WebKit 26.5 → 26.6 bump (e2709af5a3443a2dd5ffba029a00b8c7bf47b593) or a product change made the
stall disappear. The issue 1751 bisect (PR 1771) found the same browser-build dependence for the
commit gate. That is consistent with a browser-build explanation, but it is not a bisect of this
stall.

## Finding 2 — where the deferred canvas cost is paid, named by native samples

`sample(1)` was run in 3-second windows against the WebKit web-content and GPU processes while the
unchanged fast gate ran. The sampler script appears below. Counts are lower bounds: each figure is
the heaviest single call-tree line that contains the frame, so it does not sum the separate paths
that reach the same frame.

### Runner, draw-charged mode

This was a diagnostic dispatch,
[run 35298666234](https://github.com/KyleMit/Splotch/actions/runs/35298666234). Its product tree was
main at 50a1f046a33cead04fc6e91d8aa64aeaf775c92e. Its workflow file was replaced on the throwaway
branch `diag/1700-runner-native-sample` (5ce4ba2953f5bef2e394686f2fc8b715eb3d8dd1). The host
reported `Apple M1 (Virtual)`, 3 CPUs, 7 GiB, and no display device. `crayon-scribbles` ran in the
draw-charged mode: 115,545 ms of `engine.draw`, commit P95 54 ms, the first post-burst poll at 316
ms, and `engine.crayonShadow` 12 ms. Its confirmation pass read 59 ms, with drains of 41 ms and 13
ms. The table covers the 70 samples taken inside the crayon draw window.

| WebContent main thread                                                   | Samples |
| ------------------------------------------------------------------------ | ------: |
| All                                                                      |  64,982 |
| Inside a page `drawImage` call                                           |  48,819 |
| … `ShareableBitmap::createFromImagePixels` (copying the source's pixels) |  30,638 |
| … `IOSurfaceClientLock` inside that copy                                 |  24,403 |

The heaviest path is:

```text
CanvasRenderingContext2DBase::drawImage(CanvasBase&, …)
  RemoteGraphicsContextProxy::drawNativeImage
    RemoteResourceCacheProxy::recordNativeImageUse
      ShareableBitmap::createFromImagePixels
        CGDataProviderCopyData → CA::CG::AccelDataProvider::get_byte_pointer
          CA::CG::IOSurfaceDataProvider::copy_data → IOSurfaceClientLock → iokit_user_client_trap
```

On this host, a canvas-to-canvas `drawImage` hands the source canvas to the GPU process as a native
image. Doing that copies the source's IOSurface pixels. The IOSurface lock does not return until
accelerated CoreGraphics has rendered the source's queued drawing. The deferred raster is therefore
paid inside each product `drawImage` during the burst, which is what "draw-charged" means.

### Local Mac, commit-charged mode

This was the same unchanged scenario on a developer Mac: Apple M5, Playwright WebKit 26.6 (r2359),
and the product tree at 50a1f046a33cead04fc6e91d8aa64aeaf775c92e. The command was
`node tools/perf/web/run-undo-scenarios.mjs --engine=webkit --no-throttle --no-build --scenarios=crayon-scribbles`
against a `PERF_MARKS` build. Crayon commit P95 was 710 ms (max 764 ms). The first post-burst poll
read 1 ms, and `engine.crayonShadow` was 0 ms.

| Process / thread                                                         | Samples |
| ------------------------------------------------------------------------ | ------: |
| WebContent main thread, all                                              |  23,352 |
| … in `drawImage` → `RemoteImageBufferProxy::ensureBackend` (IPC wait)    |  12,263 |
| GPU process `RemoteRenderingBackend work queue`, all                     |  22,864 |
| … `WebCore::IOSurface::createImage` → `CA::CG::Queue::flush` (semaphore) |  16,356 |

The web-content main thread waits for `Messages::RemoteImageBufferProxy::DidCreateBackend`. The GPU
process's serial rendering queue is meanwhile creating images from IOSurfaces. Each image creation
first flushes accelerated CoreGraphics's deferred queue (`CA::CG::IOSurfaceDrawable::copy_cgimage` →
`CA::CG::Queue::flush`) and waits for it. The page's copy waits for the GPU process to reach it in
that queue. In this mode, the undo crop at commit is the first copy after a stroke, as the 1717
investigation found through API probes.

### What this names, and what it does not

In both modes, the named task is **WebKit waiting for accelerated CoreGraphics to finish rendering
deferred canvas drawing before it can copy a canvas's pixels**. Only the process where the wait
happens and the first operation that forces the wait differ. A post-burst stall with no JS on the
stack fits the same mechanism. In that case, deferred drawing would still be queued when the draw
evaluate returns, and the first rendering update to need the canvas pixels would pay for it. That
explanation fits the 2026-09-06 shape: an intermediate draw (37–65 s) plus a post-burst task that
the rAF sampler sees as one frame. However, no current run reproduces the stall. **The stall itself
has therefore not been sampled.** The claim is an inference from the named mechanism, not an
observation of the stall.

The same mechanism is the proposed explanation for the draw/commit trade reported in issue 1750. It
likely also explains the 2–3 s `engine.crayonShadow` drains that issue 1701 quotes from the same
2026-09-06 runs, since that drain is a whole-tile `drawImage` readback. No current runner pays
either cost after the burst.

## What remains open for issue 1700

* **Physical iPad.** Issue 1700's done-when also needs a device capture after a comparable crayon
  burst. That capture must show that a matching gap does not occur on the iPad. This pass could not
  produce it.
* **The stall itself.** If the stall recurs (the WebKit version in `webkit-undo-fast-diagnostics`
  changes, or `firstPollAtMs` exceeds ~1.5 s again), rerun the sampler below on that runner. The
  prediction to test: the web-content main thread sits in a rendering update, waiting on the same
  IOSurface or GPU-process flush.

## Reproducing

The runner dispatch used this sampler. It started before `npm run perf:web:undo:webkit:fast`, and
every gate log line was prefixed with `date +%s` so samples can be placed against the log:

```bash
out=$1; i=0
while true; do
  for pid in $(pgrep -f "ms-playwright/webkit"); do
    name=$(basename "$(ps -o comm= -p $pid)" 2>/dev/null)
    case "$name" in *WebContent*|*GPU*) ;; *) continue;; esac
    (sudo sample $pid 3 -mayDie -file "$out/$(date +%s)-$i-$name-$pid.txt" >/dev/null 2>&1 &)
  done
  i=$((i+1)); sleep 3.2
done
```

Locally, `sudo` is unnecessary: `sample` can attach to Playwright's WebKit processes as the same
user. Two representative samples from each host are committed, gzipped, with the home directory
replaced by `~`, under
[`perf-profiles/evidence/2026-09-18-issue-1700-native-samples/`](../../../perf-profiles/evidence/2026-09-18-issue-1700-native-samples/).
The full runner set (173 files, 57 MB) is the `webkit-native-samples` artifact of run 35298666234,
retained for 7 days.
