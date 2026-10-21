# Marketing-asset tooling

This capability drives the live app to generate the promotional image and the Google Play and App
Store screenshot sets. It owns marketing scene composition and source art while reusing the shared
browser gestures in `tools/app-driver/lib/app-driver.mjs`. The store-frame **design system** (page
copy, layout geometry, doodle marks, the AI showcase, frame tokens) is framework-free data in
`web/src/lib/storeFrames/`; `lib/store-frame-document.mjs` lays it out as one self-contained HTML
document per composition, and `lib/share-card-document.mjs` does the same for the standalone pages'
link-preview cards. Both open through `lib/static-document.mjs`, which answers the page and a closed
map of repo files from memory, so neither needs a server or a framework.

## Entry points

| Entry point                 | Public command                           | Output                                          |
| --------------------------- | ---------------------------------------- | ----------------------------------------------- |
| `gen-share-cards.mjs`       | `npm run gen:share-cards`                | `web/static/share/*.png` + hash/provenance JSON |
| `gen-promotional-image.mjs` | `npm run gen:promotional-image`          | `web/static/large-image.png`                    |
| `gen-store-assets.mjs`      | `npm run gen:store-assets` (+ `:frames`) | `store-assets/` screenshots/graphic             |
| `gen-readme-hero.mjs`       | `npm run gen:readme-hero`                | `docs/assets/readme-hero.webp`                  |

The output filename `large-image.png` remains unchanged because it is the social/link-preview image
served from `web/static/` for Open Graph and Twitter cards. The generator replays
`assets/promotional-image.svg`; renaming the source makes its broader purpose explicit without
changing the shipped artifact. The separate Google Play feature graphic is
`store-assets/feature-graphic.png`, owned by `gen-store-assets.mjs`.

## Promotional image

`gen-promotional-image.mjs` parses the source SVG into palette-mapped strokes, drives them through
the real app canvas, and captures the 1920×1080 PNG. The Open Graph and Twitter metadata in
`web/src/app.html` depend on those dimensions, with `e2e/specs/page.spec.ts` guarding agreement. The
command replaces the committed PNG only after the live-app replay succeeds. Like the store-drawings
compiler, it fails before driving the app on SVG input the replay cannot reproduce: an unmapped
stroke color, a fill or caps and joins that are not round, a path other than one `M` followed by `L`
segments, an element other than `svg`, `g`, `path`, or `circle`, an unlisted attribute such as
`transform`, or a malformed document. A mapped swatch that the 1280×720 viewport hides fails the
replay instead of painting in the previous color.

## README hero

```sh
npm run gen:readme-hero -- --port 5199
# Preview without replacing the README asset:
npm run gen:readme-hero -- --port 5199 --out screenshots/readme-hero.webp
```

The portrait phone replays `tools/store-drawings/samples/balloon-tall.svg`; the landscape tablet
replays `dinosaur-wide.svg` from the same directory. Both use their named functions from
`tools/store-drawings/generated/store-drawings.mjs` through the live drawing engine (ADR-0122).
After editing either SVG, run `npm run gen:store-drawings` before recapturing.

The generator starts its own dev server and refuses an occupied port; choose an unused `--port` when
another worktree is running. It needs installed project dependencies and Playwright Chromium. Once
the port answers it proves, by the listener's pid, that the server it started is the one answering
(an answer alone says nothing about which checkout serves it), then captures each drawing at 2×
resolution, checks for ink, and uses Sharp to compose a transparent WebP. The generic device frames
share one outer-height constant and align at their top and bottom edges. The app's home icon sits
below the phone screen and to the right of the tablet screen. Frame geometry and art insets live in
`gen-readme-hero.mjs`. Each capture uses a fresh context with the app's default settings: AI Art
stays disabled until a parent opts in, so the hero has no AI wand or free-generation badge.

The browser and owned server are closed on success or failure. The output is replaced atomically
only after both captures and composition succeed. Raw screenshots stay in memory. Review the final
image at README display size after regenerating it; update the README alt text if the subjects
change. This is an on-demand command, not a build hook.

