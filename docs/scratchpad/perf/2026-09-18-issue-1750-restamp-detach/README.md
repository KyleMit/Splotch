# Issue 1750 — the web crayon's per-op blits, WebKit copy-on-write detaches, and a glaze-direct A/B at burst and finger pacing

This note is desktop evidence for issue 1750. No physical device was usable: the iPad's XCTest
automation grant had expired and the phone was locked. The note offers a **candidate mechanism** for
part of the deferred WebKit rendering cost and measures one existing alternative against it. **It is
not a product change, and it is not device validation.**

## A candidate mechanism

Native `sample(1)` captures of the WebKit processes were taken during the unchanged
`crayon-scribbles` workload (see issue 1700's note,
[`../2026-09-18-issue-1700-post-burst-stall-attribution.md`](../2026-09-18-issue-1700-post-burst-stall-attribution.md)).
They show the GPU process in `WebCore::IOSurface::createImage` under canvas copies. They also show
the CoreGraphics render thread detaching accelerated images: `CA::CG::AccelDataProvider::detach` →
`CA::CG::IOSurfaceDataProvider::copy_data`, which blocks in `IOSurfaceClientLock` and then copies
with `_platform_memmove`. Together these read as copy-on-write. An image taken from a canvas's
surface is detached, with a full CPU copy after the GPU drains, once that surface is written again.

The web build's crayon pipeline, restamp (ADR-0147), writes every op into an offscreen pass buffer
and then blits the op's rect onto the tile. Over blank paper that is one pass-buffer blit. Over
existing ink it is an under-shadow blit plus two pass-buffer blits (`restampRect`). The next op
writes the pass buffer again. The native build's `glaze-direct` pipeline (ADR-0148) paints each op
onto the tile with pattern fills and makes no canvas-to-canvas blit.

Sampling showed the following within each run. Counts come from
[`count_frames.py`](count_frames.py); per-file values are under `nativeSamples` in
[`results.json`](results.json).

| Thread (share of its own samples)                       | restamp | glaze-direct |
| ------------------------------------------------------- | ------: | -----------: |
| CA::CG render thread in `AccelDataProvider::detach`     |     65% |          17% |
| GPU-process rendering queue in `IOSurface::createImage` |     69% |           5% |
| CA::CG render thread in `CA::OGL::MetalContext::draw`   |      4% |          32% |

**What the samples cannot show.** Statistical samples of separate threads cannot pair a particular
`drawImage` with a particular image creation, a later write, and a detach. They also do not say
which surface detached. Removing the per-op blits removes most of those stacks, so the association
is strong. "The next pass-buffer write detaches the image each blit took" remains a hypothesis
consistent with the samples, not a traced chain. The two sampled runs differ in length (12 and 9
three-second files), so the table compares shares within each run.

## The A/B

[`ab-crayon-deposition.mjs`](ab-crayon-deposition.mjs) runs the gate's `crayon-scribbles` workload:
22 scribbles of 1,200 ops in one synchronous evaluate, at 1024×1366 and DPR 2. It then idles for a
fixed 3 s and undoes to empty with the gate's frame-waiting loop. It switches pipelines through
`/dev/engine`'s `setCrayonDeposition` seam and alternates arms. A continuous rAF sampler runs over
the whole session, so a wait moved into the idle window or the undo loop would still show as a frame
gap.

The product was main at 50a1f046a33cead04fc6e91d8aa64aeaf775c92e (a `PERF_MARKS` dev-harness build).
`web/src` is identical at 7c9db0fa8a2eec37c8f1070a566a90001e30e52e. The host was an Apple M5 with no
capture or build running concurrently. Every run is in [`results.json`](results.json).

The instrumented WebKit 26.6 runs (ABBA ×2, four per arm):

| Arm          | Draw to 2nd rAF | Commit P95 | Settle: largest frame gap (`engine.fold`) | Undo loop / largest gap |    Whole session | rAF-gap excess over 16.7 ms |
| ------------ | --------------: | ---------: | ----------------------------------------: | ----------------------: | ---------------: | --------------------------: |
| restamp      |  8,700–8,767 ms | 580–587 ms |                   478–509 ms (473–504 ms) |    733–783 / 421–472 ms | 12,466–12,583 ms |              9,603–9,751 ms |
| glaze-direct |  5,535–6,167 ms | 400–446 ms |                       18–21 ms (11–14 ms) |         317–335 / 19 ms |   8,885–9,532 ms |              5,589–6,211 ms |

"Whole session" runs from draw start to the second rAF after the undo loop, including the 3 s idle
window. "rAF-gap excess" sums `max(0, gap − 16.7 ms)` over every rAF gap in the session. It is a
literal gap sum, not main-thread blocked time. WebKit's ~1 ms clock quantization adds a few tens of
milliseconds over a smooth multi-second stretch, and a missing callback does not by itself say the
page's main thread was the one delayed. It is useful here only for comparing the two arms. The
largest-gap columns are the stronger evidence. The Chromium runs and the two earlier WebKit sets
used a driver revision without the session sampler. The earlier WebKit sets (A/B ×3, then ABBA ×2)
measured the same draw, commit, and undo fields in the same ranges: restamp 8,703–8,760 ms and
glaze-direct 5,620–5,974 ms to the second rAF.

