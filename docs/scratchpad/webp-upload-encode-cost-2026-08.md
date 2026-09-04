# WebP upload-encode cost — measurement log

> Working notes from the August 2026 investigation that settled PR
> [#771](https://github.com/KyleMit/Splotch/pull/771)'s one open review thread: whether
> `aiImage.ts`'s `encodeWebpUpload` should encode via a main-realm `OffscreenCanvas`, via the DOM
> canvas, or in a worker. The retained decision (DOM canvas plus a WebP capability gate) lives in
> the code and `docs/COMPATIBILITY.md`; this document is the evidence chain, including the numbers
> that killed the worker option.

## Executive result

A main-realm `OffscreenCanvas` encode is indistinguishable from the DOM-canvas `toBlob` path on
every engine measured, so the branch added for it was reverted. The real cost was elsewhere: Safari
has no canvas WebP encoder, so on iPad the entire decode + draw + encode ran fully on the main
thread and produced a PNG the `type === 'image/webp'` guard then discarded — measured at ~105 ms of
blocked main thread per generation tap on a physical iPad. A memoized 1×1 `toDataURL('image/webp')`
capability probe (~2 ms, once per page load) now skips the transcode on engines that cannot produce
WebP. Chromium keeps the genuine upload win (3.4× smaller WebP, encoded off the main thread on both
paths).

## Method

A benchmark page reproduced `encodeWebpUpload`'s exact phases at export resolution — 2048×1536, the
`max(devicePixelRatio, 2)` iPad-class export — on a synthetic flat-color toddler drawing (40 seeded
scribbles, ~520–600 KB PNG):

1. `createImageBitmap(png)` — the decode
2. `drawImage` onto a fresh `OffscreenCanvas`, then `convertToBlob({ type: 'image/webp', quality:
   0.85 })`
3. `drawImage` onto a fresh DOM canvas, then `toBlob(cb, 'image/webp', 0.85)`

Each phase recorded its awaited duration *and* the longest main-thread stall during it, via a
`setTimeout(0)` ticker (nesting-clamp baseline ~5 ms Chromium / ~8–9 ms WebKit — only numbers well
above baseline are real blocking). Five iterations, medians reported. Desktop runs used Playwright
Chromium and WebKit on macOS; the device run drove Safari on a physical iPad over the WebKit
Inspector Protocol, reusing `scripts/perf/ipad-session.mjs`'s relay plumbing to serve the page over
LAN and poll the published result global.

## Results

Physical iPad (iPadOS 26.5, DPR 2, 8 cores, 12.9-inch class):

| Phase                       | await (median) | main-thread stall (median) |
| --------------------------- | -------------- | -------------------------- |
| `createImageBitmap` decode  | 18 ms          | 18 ms — fully blocking     |
| `drawImage` (either canvas) | ~0 ms          | none                       |
| `convertToBlob` (Offscreen) | 87 ms          | 90 ms — fully blocking     |
| `toBlob` (DOM canvas)       | 84 ms          | 85 ms — fully blocking     |

macOS Chromium: decode 5 ms (no stall), OffscreenCanvas encode 109 ms and DOM encode 99 ms — **both
with zero main-thread stall** (~5 ms probe gaps ≈ baseline); both paths produced byte-identical 176
KB WebP from a 598 KB PNG. macOS WebKit matched the iPad's shape at smaller magnitudes (decode 16
ms, encode 33–35 ms, all fully blocking).

Capability findings, identical on Playwright WebKit and the physical iPad:

* `convertToBlob`/`toBlob` with `image/webp` return a **PNG-typed blob** (the spec-mandated
  fallback) — Safari cannot encode WebP, so the transcode's output was always discarded there.
* A 1×1 encode probe answers in ~2 ms with blocking indistinguishable from idle baseline.

## What this settled

* **OffscreenCanvas branch: reverted.** Chromium already encodes `toBlob` off the main thread;
  WebKit blocks fully on both paths. Measured-zero benefit on every engine for real branching
  complexity. This matches ADR-0091's trial rows: the worker boundary, not the offscreen surface, is
  what ever moved a number.
* **Worker version: not built, evidence-killed.** On Chromium there is nothing left to move (~5 ms
  decode); on WebKit a worker still cannot produce WebP — it would relocate ~105 ms of pointless
  work instead of deleting it. Echoes ADR-0091 trial 04 (a worker behind a main-thread
  `createImageBitmap` fails).
* **Capability gate: retained.** Feature detection over platform detection: no API reports canvas
  encode support, so the probe's returned MIME type is the feature signal. Memoized per page load,
  never persisted — a stored "no" would outlive a Safari upgrade that adds an encoder.

## Caveats

* The device numbers are one fast iPad (8-core, iPadOS 26.5); older A-series iPads should scale the
  magnitudes up, not change the structure.
* Chromium's off-main-thread `toBlob` encode is observed engine behavior, not a spec guarantee. The
  gate does not depend on it; it only means the WebP path never needed moving on Chromium.
* The benchmark page and driver were session-scratch, not committed; this document plus the exact
  method description above is what a re-run needs.
