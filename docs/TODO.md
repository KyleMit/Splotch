# TODO

> Work through these items one at a time with `/fix-next-todo-manual`, or clear the whole list autonomously with `/fix-next-todo-auto`.
> After each fix: remove the completed item, run relevant type checks or tests, and suggest a commit message.
> Do **not** `git add` or `git commit` — the user reviews the diff first.

## Source: Lighthouse page-load audit (slow device + slow internet)

Two capture sets, both under Lighthouse's simulated **Slow 4G + 4× CPU** throttle
on two form factors (phone portrait 412×915, tablet landscape 1133×744). Raw HTML
reports are attached to the PR, not committed.

**Production (`https://splotch.art`, real Netlify serving)** — the authoritative
numbers, captured first-visit (cold cache) and repeat-visit (warm cache primed by a
prior load). Two audits so far (baseline, and a **2026-07-05 re-run** that confirmed
every finding still stands); columns below show the range across both where they
differ, illustrating `simulate`-mode variance:

| Run | Visit | Perf | FCP | LCP | TBT | Transfer |
| --- | --- | --- | --- | --- | --- | --- |
| Phone portrait | first | 84–91 | 1.1–1.3 s | 1.9–2.3 s | 360–560 ms | 713 KB |
| Phone portrait | repeat | 99–**100** | 1.0–1.2 s | 1.0–1.2 s | 80–120 ms | ~1–76 KB |
| Tablet landscape | first | 98–99 | 1.1 s | 1.5–1.8 s | 110–140 ms | 713 KB |
| Tablet landscape | repeat | 99–100 | 1.1 s | 1.1 s | 90–100 ms | ~68 KB* |

\* the only repeat-visit byte cost is the HTML document itself (`max-age=0,
must-revalidate`), which Chrome sometimes serves from cache and sometimes
re-downloads; every subresource is served from cache at 0 bytes on repeat.
Accessibility is device- and cache-independent (92 — see the viewport item below);
Best-Practices and SEO are 100 on production. The phone-first swing (Perf 84↔91,
TBT 360↔560 ms) is within the documented ±15-point `simulate` variance — a second
data point, not a regression.

The **LCP element is `<canvas#drawingCanvas>`** on every run. On real Netlify
(HTTP/2 + CDN) first-visit LCP is a healthy 1.9 s / 1.5 s — **much better than the
local `vite preview` run suggested** (that run scored Perf 73 / LCP 5.4 s, but its
HTTP/1.1 single-origin serving with no compression or multiplexing was the
bottleneck, not the app — a preview artifact, not a production problem). Treat the
production table above as the real baseline. Repeat visits are excellent (Perf
99–100) because all static subresources come from cache.

