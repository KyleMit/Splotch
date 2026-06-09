# TODO

Performance findings from Chrome trace (iPad Pro emulation, 2026-06-09).
Drawing hot path is healthy — pointermove p50 0.14ms, max 0.83ms, zero jank events.
These are the three areas worth tightening.

---

## PERF: Speed up `scanCanvasIsEmpty()` on large canvases

**File:** `src/lib/drawing/engine.ts:93`

`scanCanvasIsEmpty()` calls `getImageData(0, 0, width, height)` and walks every
alpha byte. For the trace session (iPad Pro viewport) this took **9–11ms** in
`requestIdleCallback` — deferred correctly, so it never blocked a frame. But
cost scales with canvas area and will hurt on large viewports or low-end devices.

**Fix:** Sample a sparse grid instead of scanning every pixel.

```ts
function scanCanvasIsEmpty(): boolean {
  if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) return true;
  const STEP = 8;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const stride = canvas.width * 4;
  for (let y = 0; y < canvas.height; y += STEP) {
    for (let x = 0; x < canvas.width; x += STEP) {
      if (data[y * stride + x * 4 + 3] !== 0) return false;
    }
  }
  return true;
}
```

Sampling every 8px reduces iterations by ~64× with negligible false-empty risk
(an 8px gap between any drawn pixel and any sampled pixel is effectively zero).

---

## PERF: Preload paper texture instead of lazy-loading on first export

**File:** `src/lib/drawing/engine.ts:457`

`loadPaperTexture()` is called the first time `exportCanvasBlob()` runs. The
WebP decode + Promise chain blocked the main thread for **226ms** in the trace —
a visible stall the first time a user shares or saves their drawing.

**Fix:** Kick off the load eagerly after the canvas initialises (or in an idle
callback), so the image is already decoded by the time export is triggered.

In `init()` or wherever the canvas is set up:

```ts
// Warm the paper texture cache; ignore the result — export will await it.
if (typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(() => loadPaperTexture());
} else {
  setTimeout(() => loadPaperTexture(), 0);
}
```

`loadPaperTexture` already deduplicates via `paperTexturePromise`, so calling it
early is safe.

---

## PERF: Investigate forced layout from UI dependency

**File:** Vite dep `chunk-AYX5C5U2.js:737`

A function in a bundled Vite dependency reads a layout-sensitive property
synchronously, forcing an **8.1ms layout** (LocalFrameView::performLayout).
The chunk hash suggests it is a UI component library (likely @melt-ui or
floating-ui). The forced layout appeared during non-drawing interactions
(toolbar/panel clicks).

**Fix:**
1. Identify the package: in Chrome DevTools Source panel, open the Network tab,
   filter for `AYX5C5U2`, and check the Response Headers → `x-vite-dep-id`, or
   search the Vite dep cache at `node_modules/.vite/deps/_metadata.json` for the
   matching chunk name.
2. If it is floating-ui's `computePosition`, wrap the call in a rAF or schedule
   it with `flushSync` only when strictly needed.
3. If it is @melt-ui, check if the component is reading `offsetWidth`/
   `getBoundingClientRect` during a state update — move that read outside the
   write that precedes it.
