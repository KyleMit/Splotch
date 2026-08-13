# Marketing-asset tooling

This capability drives the live app to generate the promotional image and the Google Play and App
Store screenshot sets. It owns marketing scene composition and source art while reusing the shared
browser gestures in `tools/app-driver/lib/app-driver.mjs`.

## Entry points

| Entry point                 | Public command                  | Output                              |
| --------------------------- | ------------------------------- | ----------------------------------- |
| `gen-promotional-image.mjs` | `npm run gen:promotional-image` | `web/static/large-image.png`        |
| `gen-store-assets.mjs`      | `npm run gen:store-assets`      | `store-assets/` screenshots/graphic |

The output filename `large-image.png` remains unchanged because it is both the Google Play feature
graphic and the social/link-preview image. The generator replays `assets/promotional-image.svg`;
renaming the source makes its broader purpose explicit without changing the shipped artifact.

## Promotional image

`gen-promotional-image.mjs` parses the source SVG into palette-mapped strokes, drives them through
the real app canvas, and captures the 1920×1080 PNG. The Open Graph and Twitter metadata in
`web/src/app.html` depend on those dimensions, with `web/tests/page.spec.ts` guarding agreement. The
command replaces the committed PNG only after the live-app replay succeeds.

## Store assets

`gen-store-assets.mjs` captures the named phone and tablet scenes at the exact Google Play and App
Store pixel sizes and writes them under `store-assets/`. Existing scene selectors, optional scene
filtering, filenames, dimensions, and output layout remain stable during the tools migration. See
`store-assets/README.md` for the review and publishing runbook.

## Prerequisites and failure behavior

Both commands need installed project dependencies, Playwright Chromium, and port 4173 free or
already serving Splotch. They start or reuse the dev server through the shared app driver. A server,
browser, selector, scene, source-art, or output-write failure exits nonzero; inspect the named scene
and run `npm run test:driver:smoke` before retrying a full capture.

## Maintenance

Keep source SVG and scene composition here. Shared selectors, browser lifecycle, gestures, and
stroke geometry belong in `app-driver/`; named store-drawing instructions belong in
`store-drawings/`. When changing the promotional dimensions, update the social metadata and its E2E
guard in the same change. When changing store scenes or filenames, update `store-assets/` guidance
and listing documents together.

Run focused verification with:

```sh
npm run test:driver:smoke
npm run gen:promotional-image
npm run gen:store-assets
```
