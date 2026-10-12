# Crayon reference art

A scratch generator that produces **acceptance-criteria reference images** for the new crayon brush
mode: AI-drawn pictures of what a real waxy crayon stroke should look like, built up stage by stage
so the brush's behavior can be measured against them.

This is **not** part of the shipping asset pipeline (`docs/pipeline.md`) — the outputs are committed
reference art, published under
[`scrapbook/crayon-brush-samples/`](../../../scrapbook/crayon-brush-samples/) (GitHub Pages:
<https://kylemit.github.io/Splotch/crayon-brush-samples/>).

## The stages

The progressive groups are declared in `lib/sample-catalog.mjs`'s `STAGES`; the generated contact
sheet displays them for review.

## Regenerating

Needs `GEMINI_API_KEY` (real API cost — manual only, never in CI). Run from this folder:

```bash
node --experimental-strip-types --disable-warning=ExperimentalWarning gen-reference-images.mjs # generate every sample (or pass id prefixes, e.g. `2- 3-`)
node convert-images-to-webp.mjs                                                        # downsize the raw JPGs to committed webp (max 1024px, q80)
node gen-reference-sheet.mjs                                                           # rebuild the contact sheet index.html
npm --prefix ../../.. run scrapbook:index                                     # refresh the scrapbook landing card
```

* `lib/sample-catalog.mjs` — the sample specs (id, label, prompt). Add or tweak a mark here; every
  prompt shares one `BASE` so the whole set reads as one consistent material.
* `gen-reference-images.mjs` — text-to-image driver (Gemini `gemini-3.1-flash-image`), writes
  straight into the scrapbook folder.
* `convert-images-to-webp.mjs` — one-time downsize of the ~750 KB JPGs to ~50 KB webp.
* `gen-reference-sheet.mjs` — assembles the images into the stage-grouped, self-contained contact
  sheet using the shared `/scrapbook` chrome (`tools/scrapbook/lib/scrapbook-chrome.mjs`). Pass
  `--artifact=<path>` to also emit a body-only fragment for the Claude Artifact tool (which supplies
  its own page skeleton).

## Comparing against the shipping brush

The committed [`vs-current.html`](../../../scrapbook/crayon-brush-samples/vs-current.html) puts each
acceptance scene side by side with the real ADR-0065 renderer and names the visual gap per scene
(first built for the 2026-07 re-architecture study). To refresh it after a brush change:

```bash
# 1. Serve the production build with the dev harness unlocked (vite dev won't do:
#    /dev/engine SSR currently 500s there — its `window` read survives only in the
#    minified build).
npm --prefix ../../.. run build
PUBLIC_ENABLE_DEV_HARNESS=true npm --prefix ../../.. run preview -- --port 4188

# 2. Re-capture the scenes and rebuild the sheet (no API key needed).
node capture-current-brush.mjs --url=http://localhost:4188
node gen-comparison-sheet.mjs
```

* `capture-current-brush.mjs` — drives the crayon brush through each reference mark on `/dev/engine`
  (Playwright, synthetic strokes) and screenshots into the gitignored `screenshots/crayon-current`.
* `gen-comparison-sheet.mjs` — pairs those captures with the reference images into the
  self-contained `vs-current.html`. Same `--artifact=<path>` fragment option as
  `gen-reference-sheet.mjs`.
