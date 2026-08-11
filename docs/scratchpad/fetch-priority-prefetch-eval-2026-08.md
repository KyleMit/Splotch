# Fetch Priority for coloring prefetching — evidence

> Working notes from the August 2026 pass on issue
> [#892](https://github.com/KyleMit/Splotch/issues/892), the progressive-experiment gate on giving
> the detached coloring preloads in `web/src/lib/imagePrefetch.ts` a low Fetch Priority hint. The
> standing decision lives in `docs/COMPATIBILITY.md`'s API risk register and in ADR-0045's trial
> table; this is the evidence chain behind it, including the measurements that decide it.

## Executive result

The experiment closes. Nothing ships.

`img.fetchPriority = 'low'` on a detached prefetch is **not a small win, it is no change at all**:
Chromium already issues a detached `Image()` at `Low`, so the hint sets the priority it would have
had. Measured across 12 cold trials on two throttled profiles, every prefetch request carried the
same `Low` in both arms, and page-apply and picker-open times were identical to the millisecond band
of the run-to-run noise.

Chasing the "why" produced two findings worth more than the hint was:

1. **The traffic that actually competes with the child's page is the ADR-0103 pack downloader**,
   which is `fetch()` and therefore defaults to `High`, two priority steps above the picker art it
   contends with. Giving *those* requests `priority: 'low'` is a real priority change (verified in
   the trace), and it still moved nothing measurable, because a hint does not preempt requests that
   already own the pipe. That is ADR-0045's 2026-07 conclusion re-confirmed against a downloader
   that did not exist when it was written.
2. **The selected page's `fetchPriority = 'high'` is already being defeated.** ADR-0045 §4 says the
   canvas "decodes only the full-resolution alpha overlay off-DOM at high fetch priority." On the
   constrained path where that matters, it does not: the picker's own speculative warm has already
   started that exact URL at `Low`, and `DrawingCanvas`'s high-priority `Image()` reuses the
   in-flight request rather than issuing one. The 111 KB the child is waiting on is the single `Low`
   request in the trace.

That second finding says the interesting lever is the opposite of this issue's proposal, so it was
measured too — and it also fails, in a way worth recording so nobody re-derives it. See
[Inverting the experiment](#inverting-the-experiment-promote-the-page-the-child-picked).

## Support data vs. the enforced floor

Floor from `web/browserTargets.ts`: `chrome111, edge111, firefox114, safari16.4, ios16.4`.

| Feature                                                       | Chrome/Edge | Firefox | Safari | Safari iOS | Baseline                       |
| ------------------------------------------------------------- | ----------- | ------- | ------ | ---------- | ------------------------------ |
| Fetch priority (`img.fetchPriority` + `RequestInit.priority`) | 103         | 132     | 17.2   | 17.2       | newly available **2024-10-29** |

Source: `api.webstatus.dev/v1/features/fetch-priority`. The binding floor number is Safari/iOS
**16.4**, so the API sits above it on the platform the drawing experience is tuned for — the native
app serves this bundle to every device that can install it.

Both spellings are inert below the floor by construction, which is what made this the parent audit's
cleanest progressive candidate: an unknown property assignment on an `HTMLImageElement` is an
ordinary expando, and an unrecognized `RequestInit` member is ignored. Neither participates in load,
completion, or failure. The `floor` arm measures that rather than assuming it: with
`HTMLImageElement.prototype.fetchPriority` deleted, a fast-4g cold visit issued the same request set
at the same priorities and completed the same flow — apply 724 ms vs. 743 ms, picker open 2,309 ms
vs. 2,323 ms for `off`, both inside the noise band. That arm also covers the hint the app *does*
ship: the canvas's `img.fetchPriority = 'high'` lands on an expando and the overlay still decodes
and paints.

## Method

The harness is committed beside this document — `fetch-priority-probe/probe.mjs`, run as
`node docs/scratchpad/fetch-priority-probe/probe.mjs --build` — so the result can be re-measured on
a later engine rather than rebuilt from this prose.

Unlike the popover probe, this one drives the **real production bundle** (`vite build` +
`vite preview`, via `tools/perf/preview.mjs`). The question is about request scheduling across a
whole cold first visit — document, 47 app chunks, fonts, the coloring-pack manifest and its
downloads, the picker's art — and a copied harness reproduces none of that contention.

Each trial takes a fresh browser context (cold HTTP cache, cold Cache Storage, no service worker
yet, so it is a genuine first visit with Farm as the only installed book), applies CDP network
throttling, and drives: load → open the Actions Drawer → open the Coloring Book Picker → select the
first page → wait for the ready-gated `#coloringOverlay` `src`. Priorities come from CDP
`Network.requestWillBeSent`, which reports the priority Chromium assigned each request.

Profiles are ADR-0045's: **fast-4g** = 4 Mbps / 40 ms, **slow-4g** = 400 Kbps / 400 ms. Geometry is
iPad Pro (1,366×934 CSS px at 2× DPR). Three trials per cell; the spread within a cell is under 3%,
so medians are quoted.

**Every arm runs one build.** `hints.patch` (committed beside the probe) applies both candidate
hints, and each arm subtracts the ones it does not want with an init script — stripping `'low'` back
to `'auto'`, or dropping `priority` from the `RequestInit`. One set of bytes across all arms means
an arm cannot differ by a chunk hash or a code-splitting accident, and the `off` arm reproduces
shipped behavior exactly.

| Arm                     | What is live                                                              |
| ----------------------- | ------------------------------------------------------------------------- |
| `off`                   | Neither hint — today's production behavior                                |
| `img-low`               | `imagePrefetch.ts` → `img.fetchPriority = 'low'` (this issue's proposal)  |
| `pack-low`              | `webStore.ts` → `fetch(…, { priority: 'low' })` on pack downloads         |
| `overlay-high`          | The picker's page-overlay warm promoted to `high` (the inverse)           |
| `overlay-high+pack-low` | Both of the above                                                         |
| `floor`                 | `HTMLImageElement.prototype.fetchPriority` deleted — a 16.4-shaped engine |

Input mode matters and is a flag: a mouse `--input=click` hovers tiles on the way to the one it
picks (warming their overlays with real lead time), while `--input=tap` reproduces the tablet, which
has no hover and gives the pressed page only the pointerdown→click gap. ADR-0045 already records
that the two are not interchangeable.

## What the hint does to a detached image

A standalone probe first, to separate the API's behavior from the app's: seven detached/attached
`Image()` requests against a local server, priorities read from CDP. Committed as
`fetch-priority-probe/image-priority-probe.mjs`; it needs no build, so
`node docs/scratchpad/fetch-priority-probe/image-priority-probe.mjs` reproduces this table alone.

| Case                                            | Initial priority |
| ----------------------------------------------- | ---------------- |
| Detached, no hint (today's `prefetchImages`)    | `Low`            |
| Detached, `fetchPriority = 'low'` before `src`  | `Low`            |
| Detached, `fetchPriority = 'low'` after `src`   | `Low`            |
| Detached, `fetchPriority = 'high'` before `src` | **`High`**       |
| Detached, `low` + `srcset`/`sizes`              | `Low`            |
| In-document `<img>`, no hint                    | `Low`            |
| In-document `<img>`, `low`                      | `Low`            |

Chromium 149. The hint's supported direction is *up*: `high` moves a detached image, `low` cannot,
because `Low` is where an image the layout has never seen already starts. The property-ordering
question the issue raises (`fetchPriority` before `src`) is therefore moot for `low` and only
load-bearing for the `high` the canvas already uses.

## Cold-visit measurements

Medians of three trials. `apply` is tile activation → ready-gated overlay `src`; `picker open` is
the launcher press → first painted tile.

**Mouse (`--input=click`)**

| Profile | Arm        | Pack-download priority | Prefetch priority | Apply    | Picker open |
| ------- | ---------- | ---------------------- | ----------------- | -------- | ----------- |
| fast-4g | `off`      | High                   | Low               | 698 ms   | 2,306 ms    |
| fast-4g | `img-low`  | High                   | Low               | 729 ms   | 2,284 ms    |
| fast-4g | `pack-low` | **Low**                | Low               | 689 ms   | 2,299 ms    |
| slow-4g | `off`      | High                   | Low               | 6,973 ms | 7,220 ms    |
| slow-4g | `img-low`  | High                   | Low               | 6,967 ms | 7,224 ms    |
| slow-4g | `pack-low` | **Low**                | Low               | 7,026 ms | 7,171 ms    |

`img-low` is inside the noise band on both profiles, as the priority column predicts: the arm
changes no request's priority. `pack-low` does change one — 30 pack requests move `High` → `Low` —
and still changes no timing.

**Touch (`--input=tap`, slow-4g)** — the tablet path, no hover lead:

| Arm            | Apply    | Picker open |
| -------------- | -------- | ----------- |
| `off`          | 7,565 ms | 6,795 ms    |
| `overlay-high` | 7,511 ms | 6,816 ms    |

Raw per-trial marks: `fetch-priority-probe/runs/marks.json` (46 trials, all four runs).

## Why priority cannot help here

A trimmed baseline waterfall is committed as
`fetch-priority-probe/runs/slow-4g-baseline-waterfall.json`. Its tail is the whole story:

```
/coloring/farm/cat-wide.thumb.webp        Low    other    9683 → 12333   14,864 B
/coloring/manifest-1.4.0+….json           High   script  10198 → 17460   47,450 B
/coloring/farm/cat-wide.overlay.webp      Low    other   12386 → 19306  111,369 B   ← the page
/coloring/dinosaur/cover.thumb.webp       High   script  17914 → 19189   21,354 B
```

Three things follow.

**The selected page is served by the speculative warm, not by the canvas.** `cat-wide.overlay.webp`
appears exactly once in the trace, at `Low`, initiated by the detached prefetch, and it spans the
entire 6.9 s apply. `DrawingCanvas.svelte`'s `img.fetchPriority = 'high'` request for the same URL
reuses that in-flight response; the high hint never reaches the network. Lowering the prefetch — the
change this issue proposes — aims the hint at the one request that is not speculative by the time it
matters. That the numbers do not punish it is luck, not safety: it is a no-op only because `Low` was
already the value.

**`High` script traffic is the competition, and the hint cannot evict it.** The pack manifest and
the dinosaur pack's files are `fetch()` at default priority, which is `High` for a script-initiated
request. They interleave with the child's page on a 400 Kbps pipe. Dropping them to `Low` does not
recover the time, because the request that owns the connection when the child taps keeps it — the
same "browser fetch priority does not interrupt requests that already own connection slots" that
ADR-0045 recorded in 2026-07, now re-confirmed with the ADR-0103 downloader in the picture.

**A first visit has no cover-warm to deprioritize anyway.** The idle cover warm is gated on
`hasBookPicker` (two or more installed books). A fresh install has one, and once packs *are*
installed their covers come from Cache Storage rather than the network. The window in which the
hint's stated goal — speculative coloring bytes competing with startup-critical bytes — could apply
is narrower than it looks.

## Inverting the experiment: promote the page the child picked

If the selected page rides in on a `Low` request, the obvious repair is to promote that one warm.
Measured, it trades one wait for a worse one.

| Profile | Input | Arm                     | Apply               | Picker open           |
| ------- | ----- | ----------------------- | ------------------- | --------------------- |
| slow-4g | mouse | `off`                   | 6,973 ms            | 7,253 ms              |
| slow-4g | mouse | `overlay-high`          | **3,611 ms** (−48%) | **14,475 ms** (+100%) |
| slow-4g | mouse | `overlay-high+pack-low` | 3,544 ms            | 14,475 ms             |
| slow-4g | touch | `off`                   | 7,565 ms            | 6,795 ms              |
| slow-4g | touch | `overlay-high`          | 7,511 ms            | 6,816 ms              |
| fast-4g | mouse | `overlay-high`          | 724 ms              | 2,292 ms              |

On a mouse the apply halves and the picker takes twice as long to paint: every tile the pointer
crosses promotes a 111 KB overlay ahead of the 15 KB thumbnails the child needs in order to *choose*
a page. That is a bad trade in a picker a two-year-old is browsing by eye — it buys 3.4 s after the
choice by spending 7.2 s before it.

On touch — the flagship device, and the only path where the promotion could be surgical, since with
no hover the only warm is the pressed page — it buys nothing at all (0.7%, inside noise). A tap
gives the request ~120 ms of lead, and the connection is already committed to whatever pack file is
in flight.

So the promotion is not adopted either. What survives is the documentation fix: ADR-0045's "high
fetch priority" claim for the selected page holds only when the picker's warm has not already
started that URL, which on a constrained link is the case it was written for.

## What is not measured here

* **Safari 17.2+ / WebKit.** This environment has no WebKit build and no Safari, and WebKit exposes
  no priority introspection comparable to CDP's `initialPriority`. The floor-side claim (16.4
  ignores both hints inertly) is exercised by the `floor` arm; the *supported*-Safari claim is not
  measured. Since nothing is adopted, no shipped behavior depends on it — a future adoption attempt
  must measure there rather than inherit this result.
* **Physical devices.** All of this is Chromium 149 on Linux with CDP throttling. Per ADR-0051 and
  the parent audit's own rule, a change that touched the drawing surface would need real hardware; a
  rejected network hint does not.
* **HTTP/2 prioritization.** `vite preview` serves HTTP/1.1, while Netlify serves H2, where priority
  becomes a stream-weight signal rather than a queueing one. This weakens the *positive* claim a win
  would have needed; it does not rescue `img-low`, whose priority value is identical in both arms
  and would be sent identically on either protocol.

## Consequences for the repo

* `web/src/lib/imagePrefetch.ts` and `web/src/lib/coloringPacks/webStore.ts` are unchanged. The
  candidate diffs are frozen in `fetch-priority-probe/hints.patch`, which the probe applies to
  reproduce the arms.
* `docs/COMPATIBILITY.md` gains a Fetch Priority row for the hint the app *does* ship
  (`DrawingCanvas`'s `high`), with the reuse caveat and this rejection.
* ADR-0045 gains a 2026-08 amendment correcting the "selected page loads at high priority" reading
  and folding in the re-run of its own trial 08.
