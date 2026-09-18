# Issue 1750 — the web crayon's per-op blits force WebKit copy-on-write detaches

Desktop evidence for issue 1750, collected with no physical device (the iPad's XCTest automation
grant had expired and the phone was locked). It names one mechanism inside the deferred WebKit
rendering cost and measures one existing alternative against it. **It is not a product change and
not device validation.**

## The mechanism

Native `sample(1)` captures of the WebKit processes during the unchanged `crayon-scribbles` workload
(issue 1700's note,
[`../2026-09-18-issue-1700-post-burst-stall-attribution.md`](../2026-09-18-issue-1700-post-burst-stall-attribution.md))
show the GPU process creating an image from a canvas's IOSurface for every canvas-to-canvas
`drawImage`. `WebCore::IOSurface::createImage` returns a copy-on-write image, and a later write to
that surface detaches it. The CoreGraphics render thread then locks the surface, which waits for the
GPU to finish, and copies it on the CPU (`CA::CG::AccelDataProvider::detach` →
`CA::CG::IOSurfaceDataProvider::copy_data` → `IOSurfaceClientLock` plus `_platform_memmove`).

The web build's crayon pipeline, restamp (ADR-0147), makes that pattern on every op. It writes the
op into an offscreen pass buffer, then blits the op's rect from the under shadow and twice from the
pass buffer onto the tile. The next op writes the pass buffer again. The native build's
`glaze-direct` pipeline (ADR-0148) paints each op onto the tile with pattern fills and does no
canvas-to-canvas blit.

Sampling one run of each pipeline on the same host (counts from
[`count_frames.py`](count_frames.py), per-file values in [`results.json`](results.json) under
`nativeSamples`):

| Thread (share of its own samples)                       | restamp | glaze-direct |
| ------------------------------------------------------- | ------: | -----------: |
| CA::CG render thread in `AccelDataProvider::detach`     |     65% |          17% |
| GPU-process rendering queue in `IOSurface::createImage` |     69% |           5% |
| CA::CG render thread in `CA::OGL::MetalContext::draw`   |      4% |          32% |

The two sampled runs differ in length (12 and 9 three-second files), so the table compares shares
within each run, not sample totals. Which surface detaches is not isolated per canvas. The pattern
fits the pass buffer, which every op both writes and blits, but that is an inference.

## The A/B

[`ab-crayon-deposition.mjs`](ab-crayon-deposition.mjs) runs the gate's `crayon-scribbles` workload:
22 scribbles of 1,200 ops, one synchronous evaluate, 1024×1366 at DPR 2, then undo to empty with the
gate's frame-waiting loop. It switches the pipeline through `/dev/engine`'s `setCrayonDeposition`
seam and alternates arms. The product was main at 50a1f046a33cead04fc6e91d8aa64aeaf775c92e (a
`PERF_MARKS` dev-harness build; `web/src` is identical at 7c9db0fa8a2eec37c8f1070a566a90001e30e52e).
The host was an Apple M5, with no capture or build running concurrently. Every run is in
[`results.json`](results.json).

| Engine (runs per arm)      | Arm          | Page draw      | Draw to second rAF | Commit P95 | Undo loop  |
| -------------------------- | ------------ | -------------- | ------------------ | ---------- | ---------- |
| WebKit 26.6 (7)            | restamp      | 8,296–8,353 ms | 8,703–8,760 ms     | 582–592 ms | 739–773 ms |
| WebKit 26.6 (7)            | glaze-direct | 5,117–5,459 ms | 5,620–5,974 ms     | 408–428 ms | 324–333 ms |
| Chromium 153, headless (2) | restamp      | 2,979–3,047 ms | 3,006–3,076 ms     | 1.2–1.3 ms | 414–418 ms |
| Chromium 153, headless (2) | glaze-direct | 429–432 ms     | 487–490 ms         | 0.8–0.9 ms | 314–324 ms |

On WebKit, glaze-direct is about a third faster through presentation (draw plus commit plus the
second rAF). It also cuts commit P95 by about 170 ms and more than halves the undo loop. The time
removed is not relocated. Every phase of the combined path is lower, and both arms retain 20 undo
steps. The WebKit arms were run in two alternating orders (A/B ×3, then ABBA ×2) and never overlap.

## What this does not establish

* **No device.** ADR-0147 chose restamp for iPad Safari from real-input lost-frame shares, where it
  measured 0.77–0.97% against pen's 0.76%. A synchronous 26,400-op burst prices per-op rendering
  cost. It does not price frame continuity under a finger. glaze-direct has been measured on the
  Capacitor WKWebView (ADR-0148: the native pen floor) but never on iPad Safari or Android Chrome
  (web). The `/dev/engine` seam's own comment warns against reading native frame cost off it. That
  warning concerns the WKWebView. This A/B reads desktop WebKit and Chromium running the web build,
  which is what the seam switches, but it is still not a device measurement.
* **Appearance differs.** ADR-0148 records that glaze-direct and the web glaze match on blank paper
  and same-colour buildup and differ at crossings over other colours and at antialiased rims. Moving
  web to glaze-direct would give web the native appearance, which a human approved on the iPad for
  native. That remains a product decision, not a performance one.
* **Commit is not fixed.** Under glaze-direct, commit P95 is still about 415 ms on this host against
  the 25 ms gate. The undo crop's own copy still waits on the GPU process (issue 1700's note, local
  mode). The pipeline change would reduce issue 1750's combined cost. It would not satisfy the gate
  on a commit-charged host.
* **Issue 1701 would dissolve rather than be fixed.** glaze-direct has no under shadow, so
  `refreshPendingCrayonShadows` has nothing to drain.

## The experiment this supports

This supports a device A/B of the web build with `glaze-direct` against unchanged restamp. The A/B
needs `ipad-device-web` and `android-device-web` crayon drawing cells plus the discrete-action and
undo cells, under the campaign's existing fidelity and confirmation rules. Before adoption, a human
would also need to judge web crossings on the iPad. If adopted, the change supersedes ADR-0147's web
half, retires the restamp pipeline and its shadow drain, and makes web and native deposit alike.
