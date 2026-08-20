# Coloring-outline vector pilot

Run 2026-08-19 against four production Vectorizer.AI traces. This directory commits the raw and
optimized keeper SVGs, reproducible offline measurements, and browser compatibility results. The
watermarked discovery/rehearsal traces and generated PNG comparison sheets remain under the
gitignored `vectorized/pilot/` workspace. The Circle portrait pen and Owl portrait pen/chalk keepers
also supply the deliberately small runtime slice recorded by ADR-0129.

## Keeper recipe

```text
processing.max_colors=2
processing.palette=#000000 ~ 0.05; #FFFFFF -> #00000000 ~ 0.05;
output.gap_filler.enabled=false
output.shape_stacking=stacked
output.group_by=none
```

Each keeper was optimized with SVGO 4.0.2. Canonical `width` and `height` attributes were restored
offline alongside the `viewBox`; without them both tested browsers reported a 100×150 intrinsic size
even though explicit-size Canvas drawing remained correct. `npm run vectorize:postprocess` now owns
that deterministic transformation, and its repo-script tests require committed Vectorizer SVGs to
stay at the same fixed point with intrinsic dimensions matching the `viewBox` (ADR-0044).

## Results

For pages, “current” is compact/full runtime WebP bytes. For the cover, it is the 240/400 px picker
thumbnail pair. The SVG columns are the single optimized asset tested against those display assets.
Brotli uses quality 11. Fidelity rasterizes at canonical dimensions.

| Sample          | Current compact/full | SVG raw | SVG Brotli | Binary ink IoU | Composite mean error |
| --------------- | -------------------: | ------: | ---------: | -------------: | -------------------: |
| Farm cover      |        9.9 / 19.1 KB | 49.4 KB |    18.2 KB |         98.08% |             0.87/255 |
| Circle tall pen |       41.4 / 61.4 KB | 16.5 KB |     6.3 KB |         97.68% |             0.46/255 |
| Owl tall pen    |      72.5 / 105.0 KB | 39.7 KB |    15.3 KB |         97.91% |             0.71/255 |
| Owl tall chalk  |       55.1 / 70.7 KB | 43.5 KB |    16.8 KB |         97.47% |             0.73/255 |

The three page samples together fall from 169 KB of compact WebP or 237 KB of full WebP to 99.7 KB
of raw SVG. Brotli transfer is 38.3 KB: 77% below compact and 84% below full. Because one SVG also
replaces both committed overlay tiers, the sampled committed presentation bytes fall 75%.

The cover comparison is intentionally thumbnail-sized: covers have no runtime overlay variant and
render only in the picker. The SVG beats the canonical 83.5 KB authoring outline at 49.4 KB raw, but
that is not a runtime replacement opportunity; the shipped 240 px thumbnail is 9.9 KB versus 18.2 KB
Brotli for the SVG. Keep raster cover thumbnails because resolution independence buys nothing in
their actual presentation path. The farm-cover production trace confirmed fidelity but could not
have changed that structural decision.

## Campaign split

The page samples do not justify treating pen and chalk as one homogeneous 192-trace batch. Raw SVG
size rises relative to source complexity, and chalk targets an already smaller raster overlay.

| Sample          |   Source | SVG raw | SVG/source | Saving vs compact tier |
| --------------- | -------: | ------: | ---------: | ---------------------: |
| Circle tall pen |  52.3 KB | 16.5 KB |      31.5% |                    60% |
| Owl tall pen    | 115.3 KB | 39.7 KB |      34.4% |                    45% |
| Owl tall chalk  |  96.7 KB | 43.5 KB |      45.0% |                    21% |

The two pen keepers sit near the 3rd and 70th percentiles of the 96 pen sources. All three page
keepers are tall, while the five densest pen sources are wide; `creatures/fairy-wide.outline.webp`
is the maximum at 181.5 KB. A free test-mode trace rehearsed the production parameters and
post-processor on that source without charging a credit. Its watermark was woven into 1,186 traced
shapes and dominated the 963.7 KB raw / 538.3 KB optimized result, so test mode cannot predict
production size or fidelity. The dense-wide production trace remains the paid pen-stage gate.

Chalk needs its own production re-gate. Extrapolating the owl-chalk ratio to the 165.7 KB
`creatures/fairy-wide.chalk.webp` yields roughly 74.6 KB raw SVG versus its 76.9 KB compact dark
overlay. Brotli should still help web transfer, but native ships canonical files without HTTP
compression. Stage pen first, then approve chalk only after a dense-wide production trace proves
native bytes and overlay/fill registration.

## Fidelity

Full composites and 2× retina crops were inspected for the cover, simple circle, dense owl pen, and
owl chalk. All shapes, stars, eye rings, catchlights, deliberate chalk whites, and line closures
survived. Differences are confined to antialiasing and subpixel edge placement. The SVGs are visibly
cleaner at 2×, but they are not pixel-identical replacements.

The PR links the generated `*.comparison.png` and `*.zoom-2x.png` sheets from the `pr-assets`
branch. `report.json` contains the full alpha/composite metrics. Regenerate both sets with:

```bash
node tools/vectorize/pilot/analyze-results.mjs
```

## Browser display/export check

Five image-decode plus full-size Canvas draw/export runs were sampled for each page asset in current
Chromium and WebKit.

| Engine   | Format | Median decode | Median draw + PNG export |
| -------- | ------ | ------------: | -----------------------: |
| Chromium | SVG    |    0.5–0.9 ms |               4.8–6.5 ms |
| Chromium | WebP   |    2.9–3.7 ms |               7.3–9.2 ms |
| WebKit   | SVG    |        1–2 ms |                 14–15 ms |
| WebKit   | WebP   |        5–6 ms |                 13–16 ms |

Both engines reported 1024×1536 intrinsic dimensions after the serialization correction and
successfully drew/exported every SVG. SVG decode was consistently faster; draw plus PNG export was
faster in Chromium and comparable in WebKit. This is a compatibility and micro-performance signal,
not a replacement for the physical-iPad selection-frame gate after app integration. Regenerate it
with:

```bash
node tools/vectorize/pilot/check-browser.mjs
```

## Cost

Four production traces charged 4.0 credits. The account was subsequently upgraded to a 200-credit
plan and reported 176.9 credits on 2026-08-19. Reusing the two pen keepers leaves 94 pen traces;
reusing the chalk keeper leaves 95 chalk traces. The pen stage is funded at that balance, while the
complete 189-trace remainder is short 12.1 credits. Re-query the balance before authorizing either
stage.

## Verdict

Proceed with SVG for full-page pen overlays and stage chalk behind a dense-wide production gate,
while retaining raster authoring sources, fills, and picker/cover thumbnails. The automated
post-processor and small runtime slice are in place; catalog rollout still requires the
physical-iPad selection, theme, Magic reveal, rotation, overlay/fill registration, offline-pack, and
export gates.