## Store assets

`gen-store-assets.mjs` runs two stages per store target (Google Play phone/tablet, App Store iPhone
6.9"/iPad 13"):

1. **Capture** — drives the app scenes (hero drawing, book grid, magic scribble reveal, Tool Drawer)
   at the capture viewport `frameGeometry` computes and writes each app screenshot to
   `store-assets/captures/<target>/<page>.png`. The captures are **committed intermediates**: the
   render stage reads them from disk, so frame iteration never re-drives the app.
2. **Render** — screenshots each composition's document (`storeFrameDocument(target, page)`, and
   `featureGraphicDocument()`) at each slot's exact store pixel size into `store-assets/`, once
   Quicksand's weights have loaded and every image has decoded. A file the document names and the
   map does not hold fails the render rather than shooting a frame with a hole in it.

`npm run gen:store-assets:frames` (`--frames-only`) skips stage 1 and re-renders everything from the
committed captures with no build and no server, in seconds — the iteration loop after copy or layout
changes. `--target` / `--page` substring filters narrow a run for iteration. The magic scene's
seeded scribble paths live in `tools/store-drawings/lib/magic-scribbles.mjs`. See
`store-assets/README.md` for what each page shows and the publishing runbook.

## Prerequisites and failure behavior

The promotional and store commands need installed project dependencies and Playwright Chromium.
`gen-promotional-image.mjs` always starts its own dev server, on port 4173 or on an OS-assigned port
when 4173 is in use. The capture stage of `gen-store-assets.mjs` needs its serving port (`--port`,
default 4173) free, and a **production preview** (the coloring-pack manifest and the dev-harness
seam its scenes depend on), so it runs `PUBLIC_ENABLE_DEV_HARNESS=true npm run build` and serves the
result with `vite preview`. The flag matters to capture mode (`web/src/lib/storeCapture.ts`,
[ADR-0123](../../docs/adrs/0123-capture-mode-flag-for-store-screenshots.md)): it is a compile-time
literal, so a bundle built **without** it still drives every scene and still puts the wand button's
free-generation count back into each capture — the one failure here that reports success. A port
something already holds fails the run before the build, and the run proves by pid that the answering
listener is the preview it started: a stale server or a concurrent worktree's would otherwise put
another branch's app into this checkout's captures. A server, browser, selector, scene, source-art,
document, or output-write failure exits nonzero; a missing-capture failure under `--frames-only`
names the capture files to regenerate. Inspect the named scene and run `npm run test:driver:smoke`
before retrying a full capture.

## Maintenance

Keep scene composition, promotional source SVG and the documents' layout here; keep frame design
data (copy, geometry, marks, type/chip scales, showcase) in `web/src/lib/storeFrames/`, where
`geometry.test.ts` pins the capture/frame geometry the committed sets were rendered with.
`tests/static-documents.test.mjs` holds every document to its slot's size and to files in its own
map. Shared selectors, browser lifecycle, gestures, and stroke geometry belong in `app-driver/`;
named store-drawing instructions belong in `store-drawings/`. When changing the promotional
dimensions, update the social metadata and its E2E guard in the same change. When changing store
scenes, frames, or filenames, update `store-assets/` guidance and listing documents together, and
rerun the full `gen:store-assets` so captures and finals stay in step.

Run focused verification with:

```sh
npm run test:driver:smoke
npm run gen:promotional-image
npm run gen:store-assets
```

Regenerate page share cards after changes to `lib/share-card-document.mjs`, the crayon palette,
handmade-paper texture, or card names. The generator waits for Quicksand and decodes the real paper
texture, checks that the card fills the image exactly and names its page, then captures 1200×630
PNGs at device scale 1. It compresses each PNG below 300 KB and records its first eight SHA-256 hex
digits in `shareCards.json` for scraper cache busting. After all captures succeed, it records the
producer-input digest in `shareCardInputs.json`; the tools guard detects changed names, rendering
sources, fonts, or texture since generation. This conservative input check complements image
inspection. The home promotional image is independent and remains unchanged.
