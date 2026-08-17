# Marketing-asset tooling

This capability drives the live app to generate the promotional image and the Google Play and App
Store screenshot sets. It owns marketing scene composition and source art while reusing the shared
browser gestures in `tools/app-driver/lib/app-driver.mjs`. The store-frame **design system** (page
copy, layout geometry, doodle marks, the AI showcase, the feature graphic) lives in the app as the
`/dev/store-frames` harness — `web/src/routes/dev/store-frames/lib/` — so frames are designed
against a hot-reloading page and this tooling only captures and screenshots.

## Entry points

| Entry point                 | Public command                           | Output                              |
| --------------------------- | ---------------------------------------- | ----------------------------------- |
| `gen-promotional-image.mjs` | `npm run gen:promotional-image`          | `web/static/large-image.png`        |
| `gen-store-assets.mjs`      | `npm run gen:store-assets` (+ `:frames`) | `store-assets/` screenshots/graphic |

The output filename `large-image.png` remains unchanged because it is the social/link-preview image
served from `web/static/` for Open Graph and Twitter cards. The generator replays
`assets/promotional-image.svg`; renaming the source makes its broader purpose explicit without
changing the shipped artifact. The separate Google Play feature graphic is
`store-assets/feature-graphic.png`, owned by `gen-store-assets.mjs`.

## Promotional image

`gen-promotional-image.mjs` parses the source SVG into palette-mapped strokes, drives them through
the real app canvas, and captures the 1920×1080 PNG. The Open Graph and Twitter metadata in
`web/src/app.html` depend on those dimensions, with `web/tests/page.spec.ts` guarding agreement. The
command replaces the committed PNG only after the live-app replay succeeds.

## Store assets

`gen-store-assets.mjs` runs two stages per store target (Google Play phone/tablet, App Store iPhone
6.9"/iPad 13"):

1. **Capture** — drives the app scenes (hero drawing, book grid, magic scribble reveal, Tool Drawer)
   at the capture viewport `frameGeometry` computes and writes each app screenshot to
   `store-assets/captures/<target>/<page>.png`. The captures are **committed intermediates**: the
   harness and the render stage read them from disk, so frame iteration never re-drives the app.
2. **Render** — screenshots `/dev/store-frames/render?target=…&page=…` (and `?page=feature-graphic`)
   at each slot's exact store pixel size into `store-assets/`, waiting on the page's
   `data-render-state` signal.

`npm run gen:store-assets:frames` (`--frames-only`) skips stage 1 and re-renders everything from the
committed captures — the fast path after copy or layout changes. `--target` / `--page` substring
filters narrow a run for iteration. The magic scene's seeded scribble paths live in
`tools/store-drawings/lib/magic-scribbles.mjs`. See `store-assets/README.md` for what each page
shows and the publishing runbook.

## Prerequisites and failure behavior

Both commands need installed project dependencies, Playwright Chromium, and the serving port
(`--port`, default 4173) free or already serving **this checkout**. `gen-promotional-image.mjs`
starts or reuses a dev server; `gen-store-assets.mjs` needs a **production preview** (the
coloring-pack manifest and the dev-harness seam its scenes depend on), so with the port free it runs
`PUBLIC_ENABLE_DEV_HARNESS=true npm run build` and serves the result with `vite preview` (the
preview process also gets `PUBLIC_ENABLE_DEV_HARNESS=true`, opening the server-side gate on
`/dev/store-frames`). A server already on the port is reused only after the harness's
`/dev/store-frames/identity` route confirms it serves this checkout's repo root — the frames render
from the server's components, so a stale server or a concurrent worktree's would otherwise write
another branch's frame design into this checkout's finals; any other responder fails the run with
instructions to stop it or pass `--port`. A server, browser, selector, scene, source-art,
render-route, or output-write failure exits nonzero; a missing-capture failure under `--frames-only`
names the capture files to regenerate. Inspect the named scene and run `npm run test:driver:smoke`
before retrying a full capture.

## Maintenance

Keep scene composition and promotional source SVG here; keep frame design (copy, geometry, marks,
type/chip scales, showcase, feature graphic) in `web/src/routes/dev/store-frames/lib/`, where
`geometry.test.ts` pins the capture/frame geometry the committed sets were rendered with. Shared
selectors, browser lifecycle, gestures, and stroke geometry belong in `app-driver/`; named
store-drawing instructions belong in `store-drawings/`. When changing the promotional dimensions,
update the social metadata and its E2E guard in the same change. When changing store scenes, frames,
or filenames, update `store-assets/` guidance and listing documents together, and rerun the full
`gen:store-assets` so captures and finals stay in step.

Run focused verification with:

```sh
npm run test:driver:smoke
npm run gen:promotional-image
npm run gen:store-assets
```
