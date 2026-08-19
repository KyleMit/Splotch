# ADR-0122: Store-Screenshot Frames Are Live Svelte Components Behind a Dev Harness

**Status:** Active **Date:** 2026-08

## Amendment (2026-08-19): hero drawings replay at the engine boundary

The free-draw hero scene now feeds the compiled store-drawing instructions through a dev-gated
engine API instead of reproducing them as Playwright pointer gestures. This changes only how the
authored strokes enter the app. `engine.ts` still creates the same dot/path operations, renders them
through the tiled renderer, and commits one history command per stroke; the screenshot still comes
from the live `/` route beneath its real palette, drawer, clear button, and settings button.

The seam lives in `web/src/lib/drawing/engine.ts`, not `/dev/engine`: the engine owns midpoint
smoothing, brush state, tiled rendering, and history, while the capture must run on the real drawing
route whose chrome is being photographed. `boot/devHarnessSeam.ts` publishes `window.__replayStroke`
only in development or a `PUBLIC_ENABLE_DEV_HARNESS=true` build. The release-seam scanner derives
that property name from the boot module and requires `replayHarnessStroke` to begin behind the
compile-time gate, so neither invocation path remains in a release bundle.

`tools/store-drawings/lib/drawing-instructions.mjs` remains the coordinate/replay owner. Its engine
path converts a possibly inset page-space scene box to canvas-local coordinates, expands every
segment to the same six samples Playwright's pointer path produces, holds the final endpoint once,
then makes one engine call per compiled stroke. The engine emits one path operation per sample, so
the renderer sees the same midpoint and anti-aliasing boundaries rather than one newly batched path.
Color tokens and the five-level width remain the compiled inputs; the final green palette click in
`sceneHero` still uses the real UI so the photographed selection ring is genuine.
`web/tests/store-drawing-replay.spec.ts` keeps the two delivery paths in lockstep with a small
three-stroke live-app comparison rather than paying the full hero's pointer cost in CI. Engine
replay also rejects eraser mode because the store instruction vocabulary does not include erasing
and that pointer lifecycle has additional width and empty-canvas behavior.

The production-build comparison used the actual portrait island and landscape dinosaur hero
captures:

| Hero      | Pointer draw | Engine draw | Draw speedup | Canvas soft-ink IoU | Pixels differing >8 RGB |
| --------- | -----------: | ----------: | -----------: | ------------------: | ----------------------: |
| Portrait  |     95.915 s |     0.186 s |       515.2× |          0.99997619 |  21 / 423,936 (0.0050%) |
| Landscape |    109.083 s |     0.249 s |       438.7× |          0.99997373 |  34 / 530,012 (0.0064%) |

Whole-scene wall time, including app boot, drawer expansion, the real final swatch click, settle,
and screenshot, fell from 102.725 s to 6.761 s in portrait and from 115.732 s to 6.889 s in
landscape. The full screenshots had zero portrait and one landscape pixel differing by more than 8
RGB levels. Static flake-surface accounting removed 1,377/1,845 mouse-move calls, 93/78 color or
size-control changes, and 342/414 fixed replay sleeps; the replacement performs 162/264 synchronous
engine calls with no replay sleeps.

Only `sceneHero` adopts this path. The books scene is a dialog/layout capture, the magic scene's
subject is the in-progress reveal caused by genuine stroke interaction, and the parent scene is a
settings-navigation capture. They remain app-driver flows because bypassing their gestures would
skip the behavior each screenshot claims to show. The general fidelity evaluator and brush review
also retain pointer replay: they exist to measure that boundary and review user-selectable brush
input, rather than to optimize release capture time.

Alternatives were rejected as follows:

* **Expose the `/dev/engine` harness API.** It has pixel readers useful to tests but does not render
  the real store chrome, so capturing there and compositing later would violate the honest-app-state
  requirement.
* **Replay the whole drawing in one batch call.** That would merge undo commands and path-operation
  boundaries, creating a state and rasterization pattern unlike the pointer result.
* **Keep hero pointer replay.** It was faithful, but the measured two-minute drawing cost and its
  selector/menu/sleep surface bought no visible fidelity over the engine result.

This amendment also narrows ADR-0109's invoke-handle rule: a harness-only engine transition is
allowed when its owner composes the same production renderer/history primitives from
production-reachable inputs, the resulting app state is user-reachable, and empirical comparison
guards against a shortcut that merely resembles that state.

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
(404 in production). The runtime gate alone is not enough for the native bundle —
`prerender =
false` drops a route's HTML but its client chunks still ship — so the `dev` route tree
joins `web/nativeExcludedRoutes.ts`: the Capacitor build blanks every `routes/dev/**` client module,
and `tools/mobile/check-static-bundle.mjs` scans the export for a sentinel derived from the store
pages' own copy. The generator keeps the capture stage and shrinks its render stage to
screenshotting the harness:

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
