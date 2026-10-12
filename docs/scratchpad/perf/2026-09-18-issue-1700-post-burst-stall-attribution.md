# Issue 1700 — whether the post-crayon-burst stall still happens, and a candidate mechanism

> **Closed 2026-09-22.** Issue 1700 closed as matched on the physical iPad, with part of the stall
> attributed and the rest not. See [Disposition](#disposition). The sections before it are the
> unchanged runner-side record; its "What remains open" list is superseded by the disposition.

Runner-side evidence for issue 1700. It names a candidate mechanism, not the stall's task. No
physical device was available for this pass (the iPad's XCTest automation grant had expired and the
phone was locked), so the issue's "shown not to occur on the physical iPad" half is **not** answered
here.

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
[`2026-09-18-issue-1700-runner-survey.json`](2026-09-18-issue-1700-runner-survey.json). Two fields
cover the two sides of the draw evaluate's IPC return, which is where the 2026-09-06 note found the
stall on different runs:

* `firstPollRoundTripMs` is the Node-side wall time of the first settle poll. `settleHistory` starts
  its clock only after the draw evaluate has returned, so this catches a stall in front of the first
  poll (the 4,601–9,673 ms readings) and nothing earlier.
* `firstPollFrames` is the page's rAF stamps from `drawEnd` (page clock) to that poll's read. A
  stall inside the evaluate's own return shows here as a late first stamp or a large gap between
  stamps — the 2026-09-06 run whose poll read 42 ms had stamps at 55 and 6,253 ms.

| Runner mode                                    | Samples | First-poll round trip, max | Largest post-burst frame gap | `engine.crayonShadow`, max |
| ---------------------------------------------- | ------: | -------------------------: | ---------------------------: | -------------------------: |
| Draw-charged (crayon commit P95 ≤ 500 ms)      |     191 |                     723 ms |                       600 ms |                     113 ms |
| Commit-charged (crayon commit P95 2.2–4.9 s)   |       6 |                       3 ms |                        21 ms |                       1 ms |
| 2026-09-06 runs the issue quotes (WebKit 26.5) |       5 |             4,601–9,673 ms |           6,198 ms (one run) |             2,070–3,263 ms |

"Largest post-burst frame gap" is the larger of the first stamp's delay after `drawEnd` and the
largest gap between stamps (draw-charged maxima 132 ms and 600 ms respectively; commit-charged runs
had at most one stamp, at 21 ms). The two modes split cleanly: no sample's commit P95 lies between
114 ms and 2,217 ms. No sample reproduces the stall on either side of the IPC boundary, in either
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

### The candidate mechanism, and what it does not establish

In both modes, the samples show the same wait: **WebKit waiting for accelerated CoreGraphics to
finish rendering deferred canvas drawing before it can copy a canvas's pixels**. Only the process
where the wait happens and the first operation that forces the wait differ. A post-burst stall with
no JS on the stack fits the same mechanism. In that case, deferred drawing would still be queued
when the draw evaluate returns, and the first rendering update to need the canvas pixels would pay
for it. That explanation fits the 2026-09-06 shape: an intermediate draw (37–65 s) plus a post-burst
task that the rAF sampler sees as one frame. However, no current run reproduces the stall. **The
stall itself has therefore not been sampled.** The claim is an inference from the named mechanism,
not an observation of the stall.

The same mechanism is the proposed explanation for the draw/commit trade reported in issue 1750. It
likely also explains the 2–3 s `engine.crayonShadow` drains that issue 1701 quotes from the same
2026-09-06 runs, since that drain is a whole-tile `drawImage` readback. No current runner pays
either cost after the burst.

## What remains open for issue 1700

* **Physical iPad.** Issue 1700's done-when also needs a device capture after a comparable crayon
  burst. That capture must show that a matching gap does not occur on the iPad. This pass could not
  produce it.
* **The stall itself.** If the stall recurs (the WebKit version in `webkit-undo-fast-diagnostics`
  changes, or either the first-poll round trip or the largest post-burst frame gap exceeds ~1.5 s
  again), rerun the sampler below on that runner. The prediction to test: the web-content main
  thread sits in a rendering update, waiting on the same IOSurface or GPU-process flush.

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
user.

Every count in the two sample tables is a sum over a per-file ledger,
[`2026-09-18-issue-1700-native-samples/ledger.json`](2026-09-18-issue-1700-native-samples/ledger.json).
The ledger records each raw file's SHA-256, its host, whether it falls in the runner's crayon draw
window and how that window was placed, and per-thread counts from this parser:

```python
import hashlib, json, re, sys

FRAMES = {
    'drawImage': 'jsCanvasRenderingContext2DPrototypeFunction_drawImage',
    'ensureBackend': 'RemoteImageBufferProxy::ensureBackend',
    'shareableBitmapCopy': 'ShareableBitmap::createFromImagePixels',
    'ioSurfaceClientLock': 'IOSurfaceClientLock',
    'ioSurfaceCreateImage': 'IOSurface::createImage',
    'caCgQueueFlush': 'CA::CG::Queue::flush',
}
THREAD = re.compile(r'^\s{4}(\d+)\s+(Thread_\S+.*)')
LINE = re.compile(r'^[\s+!:|]*(\d+)\s+(.*)')

def threads(text):
    lines = text.split('\n'); out = []; i = 0
    while i < len(lines):
        m = THREAD.match(lines[i])
        if not m: i += 1; continue
        j = i + 1; body = []
        while j < len(lines) and lines[j].strip() and not THREAD.match(lines[j]):
            body.append(lines[j]); j += 1
        out.append((m.group(2), int(m.group(1)), body)); i = j
    return out

# Largest count on any call-tree line naming the frame: a lower bound on the
# thread's samples under that frame (separate paths are not summed).
def heaviest(body, frame):
    return max([int(m.group(1)) for m in map(LINE.match, body) if m and frame in m.group(2)] or [0])

def count_file(path):
    raw = open(path, 'rb').read()
    row = {'sha256': hashlib.sha256(raw).hexdigest()}
    for name, total, body in threads(raw.decode('utf-8', 'replace')):
        key = 'main' if 'com.apple.main-thread' in name else \
            'rrb' if 'RemoteRenderingBackend work queue' in name else None
        if key:
            row[key] = {'samples': total, **{k: heaviest(body, f) for k, f in FRAMES.items()}}
    return row

print(json.dumps({p.rsplit('/', 1)[-1]: count_file(p) for p in sys.argv[1:]}, indent=1))
```

The local table sums all 30 local files. That run's log carried no timestamps, so those files cover
the whole scenario: initial and confirmation passes, draw, commit, settle, and undo. The runner
table sums the 70 files inside the crayon draw window.

Two representative raw samples per host are committed beside the ledger, gzipped. They are
unmodified: `sample(1)` itself writes user directories as `/Users/USER` and `/Users/*`, and each
decompresses to the SHA-256 its ledger entry records. The full runner set (173 files, 57 MB) is the
`webkit-native-samples` artifact of run 35298666234, retained for 7 days; after that, the ledger is
the audit trail for the counts, and the committed files show the stack shapes. The remaining 26
local files were not retained.

## Disposition

On 2026-09-22 the maintainer closed issue 1700 as matched on the device (option A of the issue's
2026-09-19 comment), as part of closing out the September performance campaign (issue 1567). The
work ends with this record. No new capture, trace, or product change was made for it.

### The done-when's second branch is met

The issue is done when "an iPad capture after a comparable crayon burst shows a matching gap and the
cause is moved to a product issue". [PR 2070](https://github.com/KyleMit/Splotch/pull/2070)'s iPad
evidence already ran this gate's synchronous burst on the physical iPad: `crayon-scribbles`, 22
strokes × 1,200 ops through `strokeSync`, in Safari 26.5 on `/dev/engine`, main at
7a2365631aba6078f94038235d661add6e2e42cb (entry `start.DY5Ge2nJ.js`). A continuous rAF sampler ran
through the history settle. The figures are the `present` phase of the four `burst-*` rows under
`burstPipelineAB` in
[`2026-09-18-issue-1750-ipad-baseline/summary.json`](2026-09-18-issue-1750-ipad-baseline/summary.json):

| Pipeline                         | Run | Synchronous burst | One rAF interval right after `drawEnd` | `engine.fold` inside that interval |
| -------------------------------- | --: | ----------------: | -------------------------------------: | ---------------------------------- |
| restamp (web)                    |   1 |           116.4 s |                          **13,326 ms** | 8 ms and 2,954 ms                  |
| restamp (web)                    |   2 |           116.4 s |                          **13,547 ms** | 4,304 ms and 5,036 ms              |
| glaze-direct (native, in Safari) |   1 |            12.3 s |                               2,623 ms | 12 ms                              |
| glaze-direct (native, in Safari) |   2 |            12.0 s |                               2,956 ms | 10 ms                              |

On the web (restamp) pipeline, the burst is followed by a single frame-less interval of 13.3–13.5 s.
That is the same shape as the runner's 4.6–9.7 s stall: one long interval, with the page making no
progress, before the first settle poll could run. It is longer on the device, as the draw itself is.
Glaze-direct, native's pipeline measured here in iPad Safari, shows 2.6–3.0 s.

The shape matches, but the contents differ in part. On the runner the folds ran after the stall, at
12–130 ms, so the runner's interval held no product JavaScript. On the iPad the folds run inside the
interval.

### What is attributed, and what is not

* **Attributed: 3–9 s is `engine.fold`.** This is the idle history fold replaying the burst's
  1,200-op crayon commands into the history base, one command per fold (`foldOldestCommand` in
  `web/src/lib/drawing/tiledRenderer.ts`). The folds inside the interval total 2,962 ms and 9,340
  ms. The same fold takes ≤ 22 ms per command at finger pace on the same iPad (PR 2070).
* **Not attributed: the remaining ~4–10 s** (10,364 ms and 4,207 ms) carries no `engine.*` measure
  beyond a 1 ms `engine.crayonShadow` in run 2. It is consistent with the candidate in Finding 2
  above, WebKit waiting for accelerated CoreGraphics to finish deferred canvas drawing. That
  candidate was named from macOS samples, not from the iPad. **The iPad interval was never traced.**
  A WebKit timeline recording of the burst on the iPad (Web Inspector, attached to the device) is
  the way to trace it. Closing the issue does not claim that the remainder was traced or that the
  candidate is its cause.

### The runner side

The runner-side stall has not recurred since WebKit 26.6: 197 fast-gate samples from 2026-09-11 to
2026-09-18, with a first-poll round trip of at most 723 ms (Finding 1). The iPad result does not
change that.

### Where the product side went

The stall follows the CI gate's synchronous burst. Issue 1750's
[disposition](../../investigations/webkit-snapshot-experiments-1750.md#disposition) dropped that
burst as a workload no finger produces, and it names this stall as part of the dropped workload. So
the cause moves to issue 1750's product scope and is dropped there with the rest of the burst, not
fixed. No separate product issue is filed. At finger pace on the same iPad, drawing is clean on both
pipelines and each fold takes ≤ 22 ms.

### What would reopen it

* A finger-paced or real-use session on a device that shows a comparable post-stroke stall: a
  frame-less interval of seconds after drawing ends.
* A product feature that deposits many crayon ops in one synchronous task, which is issue 1750's
  reopening condition for the burst cost.
* A recurrence on the runner, by the thresholds in "What remains open for issue 1700" above. That
  reopens the runner-side attribution with the sampler, not the product question.

### Limits

* One 12.9-inch iPad Pro on iPadOS 26.5 (Safari 26.5). No iPadOS 26.6 capture exists.
* Synthetic input dispatched in the page on `/dev/engine`, not trusted touch in the real app.
* Two runs per pipeline.
