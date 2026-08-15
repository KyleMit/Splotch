# Marketing-asset tooling

This capability drives the live app to generate the promotional image and the Google Play and App
Store screenshot sets. It owns marketing scene composition and source art while reusing the shared
browser gestures in `tools/app-driver/lib/app-driver.mjs`.

## Entry points

| Entry point                 | Public command                  | Output                              |
| --------------------------- | ------------------------------- | ----------------------------------- |
| `gen-promotional-image.mjs` | `npm run gen:promotional-image` | `web/static/large-image.png`        |
| `gen-store-assets.mjs`      | `npm run gen:store-assets`      | `store-assets/` screenshots/graphic |

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

`gen-store-assets.mjs` drives the app scenes (hero drawing, book grid, magic reveal, Parent Center)
per store target and composes each capture into its captioned marketing frame at the exact Google
Play and App Store pixel sizes under `store-assets/`. The frame design system — per-target geometry,
page copy, crayon-doodle marks, and the composed page-4 AI showcase — lives in
`lib/store-frames.mjs`. `--target` / `--page` substring filters narrow a run for iteration. See
`store-assets/README.md` for what each page shows and the publishing runbook.

## Prerequisites and failure behavior

Both commands need installed project dependencies, Playwright Chromium, and port 4173 free or
already serving Splotch. `gen-promotional-image.mjs` starts or reuses a dev server;
`gen-store-assets.mjs` needs a **production preview** (the coloring-pack manifest and the
dev-harness seam its scenes depend on), so with the port free it runs
`PUBLIC_ENABLE_DEV_HARNESS=true npm run build` and serves the result with `vite preview` — a server
already on 4173 is trusted and reused. A server, browser, selector, scene, source-art, or
output-write failure exits nonzero; inspect the named scene and run `npm run test:driver:smoke`
before retrying a full capture.

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
