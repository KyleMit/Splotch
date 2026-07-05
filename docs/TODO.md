# TODO

> Work through these items one at a time with `/fix-next-todo-manual`, or clear the whole list autonomously with `/fix-next-todo-auto`.
> After each fix: remove the completed item, run relevant type checks or tests, and suggest a commit message.
> Do **not** `git add` or `git commit` — the user reviews the diff first.

## Source: Lighthouse page-load audit (slow device + slow internet)

Captured against the production build (`npm run build` → `vite preview`) under
Lighthouse's simulated **Slow 4G + 4× CPU** throttle on two form factors. The raw
HTML reports are attached to the pull request rather than committed to the repo.

| Run | Screen | Perf | A11y | Best-Practices | SEO | FCP | LCP | TBT | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Phone portrait | 412×915 | **73** | 92 | 100 | 100 | 1.9 s | **5.4 s** | 290 ms | 0 |
| Tablet landscape | 1133×744 | **91** | 92 | 100 | 100 | 2.5 s | 2.9 s | 100 ms | 0 |

Both runs paint the same **LCP element — `<canvas#drawingCanvas>`** — so the drawing
surface appearing is what "page loaded" means here. On the phone the canvas takes
5.4 s to reach its final paint, driven by main-thread work (2.7 s total: Style &
Layout 749 ms, Script Eval 650 ms) competing with a 736 KB initial download on a
throttled link. The opportunities below target that critical path first.

- [ ] **[Performance] Defer the pencil-sound preload off the load critical path** — File(s): `web/src/lib/components/DrawingCanvas.svelte`, `web/src/lib/audio/drawingSound.ts`
  The three `/sounds/pencil-*.mp3` files (119 KB each, **357 KB — roughly half of the
  entire 736 KB page transfer**) are the largest resources fetched, and they are
  warmed up at mount via the `$effect(() => { if (settings.soundEnabled) preloadDrawSounds(); })`
  in `DrawingCanvas.svelte`. On a slow link this download contends for bandwidth with
  the assets the canvas (the LCP element) needs, inflating LCP to 5.4 s. Sound is not
  needed until the first stroke. Defer `preloadDrawSounds()` until after first paint —
  e.g. `requestIdleCallback` (with a `setTimeout` fallback), or trigger it on the first
  `pointerdown` — so the audible-first-stroke guarantee is kept without blocking load.

- [ ] **[Performance] Add long-cache headers for static media assets** — File(s): `netlify.toml`
  `netlify.toml` only sets `Cache-Control: immutable` for `/*.js` and `/*.css` (and
  hashed `/_app/immutable/*` via `web/build/_headers`). The non-hashed static media —
  `/sounds/*.mp3`, `/styles/*.webp`, `/icons/*.webp`, and the PWA PNG icons — ship with
  **no `Cache-Control`**, so repeat visits refetch them. (Lighthouse's "efficient cache
  lifetimes" finding also fires because `vite preview` sets no headers locally, but the
  gap for these unhashed paths is real in production.) Add `[[headers]]` rules giving
  `/sounds/*`, `/styles/*`, and `/icons/*` a long `max-age`. These assets are content-
  stable but *not* content-hashed, so prefer `max-age=604800` (a week) + revalidation
  over `immutable`, or hash them, so a future asset swap isn't cached forever.

- [ ] **[Performance] Lazy-load the offscreen brush-style thumbnails** — File(s): `web/src/lib/components/AiImagePrompt.svelte`
  Eight `/styles/*.webp` texture thumbnails (~83 KB total) are fetched during initial
  load but are offscreen — they only appear inside the AI-image style picker
  (`<img class="ai-style-thumb" src="/styles/{s}.webp">`). Add `loading="lazy"` to the
  `<img>` tags (and/or only render them once the picker is opened) so they don't compete
  with the canvas for the throttled connection at first paint.

- [ ] **[Performance] Shrink the load-time main-thread work blocking the canvas paint** — File(s): `web/src/lib/components/DrawingCanvas.svelte`, `web/src/lib/state/*.svelte.ts`
  LCP (the canvas) is 5.4 s on phone with 290 ms Total Blocking Time, 340 ms max-
  potential-FID, and 2.7 s of main-thread work — 749 ms Style & Layout + 650 ms Script
  Evaluation before the surface is ready. Profile mount with `npm run perf:web
  --device=phone` and split non-critical setup (sound context, plugin init such as
  `pencilEraser`, secondary `$effect` bridges) out of the first-paint path so the canvas
  reaches its final size/clear sooner. Deferring the sound preload (first item) will
  move part of this already.

- [ ] **[Performance] Trim unused CSS shipped in the initial bundle** — File(s): `web/src/lib/components/ErrorScreen.svelte`
  Lighthouse reports ~11 KB of unused CSS at load, dominated by the `.error-screen`
  rules from `ErrorScreen.svelte`, which is styled up-front but rarely rendered.
  Confirm the error UI is lazily imported (dynamic `import()` behind the error boundary)
  so its styles don't ship in the critical CSS for the happy path.

- [ ] **[Performance] Reduce the initial DOM size** — File(s): `web/src/lib/components/ColorPalette.svelte`, `web/src/lib/components/ActionsPanel.svelte`
  The page mounts **1176 DOM elements** with a max of **150 sibling children** (the
  color/tool palettes are the likely culprits), which lengthens Style & Layout. Check
  whether every swatch/tool node needs to exist at load or whether offscreen/secondary
  palettes can render on demand, and whether wrapper nesting (max depth 16) can be
  flattened.

- [ ] **[Accessibility] Reconsider or document `user-scalable=no` in the viewport meta** — File(s): `web/src/app.html`
  The only accessibility deduction (92, not 100) on both form factors is
  `[user-scalable="no"]` in `app.html`
  (`content="…, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"`), which blocks
  pinch-zoom. For a toddler drawing app this is almost certainly deliberate — pinch
  gestures would fight the drawing surface — but it's currently undocumented. Either
  add a code comment (and an ADR) recording it as an intentional tradeoff, or scope the
  zoom lock to the canvas element so the rest of the UI stays zoomable.