- [ ] **[Performance] Defer the pencil-sound preload off the load critical path** — File(s): `web/src/lib/components/DrawingCanvas.svelte`, `web/src/lib/audio/drawingSound.ts`
  The three `/sounds/pencil-*.mp3` files (119 KB each, **357 KB — half of the entire
  713 KB first-visit transfer**) are the largest resources fetched, warmed at mount via
  `$effect(() => { if (settings.soundEnabled) preloadDrawSounds(); })` in
  `DrawingCanvas.svelte`. They're not needed until the first stroke, yet they compete
  with the canvas for bandwidth on the initial load (first-visit only — on repeat visits
  they're cached). Defer `preloadDrawSounds()` until after first paint — e.g.
  `requestIdleCallback` (with a `setTimeout` fallback), or trigger it on the first
  `pointerdown` — keeping the audible-first-stroke guarantee without spending first-visit
  bandwidth on 357 KB before the canvas is up. Highest-value first-visit win.

- [ ] **[Performance] Give immutable static media a real cache lifetime (skip the revalidation round-trip)** — File(s): `netlify.toml`, `web/src/lib/audio/drawingSound.ts`, `web/src/lib/components/AiImagePrompt.svelte`
  Production serves `/sounds/*.mp3`, `/styles/*.webp`, and `/icons/*.webp` with
  `cache-control: public,max-age=0,must-revalidate` + an ETag (confirmed live: a
  conditional GET returns `304, 0 bytes`). So repeat visits don't re-download these
  bodies, but they **do** send a conditional request per asset and pay a round-trip for
  each 304 — on Slow 4G that's real latency for content that never changes. `netlify.toml`
  only grants long `immutable` caching to `/*.js` and `/*.css`; these media paths fall
  through to the `max-age=0` default. Fix by either (a) adding `[[headers]]` rules giving
  `/sounds/*`, `/styles/*`, `/icons/*` a long `max-age` (e.g. `604800`), or (b) better,
  content-hashing their filenames so they can be served `immutable` like `/_app/immutable/*`
  and swaps bust the cache automatically. (Lighthouse doesn't flag this — its cache audit
  treats `must-revalidate` as intentional — so it's an optimization, not a defect.)
  *Note: this corrects the earlier draft's "assets ship with no Cache-Control", which was
  a `vite preview` artifact — preview emits no headers; production does.*

- [ ] **[Performance] Lazy-load the offscreen brush-style thumbnails** — File(s): `web/src/lib/components/AiImagePrompt.svelte`
  Eight `/styles/*.webp` texture thumbnails (~83 KB total) are fetched on initial load
  but are offscreen — they only appear inside the AI-image style picker
  (`<img class="ai-style-thumb" src="/styles/{s}.webp">`). Add `loading="lazy"` to the
  `<img>` tags (and/or only render them once the picker opens) so they don't compete with
  the canvas on first visit. (Minor on production — it didn't surface as a scored
  opportunity there — but it's free first-visit bandwidth.)

- [ ] **[Performance] Shrink the load-time main-thread work (TBT / input readiness)** — File(s): `web/src/lib/components/DrawingCanvas.svelte`, `web/src/lib/state/*.svelte.ts`
  Even on production, phone first-visit **Total Blocking Time is 360 ms** and
  max-potential-FID is 280 ms (tablet: 140 ms / 250 ms) — the main thread is busy while
  the canvas comes up. Profile mount with `npm run perf:web --device=phone` and move
  non-critical setup (sound context, plugin init such as `pencilEraser`, secondary
  `$effect` bridges) off the first-paint path. Deferring the sound preload (first item)
  moves part of this already.

- [ ] **[Performance] Reduce the initial DOM size** — File(s): `web/src/lib/icons/splotchy.svg`, `web/src/lib/components/ColorPalette.svelte`, `web/src/lib/components/ActionsPanel.svelte`
  The page mounts **~1,288 DOM elements** (score 0), which lengthens Style & Layout. The
  2026-07-05 re-run pinned the two biggest structural culprits from the report's DOM node
  details: **inline SVG icons** dominate — the `splotchy.svg` logo alone is **255 vector
  nodes**, and the report's "Maximum Child Elements: 150" node is a single `<g stroke-width>`
  group (the logo). The color/tool palettes add the rest. Options: simplify/optimize
  `splotchy.svg` (run it through SVGO — 255 nodes is far more than a logo needs), reference
  the logo via `<img>`/`<use>` instead of inlining the full vector, and render
  offscreen/secondary palette swatches on demand rather than at mount. Also check whether
  wrapper nesting can be flattened.

- [ ] **[Performance] Trim unused CSS shipped in the initial bundle** — File(s): `web/src/lib/components/ErrorScreen.svelte`
  The preview run flagged ~11 KB of unused CSS at load, dominated by the `.error-screen`
  rules from `ErrorScreen.svelte`, which is styled up-front but rarely rendered. (Didn't
  surface as a scored opportunity on production, so low priority.) Confirm the error UI is
  lazily imported (dynamic `import()` behind the error boundary) so its styles don't ship
  in the critical CSS for the happy path.

- [ ] **[Accessibility] Reconsider or document `user-scalable=no` in the viewport meta** — File(s): `web/src/app.html`
  The only accessibility deduction (92, not 100) on both form factors is
  `[user-scalable="no"]` in `app.html`
  (`content="…, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"`), which blocks
  pinch-zoom. For a toddler drawing app this is almost certainly deliberate — pinch
  gestures would fight the drawing surface — but it's currently undocumented. Either
  add a code comment (and an ADR) recording it as an intentional tradeoff, or scope the
  zoom lock to the canvas element so the rest of the UI stays zoomable.
