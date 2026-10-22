# Marketing-asset tooling

This capability renders store frames and standalone-page link-preview cards as self-contained HTML
compositions. `lib/static-document.mjs` answers each document and its closed map of repository files
from memory. Installed dependencies and Playwright Chromium are required; an application build and
server are unnecessary.

The frame design data—copy, layout geometry, doodle marks, AI showcase, and frame tokens—lives in
`web/src/lib/storeFrames/`. `lib/store-frame-document.mjs` lays out the store compositions;
`lib/share-card-document.mjs` lays out the link-preview cards.

## Entry points

| Entry point                          | Public command                    | Output                                            |
| ------------------------------------ | --------------------------------- | ------------------------------------------------- |
| `gen-share-cards.mjs`                | `npm run gen:share-cards`         | `web/static/share/*.png` and hash/provenance JSON |
| `gen-store-assets.mjs`               | `npm run gen:store-assets`        | Store screenshot frames and feature graphic       |
| `gen-store-assets.mjs --frames-only` | `npm run gen:store-assets:frames` | The same frame rendering from committed captures  |

The promotional-image and README-hero live generators retired with SvelteKit. Their committed art
remains available, but these commands do not recreate it. The source SVG under `assets/` remains
artwork, rather than an executable capture recipe.

## Store frames

Both store commands read `store-assets/captures/<target>/<page>.png` and render final compositions
at each target's pixel size. They preserve those committed captures. A missing selected capture
fails before any browser starts or output is written.

```sh
npm run gen:store-assets:frames
npm run gen:store-assets -- --target tablet10 --page 03
```

`--target` and `--page` are substring filters. A full run also copies the Play tablet10 frames to
tablet7 and renders the feature graphic; a filtered run skips those full-set outputs. The
`--frames-only` switch remains an alias for the generator's sole retained operation.

The renderer waits for Quicksand's required weights and every image to decode before taking each
screenshot. A document that names a file outside its supplied file map fails. Browser and context
cleanup runs on success and failure.

The captures preserve the former frontend's scenes. Refreshing a frame's typography or copy does not
recapture the React Native app or establish that a listing matches the current release. See
[the store asset guide](../../store-assets/README.md) for the recorded scene matrix and release
review obligations.

## Link-preview cards

Regenerate page share cards after changing their document layout, names, palette, fonts, or paper
texture:

```sh
npm run gen:share-cards
```

The generator loads Quicksand and the native app's paper texture, verifies that each card fills its
image and names its page, then captures the configured card dimensions at device scale 1. It
compresses the PNGs and records content hashes in `shareCards.json` for scraper cache busting. After
all captures succeed, `shareCardInputs.json` records the producer-input digest. The input hash
includes the source file paths and bytes, so moving an identical input also requires a provenance
refresh. The independent home promotional image remains a committed asset.

## Maintenance

Keep composition layout and static-document loading here, frame design data in
`web/src/lib/storeFrames/`, and offline drawing conversion in `tools/store-drawings/`. Capture
changes must include reviewed image files whose dimensions match `frameGeometry`; changing frame
copy or rerunning the renderer cannot repair a missing or stale application capture.

Focused checks cover required captures, output dimensions, and documents' file maps:

```sh
npm run test:tools -- tools/marketing-assets/tests
```
