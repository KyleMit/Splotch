# Coloring-outline vector pilot

Run 2026-08-19 against four initial production Vectorizer.AI traces, followed by the 96-page pen and
96-page chalk campaigns on 2026-08-20. This directory commits the raw and optimized keeper SVGs,
reproducible offline measurements, and browser compatibility results. The watermarked
discovery/rehearsal traces and generated PNG comparison sheets remain under the gitignored
`vectorized/pilot/` workspace. Circle and Owl seeded the completed light-overlay catalog; Owl also
seeded the completed dark-overlay catalog recorded by ADR-0129.

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
| Fairy wide pen  |     113.9 / 165.6 KB | 79.1 KB |    29.8 KB |         97.36% |             1.08/255 |

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

The two initial pen keepers sit near the 3rd and 70th percentiles of the 96 pen sources. The five
densest pen sources are wide; `creatures/fairy-wide.outline.webp` is the maximum at 181.5 KB. A free
test-mode trace rehearsed the production parameters and post-processor on that source without
charging a credit. Its watermark was woven into 1,186 traced shapes and dominated the 963.7 KB raw /
538.3 KB optimized result, confirming that test mode cannot predict production size or fidelity. The
paid Fairy result passed the dense-wide gate at 79.1 KB raw, 33.6 KB gzip, 97.36% binary ink IoU,
and 1.08/255 composite mean error.

The paid dense-wide chalk gate used `creatures/fairy-wide.chalk.webp`. Its keeper is 83.5 KB raw and
35.8 KB gzip versus 76.9 KB compact or 84.0 KB full WebP, with 96.96% binary ink IoU and 1.83/255
mean alpha error. It is 8.6% larger than compact for native, but the completed 96-page catalog is
11.6% smaller in aggregate raw bytes; web transfer is 61.3% smaller than compact after gzip.

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
Chromium and WebKit. The dense Fairy SVG decoded/drew-and-exported in 1.4/8.2 ms in Chromium and
3/16 ms in WebKit, versus 4.8/10.9 ms and 6/18 ms for its full WebP.

| Engine   | Format | Median decode | Median draw + PNG export |
| -------- | ------ | ------------: | -----------------------: |
| Chromium | SVG    |    0.5–0.9 ms |               4.8–6.5 ms |
| Chromium | WebP   |    2.9–3.7 ms |               7.3–9.2 ms |
| WebKit   | SVG    |        1–2 ms |                 14–15 ms |
| WebKit   | WebP   |        5–6 ms |                 13–16 ms |

Both engines reported the expected intrinsic dimensions after the serialization correction and
successfully drew/exported every SVG. The dense chalk Fairy measured SVG/WebP decode at 1.3/3.7 ms
in Chromium and 3/7 ms in WebKit; draw plus PNG export measured 8.9/9.4 ms and 17/17 ms. SVG decode
was consistently faster, while draw plus export was faster or equal. This is a compatibility and
micro-performance signal, not a replacement for the physical-iPad selection-frame gate after app
integration. Regenerate it with:

```bash
node tools/vectorize/pilot/check-browser.mjs
```

The final dense Train-wide chalk gate measured SVG/WebP decode at 0.8/3.3 ms in Chromium and 2/5 ms
in WebKit; draw plus PNG export measured 7.1/7.9 ms and 14/13 ms. Both formats reported the expected
1536×1024 intrinsic dimensions. Run this comparison before removing the redundant runtime WebPs;
after removal, fidelity remains repeatable from the retained authoring sources while the committed
browser report preserves the format comparison.

The completed dark catalog's trusted physical-iPad action sweep passed both theme switches and the
coloring-book open and page-selection gates. Opening measured 14 ms first-frame P95, 17 ms
post-action frame P95, and 22 ms maximum; selection measured 18 ms, 20 ms, and 20 ms respectively.
Screenshot export measured 1 ms and 17 ms at P95 and 34 ms maximum, missing the strict 33.5 ms
report-only maximum by 0.5 ms. The broader Settings and clear rows retained their pre-existing
global frame-gate failures, so those rows are not evidence of a vector regression or approval.

## Cost

The initial pilot charged 4.0 credits. The completed pen campaign reused Circle and Owl and charged
94 additional credits. The dark campaign reused Owl chalk and charged 95 credits for 96 outputs. The
final 13 traces consumed 13 credits from a 50-credit replenishment, leaving 37.9 credits.
Per-response credit headers can lag the account balance; campaign planning and the final record use
a fresh `npm run vectorize -- --account` query.

## Verdict

The complete 96-page pen and 96-page chalk catalogs proceed as canonical SVG. Raster fills and cover
masters/thumbnails remain; page raster authoring masters and page-overlay WebPs do not.
