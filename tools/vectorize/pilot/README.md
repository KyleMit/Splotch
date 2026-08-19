# Coloring-outline vector pilot

Run 2026-08-19 against four production Vectorizer.AI traces. This directory commits the raw and
optimized keeper SVGs, reproducible offline measurements, and browser compatibility results. The
watermarked discovery/rehearsal traces and generated PNG comparison sheets remain under the
gitignored `vectorized/pilot/` workspace.

The pilot is evidence for a later runtime integration; it does not change the coloring catalog or
serve SVGs to the app.

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
even though explicit-size Canvas drawing remained correct.

## Results

“Current” is compact/full runtime WebP bytes. The SVG columns are the single optimized asset that
would replace both tiers. Brotli uses quality 11. Fidelity rasterizes at canonical dimensions.

| Sample          | Current compact/full | SVG raw | SVG Brotli | Binary ink IoU | Composite mean error |
| --------------- | -------------------: | ------: | ---------: | -------------: | -------------------: |
| Farm cover      |        9.9 / 19.1 KB | 49.4 KB |    18.2 KB |         98.08% |             0.87/255 |
| Circle tall pen |       41.4 / 61.4 KB | 16.5 KB |     6.3 KB |         97.68% |             0.46/255 |
| Owl tall pen    |      72.5 / 105.0 KB | 39.8 KB |    15.3 KB |         97.91% |             0.71/255 |
| Owl tall chalk  |       55.1 / 70.7 KB | 43.5 KB |    16.8 KB |         97.47% |             0.73/255 |

The three page samples together fall from 169 KB of compact WebP or 237 KB of full WebP to 99.8 KB
of raw SVG. Brotli transfer is 38.4 KB: 77% below compact and 84% below full. Because one SVG also
replaces both committed overlay tiers, the sampled committed presentation bytes fall 75%.

The cover does not win as a runtime asset: its 240 px WebP is 9.9 KB versus 18.2 KB Brotli for the
SVG. Keep raster cover thumbnails.

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

Four production traces charged 4.0 credits. The confirmed account balance moved from 30.9 to 26.9.

## Verdict

Proceed with SVG for full-page pen/chalk runtime overlays, while retaining raster authoring sources,
fills, and picker/cover thumbnails. Before a catalog rollout, integrate a small runtime slice and
rerun the physical-iPad selection, theme, Magic reveal, rotation, and export gates.
