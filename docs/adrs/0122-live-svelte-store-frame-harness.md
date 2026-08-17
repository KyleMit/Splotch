# ADR-0122: Store-Screenshot Frames Are Live Svelte Components Behind a Dev Harness

**Status:** Active **Date:** 2026-08

## Context

The store screenshots (Google Play + App Store, five marketing pages × four device slots, plus the
Play feature graphic) were produced by `tools/marketing-assets/lib/store-frames.mjs`: a 650-line
module that assembled each frame as a template-string HTML document — its own `@font-face` with a
base64-inlined Quicksand, hand-rolled ink/gradient tokens, per-value `Math.round(v * k)` scaling —
which `gen-store-assets.mjs` loaded via `page.setContent()` and screenshotted.

Iterating on the frame design meant editing the template string, re-running the generator (which
rebuilds the app, boots a preview server, and re-drives every app scene), and opening the output
PNGs. The 2026-08 portrait refresh made the cost concrete: doodle-mark positions were measured off
reference renders by hand, and the `--target`/`--page` filters exist purely to shorten that loop.
More rounds of design iteration were planned.

Two facts shaped the solution space. The frames were *already* browser-rendered HTML — the change is
where the markup lives and how it gets its inputs, not the rendering model. And the app captures
inside the frames cannot come from a static page: they are real Playwright gesture sessions (drawing
the hero art, opening dialogs, seeding settings), which no live page can replay.

## Decision

The frame design system moves into the app as the **`/dev/store-frames` harness**
(`web/src/routes/dev/store-frames/`), gated like every other dev route by `routes/dev/+layout.ts`
(404 in production, dropped from the native export). The generator keeps the capture stage and
shrinks its render stage to screenshotting the harness:

* **Spec modules are shared, not duplicated.** `lib/targets.ts`, `geometry.ts`, `pages.ts`, and
  `paths.ts` are imported both by the Svelte components and by `gen-store-assets.mjs` (which already
  runs under `node --experimental-strip-types`), so slot sizes, frame geometry, page copy, and URL
  vocabulary have one source. These modules use relative imports only — no `$lib` alias — because
  Node resolves them without a bundler. `geometry.test.ts` pins `frameGeometry`'s exact output per
  slot to the values the committed sets were rendered with.
* **App captures are committed intermediates.** The capture stage writes each app screenshot to
  `store-assets/captures/<target>/<page>.png`. The harness reads them from disk through a dev-gated
  `assets/[...file]` endpoint that serves a **closed map** of repo files (captures, the AI-showcase
  pair from `scrapbook/model-eval/`, the Play icon) — no path outside the map is reachable.
* **The render stage screenshots the route.** `render/+page.svelte` renders exactly one composition
  at its exact store pixel size and reports `data-render-state` (fonts loaded, every image decoded,
  or an explicit error) so the generator waits on a signal instead of `networkidle` + sleep.
  `--frames-only` / `npm run gen:store-assets:frames` re-renders every final from the committed
  captures without driving the app — a copy tweak no longer costs a single app boot.
* **The port is faithful, not restyled.** The components keep the per-value `Math.round(v * k)`
  scaling as inline-computed custom properties rather than switching to one CSS
  `transform: scale(k)`: the capture must map into the frame slot pixel-for-pixel, and the committed
  sets were rendered under per-value rounding. A pixel diff against the committed screenshots
  verified alignment (differences confined to text antialiasing — the fonts now come from the app's
  own `@fontsource-variable/quicksand` pipeline — and canvas stroke AA).

## Alternatives considered

* **Keep the HTML in `tools/` and add a static preview server.** Rejected: it duplicates what
  `vite dev` already does (HMR, the app's font/token pipeline) and leaves the frame tokens forked
  from the design system they visually imitate.
* **Iframe the live app inside the harness instead of committing captures.** Rejected: the scenes
  are gesture sessions (canvas strokes, dialog choreography, `localStorage` seeding) — replaying
  them client-side means rebuilding the app driver in the page. Committed captures keep the
  capture/present seam where the complexity already lives.
* **Serve captures from `web/static/`.** Rejected: everything under `web/static/` ships in the web
  build and both native bundles; marketing intermediates would bloat the PWA precache manifest. The
  gated endpoint costs nothing in production (the dev-harness gate 404s before any file I/O).

## Consequences

* Frame design iterates against a hot-reloading page (`/dev/store-frames` shows every page per slot,
  scaled), with real captures in place; `gen:store-assets:frames` turns the result into store-ready
  finals in seconds rather than a full capture run.
* `store-assets/captures/` adds ~16 committed PNGs that change whenever scenes change — the price of
  frame iteration that never re-drives the app, in a repo that already commits the 26 finals.
* The frame components ride the app's design infrastructure (Quicksand via fontsource, `paletteHex`
  as typed labels), so the feature graphic now renders genuine Quicksand — the old
  `local('Quicksand')` declaration silently fell back to system fonts in headless Chromium.
* The dev-harness surface grows a server route with `node:fs` access. It is gated, reads only a
  closed file map, and resolves paths relative to `process.cwd()` — which is `web/` under both
  `vite dev` and `vite preview`, the only servers that can open the gate with the filesystem
  present.
* `tools/marketing-assets/` still owns scene composition and the app-driving loop; a change to app
  markup or drawer mechanics still rots the driver silently, and `test:driver:smoke` remains the
  guard (this ADR does not change that seam).
