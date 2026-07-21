# crayon-brush-samples — reference art for the crayon brush mode

A scratch generator that produces **acceptance-criteria reference images** for the new crayon brush
mode: AI-drawn pictures of what a real waxy crayon stroke should look like, built up stage by stage
so the brush's behavior can be measured against them.

This is **not** part of the shipping asset pipeline (`docs/pipeline.md`) — the outputs are committed
reference art, published under
[`artifacts/crayon-brush-samples/`](../../../artifacts/crayon-brush-samples/) (GitHub Pages:
<https://kylemit.github.io/Splotch/crayon-brush-samples/>).

## The stages

The set is progressive, mirroring how a toddler builds a mark up (ids are prefixed by stage):

| Prefix | Stage                    | What it pins down                                                       |
| ------ | ------------------------ | ----------------------------------------------------------------------- |
| `1-`   | Single lines             | One straight crayon stroke per color — the baseline grainy waxy mark    |
| `2-`   | Same-color overdraw      | Drawing back over a stroke → visible buildup (darker, denser, opaque)   |
| `3-`   | Different-color overdraw | One color layered over another → partial wax mixing at the crossing     |
| `4-`   | Scribble types           | Back-and-forth fills, circles, zigzags, hatching, loops, spirals, dots  |
| `5-`   | Fills & swatches         | Area coverage at different pressures, blended gradients                 |
| `6-`   | Macro close-ups          | Deposit physics at tooth scale — thickness → value, directional streaks |

## Regenerating

Needs `GEMINI_API_KEY` (real API cost — manual only, never in CI). Run from this folder:

```bash
node --experimental-strip-types --disable-warning=ExperimentalWarning gen.mjs        # generate every sample (or pass id prefixes, e.g. `2- 3-`)
node --experimental-strip-types --disable-warning=ExperimentalWarning to-webp.mjs    # downsize the raw JPGs to committed webp (max 1024px, q80)
node --experimental-strip-types --disable-warning=ExperimentalWarning build-sheet.mjs # rebuild the contact sheet index.html
npm --prefix ../../.. run artifacts:index                                             # refresh the artifacts landing card
```

* `samples.mjs` — the sample specs (id, label, prompt). Add or tweak a mark here; every prompt
  shares one `BASE` so the whole set reads as one consistent material.
* `gen.mjs` — text-to-image driver (Gemini `gemini-3.1-flash-image`), writes straight into the
  artifacts folder.
* `to-webp.mjs` — one-time downsize of the ~750 KB JPGs to ~50 KB webp.
* `build-sheet.mjs` — assembles the images into the stage-grouped, self-contained contact sheet
  using the shared `/artifacts` chrome (`scripts/lib/artifact-chrome.mjs`). Pass `--artifact=<path>`
  to also emit a body-only fragment for the Claude Artifact tool (which supplies its own page
  skeleton).

## Comparing against the shipping brush

The committed [`vs-current.html`](../../../artifacts/crayon-brush-samples/vs-current.html) puts each
acceptance scene side by side with the real ADR-0065 renderer and names the visual gap per scene
(first built for the 2026-07 re-architecture study). To refresh it after a brush change:

```bash
# 1. Serve the production build with the dev harness unlocked (vite dev won't do:
#    /dev/engine SSR currently 500s there — its `window` read survives only in the
#    minified build).
npm --prefix ../../.. run build
PUBLIC_ENABLE_DEV_HARNESS=true npm --prefix ../../.. run preview -- --port 4188

# 2. Re-capture the scenes and rebuild the sheet (no API key needed).
node capture-current.mjs --url=http://localhost:4188
node build-compare-sheet.mjs
```

* `capture-current.mjs` — drives the crayon brush through each reference mark on `/dev/engine`
  (Playwright, synthetic strokes) and screenshots into the gitignored `screenshots/crayon-current`.
* `build-compare-sheet.mjs` — pairs those captures with the reference images into the self-contained
  `vs-current.html`. Same `--artifact=<path>` fragment option as `build-sheet.mjs`.
