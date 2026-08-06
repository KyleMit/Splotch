---
name: vectorize-image
description: Trace a bitmap (PNG/JPG/WebP/GIF/BMP) to clean vector art — SVG, PDF, EPS, DXF, or PNG — through the Vectorizer.AI API, with the credit budget guarded by a free test mode. Use when asked to vectorize, trace, or convert a raster image to SVG/vector, to turn a coloring outline or logo into scalable paths, or to call Vectorizer.AI at all. Covers auth, every API parameter, output options, errors, and the credit-cost model.
---

# Vectorize an image (Vectorizer.AI)

Vectorizer.AI traces a bitmap into filled vector shapes. The account this repo uses is a **metered
50-credit plan** — a production vectorization is **1 credit**, and credits do not come back. Read
[Credits — the one thing to get right](#credits--the-one-thing-to-get-right) before you spend any.

**Call the HTTP API directly** — `curl`, or the bundled driver [`vectorize.mjs`](vectorize.mjs). Not
the SDK, not the CLI; see [Why direct HTTP](#why-direct-http-and-not-the-sdk-or-cli) for the
evidence behind that.

## Credentials

Three env vars, read from the shell (repo tooling never loads dotenv itself):

| Variable                   | What it is                                                    |
| -------------------------- | ------------------------------------------------------------- |
| `VECTORIZER_ID`            | API Id — the HTTP Basic **username**                          |
| `VECTORIZER_SECRET`        | API Secret — the HTTP Basic **password**                      |
| `VECTORIZER_AUTHORIZATION` | Pre-built `Basic <base64>` header; an alternative to the pair |

Either the pair or the pre-built header is enough. If they are in a gitignored `.env`, load it
before calling `curl` (the driver reads root `.env` and `web/.env` on its own when the vars are
unset):

```bash
set -a && . ./.env && set +a
```

`.env` and `.env.*` are gitignored repo-wide. Never commit a key, never echo a secret into a
transcript, and never paste one into a PR body or issue.

## Credits — the one thing to get right

| Action                                  | Credits | Notes                                             |
| --------------------------------------- | ------- | ------------------------------------------------- |
| `mode=test` / `mode=test_preview`       | **0**   | Full-featured, heavily watermarked. Free forever. |
| `mode=preview`                          | 0.2     | 4× PNG with a discreet watermark                  |
| `mode=production`                       | 1.0     | The real result                                   |
| Upgrade a preview to production         | 0.9     | `/download` with a preview Image Token            |
| Another format from a retained result   | 0.1     | `/download` with an Image Token                   |
| Storage beyond the first day            | 0.01/dy | `policy.retention_days > 0`                       |
| `GET /account`, `POST /delete`, any 4xx | 0       | Free                                              |

Rules that follow from that:

* **Default to `mode=test`.** The driver already does — production costs money only when you pass
  `--mode production` (or `--production`). Test mode supports every parameter, so iterate on
  parameters there for free and switch modes once only, for the keeper run.
* **Every test response carries `X-Credits-Calculated`** — what the same call would have cost. Read
  it before committing to production.
* **Never loop over a directory in production mode without saying the total cost first.** N images =
  N credits, and the plan is 50.
* **Want several formats of one image? Pay 1, not N.** Vectorize once with
  `policy.retention_days=1`, keep the `X-Image-Token` response header, then `/download` each extra
  format at 0.1. Same trick for re-running one image with different output options (`image.token` on
  `/vectorize`).
* **The token workflows rehearse for free.** `mode=test` with `policy.retention_days > 0` returns a
  real (`api-test-…`) Image Token, and `/download`, `/delete`, and a token-input `/vectorize` all
  accept it at 0 credits while still reporting `X-Credits-Calculated`. So the multi-format and
  multi-option flows can be built and debugged end to end before a single credit is spent.
* **Check the balance whenever you are unsure** — it is free:

  ```bash
  curl -sS -u "$VECTORIZER_ID:$VECTORIZER_SECRET" https://api.vectorizer.ai/api/v1/account
  # {"subscriptionPlan":"vec_999m_50","subscriptionState":"active","credits":49}
  ```

  The driver prints the balance automatically after any call that was charged.

## Quick start

```bash
# Free watermarked trace — prove the parameters before spending anything
node .claude/skills/vectorize-image/vectorize.mjs web/static/coloring/creatures/owl-tall.outline.webp \
  --out vectorized/owl.svg --param processing.max_colors=2

# The keeper run (1 credit), retained for a day so extra formats cost 0.1 each
node .claude/skills/vectorize-image/vectorize.mjs web/static/coloring/creatures/owl-tall.outline.webp \
  --out vectorized/owl.svg --production --retain 1 --param processing.max_colors=2

# Second format from that result (0.1 credit) — token printed by the run above
node .claude/skills/vectorize-image/vectorize.mjs --download <image-token> --out vectorized/owl.png

# Housekeeping, both free
node .claude/skills/vectorize-image/vectorize.mjs --account
node .claude/skills/vectorize-image/vectorize.mjs --delete <image-token>
```

The equivalent raw call, when you would rather not use the driver:

```bash
curl -sS https://api.vectorizer.ai/api/v1/vectorize \
  -u "$VECTORIZER_ID:$VECTORIZER_SECRET" \
  -F "image=@input.png" \
  -F "mode=test" \
  -F "processing.max_colors=2" \
  -F "output.file_format=svg" \
  -D headers.txt -o out.svg
grep -i 'x-credits\|x-image-token' headers.txt
```

`-D headers.txt` is not optional in spirit: the Image Token and both credit counters only exist as
response headers, and the body is the binary result.

### Driver flags

| Flag                  | Effect                                                                            |
| --------------------- | --------------------------------------------------------------------------------- |
| `<input>`             | File path, `http(s)://…` URL, or `token:<image-token>` to re-run a retained image |
| `--out <file>`        | Where to write the result; the extension picks the format unless `--format` says  |
| `--help`              | The flag list, without calling anything                                           |
| `--format <fmt>`      | `svg` \| `eps` \| `pdf` \| `dxf` \| `png`                                         |
| `--mode <mode>`       | `test` (default) \| `test_preview` \| `preview` \| `production`                   |
| `--production`        | Shorthand for `--mode production` — **this is the flag that spends a credit**     |
| `--retain <days>`     | `policy.retention_days`; > 0 makes the response carry an `X-Image-Token`          |
| `--param k=v`         | Any documented API parameter, dotted name verbatim. Repeatable.                   |
| `--download <token>`  | Hit `/download` for another format of a retained result instead of vectorizing    |
| `--receipt <receipt>` | The `X-Receipt` value, when downloading extra formats after upgrading a preview   |
| `--delete <token>`    | Hit `/delete` to drop a retained image early (free, no refund)                    |
| `--account`           | Print subscription state and remaining credits                                    |
| `--json`              | Also print a one-line JSON summary: charged, calculated, image token, receipt     |

`--param` is deliberately a passthrough rather than a flag per option: the API has ~40 output
parameters, they are documented by their dotted names, and a passthrough keeps the driver honest
against [`reference/api.md`](reference/api.md) instead of drifting from it.

**Fields owned by a dedicated flag are rejected as `--param`** — `mode`, `image*`,
`output.file_format`, `policy.retention_days`, and `receipt`. The driver prints those in its
summary, so a passthrough copy could make the request disagree with what the run announced; for
`mode` that means spending a credit on a run that reported itself as free. The error names the flag
to use instead.

Results default to **`vectorized/`**, which is gitignored like `screenshots/` and
`lighthouse-reports/`. Write elsewhere in the tree only when the file is meant to be committed — a
stray untracked SVG trips the stop-hook git check.

## Endpoints

Base URL `https://api.vectorizer.ai/api/v1`. HTTP Basic auth on every call, HTTPS only, and your
client must do SNI.

| Endpoint     | Method | Purpose                                                       |
| ------------ | ------ | ------------------------------------------------------------- |
| `/vectorize` | POST   | Bitmap in (multipart), vector out. The main call.             |
| `/download`  | POST   | Another format / the production upgrade, from an Image Token. |
| `/delete`    | POST   | Drop a retained image before its retention expires.           |
| `/account`   | GET    | Subscription state and remaining credits.                     |

Full parameter tables, response headers, rate limiting, and timeouts:
[`reference/api.md`](reference/api.md). What every output option actually does:
[`reference/output-options.md`](reference/output-options.md). Every error status and code:
[`reference/errors.md`](reference/errors.md).

## Recipe: flat icon art → transparent-background SVG

The common ask — a flat, few-color icon (a PNG export of a logo, an app icon, a sticker) traced to a
clean SVG with the white background dropped. Two passes, and only the second costs anything.

**Pass 1, free — discover the real colors.** Trace in test mode with retention and read the fills
back out:

```bash
node .claude/skills/vectorize-image/vectorize.mjs icon.png \
  --out vectorized/discover.svg --retain 1 --param processing.max_colors=0
grep -o 'fill="#[0-9a-f]\{6\}"' vectorized/discover.svg | sort | uniq -c | sort -rn
```

**Use `processing.max_colors=0` for discovery specifically** — see the watermark gotcha below.
Ignore the greys `#7f7f7f`, `#696d69`, `#6b6d6b`, and `#323533`; they are watermark, not artwork.

**Pass 2 — the keeper.** Re-run through the token (free to rehearse, `--production` to commit):

```bash
node .claude/skills/vectorize-image/vectorize.mjs "token:<image-token>" \
  --out vectorized/icon.svg --production \
  --param 'processing.palette=#FFFFFF -> #00000000 ~ 0.05;' \
  --param output.gap_filler.enabled=false \
  --param output.shape_stacking=stacked \
  --param output.group_by=color
```

### Dropping white without losing near-white

Remapping a color to a fully transparent one deletes it, since transparent colors are omitted from
the result. The tolerance is what makes this safe. It is **max-channel ARGB distance** — the metric
that satisfies all three anchors the docs give (opaque red → opaque black = 1.0, black → white =
1.0, transparent black → opaque white = 2.0) — so:

```
distance(a, b) = max(|Δr|, |Δg|, |Δb|) / 255   +   |Δalpha| / 255
```

A cream `#F5EFE1` frame sits `max(10, 16, 30) / 255 = 0.118` from white. Measured on a fixture built
to that exact trap, holding everything else constant:

| Tolerance on white | Cream frame | White background |
| ------------------ | ----------- | ---------------- |
| `~ 0.05`           | **kept**    | gone             |
| `~ 0.15`           | gone        | gone             |

So compute the distance from white to your nearest surviving color and pick a tolerance comfortably
below it. `0.05` is a good default: loose enough to catch anti-aliased near-white pixels, tight
enough to spare anything a viewer would read as a distinct off-white.

### Which output options actually earn their place

Measured on the same fixture, each option applied alone on top of the transparency palette. Shape
and byte counts are test-mode figures — watermark-inflated, but the *relative* comparison holds:

| Setting                               | Effect                                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `output.gap_filler.enabled=false`     | 563 → 299 shapes, 275 → 193 KB. **The biggest single win.**                                                 |
| `output.shape_stacking=stacked`       | 275 → 150 KB                                                                                                |
| `output.group_by=color`               | Size unchanged; one `<g>` per color, for easy recoloring                                                    |
| `output.parameterized_shapes.flatten` | **Leave it `false`.** `true` costs 275 → 282 KB *and* converts every native `<rect>`/`<circle>` into a path |
| `processing.shapes.min_area_px=4`     | Marginal, and it ate two real shapes on clean art. Raise only for noisy or scanned sources                  |

The gap filler is the one with a genuine trade-off: it exists to hide the white seams many renderers
draw between exactly-abutting shapes. Turning it off is right for flat icons — it halves the shape
count and stops the filler blending *new* intermediate colors into a result you asked to have N
colors — and pairing it with `shape_stacking=stacked` makes shapes overlap rather than abut, which
is what removes the seam risk. If you see hairlines in a viewer, turn the filler back on rather than
fighting it.

Combined on a real production run, a 5-color 600×600 icon came out as **4 shapes in 2 KB**, one of
them a native `<circle>`, with 59% of the rendered pixels fully transparent.

Not worth changing for icons: `output.svg.fixed_size` (the `false` default gives a scalable SVG),
`output.curves.line_fit_tolerance` (the default only matters when curves get flattened to lines),
and `processing.palette` snapping for colors that are *already* flat — on synthetic art, snapping
each color to itself is a verified no-op. Snapping earns its keep on anti-aliased or photographic
sources, or when the output must use exact brand hexes rather than sampled approximations.

## Choosing parameters for Splotch-shaped work

The repo's natural input is coloring-page line art (`web/static/coloring/**`) — black ink on white,
1024×1536, WebP. Settings that matter for that shape:

* `processing.max_colors=2` — two colors is the whole image. Without it the tracer will find
  anti-aliasing grays and emit a much larger file.
* `output.gap_filler.enabled=false` — the gap filler exists to hide white seams between adjacent
  colored shapes. Two-color line art has nothing to seam, and disabling it keeps the result to
  exactly the requested colors (the gap filler otherwise blends *new* intermediate colors in).
* `processing.shapes.min_area_px` — raise it above the `0.125` default to drop speckle from a
  scanned or AI-generated source.
* `output.svg.fixed_size=false` (the default) — scalable SVG that fills its container, which is what
  the app wants.
* `processing.palette` — snap-and-remap, e.g. `#000000 ~ 0.3; #FFFFFF ~ 0.3;` to force pure black
  and white, or `#FFFFFF00;` to drop the white background entirely (fully transparent palette colors
  are omitted from the result).

**There is no centerline tracing.** Strokes come back as narrow *filled* shapes, not stroked paths —
an outline traces to two paths hugging each side of the ink, not one path down its middle. If a task
needs single-line geometry (plotters, cutters, stroke-width control), Vectorizer.AI is the wrong
tool and no parameter changes that. `output.draw_style=stroke_edges` strokes the boundaries of those
filled shapes once each; it is not a centerline.

## Gotchas

* **Timeouts are an *idle* requirement, and `AbortSignal.timeout` is not idle.** The docs ask for ≥
  180s without activity; `AbortSignal.timeout(ms)` measures elapsed time, so a 180s value cancels an
  actively-streaming slow response — verified locally against a server writing a byte every 200ms,
  aborted at 3004ms under a 3s signal. Node's global `fetch` exposes no idle timeout without an
  undici `Agent`, so the driver uses a deliberately generous **overall** deadline (600s) as a
  conservative substitute. Hand-rolled calls should do the same, or reach for a real idle timeout.
* **Rate limits.** `429` means back off *linearly* — 5s, then 10s, then 15s — per thread, reset on
  success. For batch work start at 5 concurrent and add one every 5 minutes. The driver retries
  429/503 with that schedule.
* **`processing.max_colors` counts the test-mode watermark.** The watermark is drawn in greys
  (`#7f7f7f`, `#696d69`, `#6b6d6b`, `#323533`) that occupy slots in the color budget like any other
  color, so a limit tuned for the artwork silently starves it. On a 5-color fixture at
  `max_colors=5`, the near-white cream frame was merged into the white background and disappeared
  before any palette rule ran — a result that looks like a palette bug and is not one. **Discover
  colors with `max_colors=0`** and apply the real limit only on the production pass, or add a
  handful of slots to cover the greys.
* **Exactly one image source per call**: `image`, `image.url`, `image.base64`, or `image.token`.
* **`image.base64` caps at 1 MB.** Upload the binary instead for anything real.
* **Input limits:** 33,554,432 px (w × h) and 31,457,280 bytes; larger inputs are rejected, not
  shrunk. `input.max_pixels` (default 2,097,252) is the shrink-to size, not the accept limit.
* **A 400 is free but it still burns wall-clock**, and `code` is the thing to match on, not the
  message text — messages are not stable.
* **Test-mode output is not a size proxy, and the inflation is not a fixed ratio.** The watermark
  adds hundreds of its own shapes, so it swamps simple artwork: a coloring outline went 1.9 MB test
  → 124 KB production (15×), while a flat 5-color icon went 144 KB → **2 KB** (70×). Compare test
  runs against each other, never against a production expectation.

## Why direct HTTP, and not the SDK or CLI

All three call the same service and produce identical results, so this is purely an integration
choice. Measured on 2026-08-06 against this account:

* **The official Node SDK (`@vectorizer-ai/sdk`) buys nothing here.** It works — a test-mode
  vectorize through it returned the same byte-identical 1,959,267-byte result as `curl`. But it is
  an OpenAPI-generated wrapper at v1.0.0 with a single release (2026-06-02), and every workflow that
  saves credits depends on response headers, which it only exposes through the `*Raw` variants — so
  you hold a response object either way. Its parameters are flattened to camelCase
  (`processingShapesMinAreaPx`), which no longer matches the documented dotted names, and results
  come back as a `Blob` you must convert before writing. Against that: a new production dependency,
  and ADR-0070's inverted `dependencies`/`devDependencies` split to reason about. Node's built-in
  `fetch` + `FormData` do the whole job in about twenty lines.
* **The CLI is a standalone binary from GitHub Releases**, not an npm install. Fine for a human
  batch-converting a folder on their laptop; wrong for a repo skill, which would gain a per-machine,
  non-reproducible install step.
* **The one thing the SDK has that the docs don't** is a richer parameter set — the OpenAPI spec
  carries `processing.color_profile.*`, per-shape parameterized-shape toggles, `output.pdf.version`,
  `output.pdf.compression_mode`, and `output.eps.version`, none of which appear on the HTML docs
  pages. They are listed in [`reference/api.md`](reference/api.md) under *Undocumented parameters*
  and work fine as `--param` passthroughs.

If Vectorizer.AI ever moves into app or asset-pipeline code rather than agent-run scripts,
reconsider the SDK for its typed enums — and write an ADR for it.
