---
name: vectorize-image
description: Trace a bitmap (PNG/JPG/WebP/GIF/BMP) to clean vector art — SVG, PDF, EPS, DXF, or PNG — through the Vectorizer.AI API, with the credit budget guarded by a free test mode. Use when asked to vectorize, trace, or convert a raster image to SVG/vector, to turn a coloring outline or logo into scalable paths, or to call Vectorizer.AI at all. Covers auth, every API parameter, output options, errors, and the credit-cost model.
---

# Vectorize an image (Vectorizer.AI)

The tool lives in **`tools/vectorize/`** — a driver plus the inlined Vectorizer.AI documentation.
This skill is only the entry point; read the runbook before calling anything.

**Money is involved.** The account is a metered **50-credit** plan and a production trace costs **1
credit**, non-refundable. The driver defaults to Vectorizer.AI's **free** watermarked test mode,
which supports every parameter — so iterate there and pass `--production` exactly once, for the
keeper.

```bash
node tools/vectorize/vectorize.mjs <input> --out vectorized/out.svg   # free test mode
node tools/vectorize/vectorize.mjs --help                             # flags
node tools/vectorize/vectorize.mjs --account                          # remaining credits (free)
```

`<input>` is a file path, an `http(s)` URL, or `token:<image-token>`. Output defaults to the
gitignored `vectorized/`.

| Read this                                                                                   | For                                                                                                        |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`tools/vectorize/README.md`](../../../tools/vectorize/README.md)                           | **Start here.** Credentials, the credit rules, the flat-icon → transparent-SVG recipe, flag table, gotchas |
| [`tools/vectorize/docs/api.md`](../../../tools/vectorize/docs/api.md)                       | Every endpoint, parameter, response header, pricing row, rate-limit and timeout rule                       |
| [`tools/vectorize/docs/output-options.md`](../../../tools/vectorize/docs/output-options.md) | What each output option means — draw style, stacking, grouping, curves, gap filler                         |
| [`tools/vectorize/docs/errors.md`](../../../tools/vectorize/docs/errors.md)                 | Every HTTP status and error code, grouped by what to do about each                                         |

Three things the runbook will tell you that are easy to get wrong: results have **no centerline
tracing** (strokes come back as narrow filled shapes, never a single stroked path); the test-mode
watermark **consumes `processing.max_colors` slots**, so discover colors with `max_colors=0`; and
dropping a white background while keeping a near-white element is a **tolerance** calculation, not a
flag.