Chromium 153 (headless, ABBA ×1) showed the same direction and a larger ratio. Restamp took
3,006–3,076 ms to the second rAF and glaze-direct took 487–490 ms. Commit P95 was about 1 ms in
both.

Within the measured session, glaze-direct lowers every phase. Its cost does not move into the idle
window or the undo loop, where its frame gaps are the smallest recorded, and both arms retain 20
undo steps. What lies outside the session is not measured: GPU completion after the last rAF, and
displayed pixels.

## At finger pacing on the same desktop

The burst prices per-op rendering cost. It does not show whether that cost costs frames when ops
arrive one or two per frame, which is how a finger delivers them. The same comparison was therefore
repeated with `perf:web:frames`. That tool runs the real app at `/` in Playwright WebKit 26.6, at
iPad Pro geometry (1366×915 at DPR 2), with rAF-paced synthetic input. It uses `--brush=crayon`,
nine 10 s probe phases, then five undos.

* **Restamp arm:** this checkout's unchanged build (product
  50a1f046a33cead04fc6e91d8aa64aeaf775c92e).
* **Glaze-direct arm:** 08784ad89878e5fa1682a1f3a440cd30db4b83bb with the single line
  `configureCrayonDeposition(__IS_CAPACITOR__ ? 'glaze-direct' : 'restamp', …)` →
  `configureCrayonDeposition('glaze-direct', …)` in `web/src/lib/drawing/engine.ts`. `web/src` is
  otherwise identical, and the build was served from a separate worktree.

Both arms ran the same probe revision (a5963a018000e652d76471f44bbfd4220a1b1228, the first commit of
the brush-selection fix; without it, no crayon is ever selected). The order was ABBA ×2, and every
run recorded `committedBrush: "crayon"`, no console errors, and a quiet host. The per-run phase
summaries are in [`real-pacing.json`](real-pacing.json).

| Arm          | Runs | Lost frame time, every phase | Frame p95 | Engine ms per frame | `engine.crayonShadow` max | Undo next-frame p95 |
| ------------ | ---: | ---------------------------: | --------: | ------------------: | ------------------------: | ------------------: |
| restamp      |    4 |                           0% |     19 ms |           0.16–0.18 |                      1 ms |            11–18 ms |
| glaze-direct |    4 |                           0% |     19 ms |           0.13–0.15 |    (no drain in pipeline) |            10–13 ms |

At finger pacing on this host, neither pipeline loses a frame. glaze-direct's engine time per frame
is lower, but both are about 1% of a 60 Hz frame. **The burst's gap does not become lost frames on a
fast desktop.** Whether it does on the iPad's GPU is exactly what the device screening below must
answer. It is also one real-pacing data point for issue 1701: under rAF-paced crayon input, every
restamp shadow drain here took at most 1 ms.

## What this does not establish

* **No device.** ADR-0147 chose restamp for iPad Safari from real-input lost-frame shares. As
  corrected on 2026-08-27, those were 0.83 / 0.88 / 0.77% portrait against a same-session pen
  control of 0.81%, and 0.97 / 0.98 / 1.06% landscape. The landscape residual left ADR-0137's 1.5%
  exception in force. A synchronous 26,400-op burst prices per-op rendering cost, not frame
  continuity under a finger. glaze-direct has been measured on the Capacitor WKWebView (ADR-0148, at
  the native pen floor) but never on iPad Safari or Android Chrome web. The seam's own comment warns
  against reading native frame cost from it. That warning concerns the WKWebView, while this A/B
  reads desktop engines running the web build. It is still not a device measurement.
* **Appearance differs.** ADR-0148 records that glaze-direct matches the web glaze on blank paper
  and same-colour buildup. It differs at crossings over other colours and at antialiased rims.
  Moving web to glaze-direct would give web the appearance a human approved on the iPad for native.
  That is a product decision.
* **Commit is not fixed.** Under glaze-direct, commit P95 is still 400–446 ms on this commit-charged
  host against the 25 ms gate, because the undo crop still pays its own copy.
* **Issue 1701 would dissolve, not be fixed.** glaze-direct has no under shadow, so
  `refreshPendingCrayonShadows` has nothing to drain.

## What this supports next

> Issue 1750 closed on 2026-09-22 without taking this step. Glaze-direct on web stays an open
> product option, blocked on the ADR-0148 appearance decision. See the
> [disposition](../../../investigations/webkit-snapshot-experiments-1750.md#disposition). The
> screening plan below still applies to anyone who takes it up.

The next step is a **screening** experiment, not adoption: device captures of the web build with
glaze-direct against unchanged restamp. It would cover the `ipad-device-web` and
`android-device-web` crayon drawing cells plus the undo and discrete-action cells, under the
campaign's fidelity and confirmation rules.

A candidate that passes screening still owes everything
[`../../../investigations/webkit-snapshot-experiments-1750.md`](../../../investigations/webkit-snapshot-experiments-1750.md)
requires of a selected change:

* pixel, undo-depth, and memory correctness;
* initial and confirmation samples;
* a fresh-runner comparison;
* physical validation;
* a human judgement of web crossings on the iPad;
* independent review.

Adoption would also supersede ADR-0147's web half, retire the restamp pipeline and its shadow drain,
and make web and native deposit alike.
