# tools/vectorize — raster → vector through Vectorizer.AI

The runbook for [`vectorize-image.mjs`](vectorize-image.mjs), which traces a bitmap into filled
vector shapes via the Vectorizer.AI HTTP API. The `vectorize-image` skill is a thin pointer at this
folder; everything substantive lives here, once, because a skill under `.ruler/` is copied verbatim
into both `.claude/` and `.agents/` and this material is far too large to trip.

## Entry point

| Entry point                       | Public command                        | Purpose                                                   |
| --------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| `vectorize-image.mjs`             | `npm run vectorize --`                | Trace, download, delete, or inspect an account            |
| `vectorize-coloring-overlays.mjs` | `npm run vectorize:coloring --`       | Plan or run bounded, restart-safe coloring-page batches   |
| `analyze-coloring-overlays.mjs`   | `npm run vectorize:coloring:analyze`  | Gate fidelity and compare vector/raster payload sizes     |
| `vectorize-coloring-overlays.mjs` | `npm run vectorize:coloring:check`    | Guard each outline-to-SVG derivation against drift        |
| `postprocess-svg.mjs`             | `npm run vectorize:postprocess --`    | Optimize a trace and restore its intrinsic SVG dimensions |
| `postprocess-svg.mjs`             | `npm run vectorize:postprocess:check` | Check committed traces against that fixed point           |

Filled SVG artwork that needs to become replayable pen strokes continues through
[centerline tracing](../centerline-tracing/README.md), then the
[store-drawing compiler](../store-drawings/README.md). Vectorizer remains responsible only for the
raster-to-filled-vector stage.

The public npm command, CLI modes, flags, environment variables, default `vectorized/` output,
credit safeguards, and exit behavior remain stable during the tools naming migration. Inputs and
outputs are documented under [Driver flags](#driver-flags), credentials under
[Credentials](#credentials), and API failure recovery in [`docs/errors.md`](docs/errors.md). A run
that fails *after* the API call returned may still have been charged — the result is written before
the charge and image token are printed — so check `npm run vectorize -- --account` before re-running
a `--production` command that errored.

The account this repo uses is a **metered 200-credit plan** — a production vectorization is **1
credit**, and credits do not come back. Read
[Credits — the one thing to get right](#credits--the-one-thing-to-get-right) before you spend any.

**Call the HTTP API directly** — `curl`, or the driver. Not the SDK, not the CLI; see
[Why direct HTTP](#why-direct-http-and-not-the-sdk-or-cli) for the evidence behind that.

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
  N credits, and the current account balance is the hard ceiling.
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
node tools/vectorize/vectorize-image.mjs input.png \
  --out vectorized/input.svg --param processing.max_colors=2

# The keeper run (1 credit), retained for a day so extra formats cost 0.1 each
node tools/vectorize/vectorize-image.mjs input.png \
  --out vectorized/input.svg --production --retain 1 --param processing.max_colors=2

# Second format from that result (0.1 credit) — token printed by the run above
node tools/vectorize/vectorize-image.mjs --download <image-token> --out vectorized/owl.png

# Housekeeping, both free
node tools/vectorize/vectorize-image.mjs --account
node tools/vectorize/vectorize-image.mjs --delete <image-token>
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
against [`docs/api.md`](docs/api.md) instead of drifting from it.

**Fields owned by a dedicated flag are rejected as `--param`** — `mode`, `image*`,
`output.file_format`, `policy.retention_days`, and `receipt`. The driver prints those in its
summary, so a passthrough copy could make the request disagree with what the run announced; for
`mode` that means spending a credit on a run that reported itself as free. The error names the flag
to use instead.

Results default to **`vectorized/`**, which is gitignored like `screenshots/` and
`lighthouse-reports/`. Write elsewhere in the tree only when the file is meant to be committed — a
stray untracked SVG trips the stop-hook git check.

### Post-process a keeper

Preserve the paid service response as the raw review artifact, then derive the runtime SVG through
the deterministic post-processor:

```bash
npm run vectorize:postprocess -- vectorized/page.svg --out vectorized/page.optimized.svg
npm run vectorize:postprocess -- vectorized/page.svg --fill '#fff' --out vectorized/page.dark.svg
```

The pass runs pinned SVGO `preset-default` to its byte-stable fixed point, then restores `width` and
`height` from the optimized `viewBox`. Without those attributes, Chromium and WebKit report the
Vectorizer output at its 100×150 default intrinsic size. No-input mode normalizes the committed
`tools/vectorize/pilot/*.optimized.svg` and `web/static/coloring/**/*.svg` inventory in place;
`npm run vectorize:postprocess:check` is the read-only drift guard. The repo-script unit suite also
checks every committed result so a new runtime SVG cannot bypass the invariant. `--fill` bakes a
root ink color into a themed derivative; use `#fff` for a dark overlay so runtime presentation stays
ordinary source-over composition without a CSS filter (ADR-0091).

### Repeat a coloring-page overlay campaign

`vectorize-coloring-overlays.mjs` owns the production recipe for transparent coloring overlays. Page
generators stage reviewed inputs as `{page}.source.webp` under the gitignored
`vectorized/coloring-overlays/` or `vectorized/coloring-dark-overlays/` restart tree. Light mode
writes black `.overlay.svg` files; dark mode (`--theme=dark`) bakes white ink into
`.dark.overlay.svg`. Cover `.source.webp` inputs use the same path during the cover campaign. When a
raw response exists but the committed derivative does not, the next run performs only the free
deterministic post-process.

The recipe is fixed in the runner rather than copied into a shell loop, and the final derivation
ledger records the exact parameters alongside every input/output hash.

Start with a read-only plan. A production run must select a book or substring, must state its batch
size, and cannot exceed 12 paid traces:

```bash
npm run vectorize:coloring -- --book=creatures --batch-size=12
npm run vectorize:coloring -- --book=creatures --batch-size=12 --production
npm run vectorize:coloring:analyze -- --book=creatures

npm run vectorize:coloring -- --theme=dark --book=creatures --batch-size=12
npm run vectorize:coloring -- --theme=dark --book=creatures --batch-size=12 --production
npm run vectorize:coloring:analyze -- --theme=dark --book=creatures
```

The runner skips committed outputs and post-processes recoverable raw responses before making new
API calls. Use `--force` only for an intentionally regenerated source, and narrow it with `--match`
so already-approved pages are not charged again:

```bash
npm run vectorize:coloring -- \
  --match=creatures/fairy-wide --batch-size=1 --production --force
```

After the complete catalog is present, record the exact input/output relationship and verify the
committed inventory:

```bash
npm run vectorize:coloring -- --write-ledger
npm run vectorize:coloring -- --theme=dark --write-ledger
npm run vectorize:coloring:check
npm run vectorize:postprocess:check
```

Format-2 ledgers record the paid trace-source and SVG SHA-256 plus byte counts. Both theme ledgers
cover all 104 page orientations and covers, and the check independently rejects a missing or
unrecorded canonical SVG. When staged trace sources are present, the same check also verifies their
hashes and byte counts against the ledger. Without that recovery scratch, source fields remain
provenance rather than a self-contained derivation proof. Trace sources and raw service responses
remain review/recovery artifacts, not sources of truth, and should not be committed.

### Regenerate canonical page line art

Run the fresh, normalize, or chalk generator and review its candidates. `--apply` stages the chosen
`.source.webp`; it does not overwrite the canonical SVG. Retrace only that theme/page, compare the
candidate to the rendered SVG, then refresh the ledger and asset manifest:

```bash
npm run vectorize:coloring -- \
  --theme=dark --match=vehicles/train-wide --batch-size=1 --production --force
npm run vectorize:coloring:analyze -- --theme=dark --book=vehicles
npm run vectorize:coloring -- --theme=dark --write-ledger
npm run vectorize:coloring:check
npm run vectorize:postprocess:check
npm run gen:assets:manifest
```

Inspect the staged source, rendered SVG, and representative composite before accepting the trace.
The staged source may be deleted after the ledger is written and every downstream fill/proof/device
gate passes.

Run `vectorize:coloring:analyze` while staged trace sources are available when a campaign needs
source fidelity metrics. Historical full/compact WebP comparison fields otherwise report `null`. The
completed light catalog measured 3,572,243 raw SVG bytes and 1,558,331 gzip bytes versus 6,274,180
compact or 9,080,706 full WebP bytes; all 96 pages passed at 96.34% minimum binary ink IoU and
2.46/255 maximum alpha mean absolute error. The complete dark catalog measured 3,959,975 raw SVG
bytes and 1,731,806 gzip bytes versus 4,479,786 compact or 5,361,446 full WebP bytes; all 96 pages
passed at 95.67% minimum IoU and 1.83/255 maximum alpha error.

The eight-cover campaign added 347,803 light SVG bytes (148,128 gzip) and 364,614 dark SVG bytes
(156,300 gzip), replacing 734,748 light and 686,942 dark raster-master bytes. All covers passed:
light measured at least 96.62% IoU and at most 2.76/255 alpha error; dark measured at least 97.25%
IoU and at most 2.56/255 alpha error. Raster picker thumbnails remain deterministic derivatives of
those canonical cover SVGs.

The fidelity gate uses a 95.5% binary-IoU floor together with a 3/255 mean-alpha-error ceiling. The
IoU floor includes the visually reviewed tall Umbrella trace (97.72% precision, 97.86% recall,
0.78/255 mean alpha error), whose chalk-grain edge pixels make a 96% binary cutoff overly strict
without indicating lost artwork. Do not relax either threshold from a summary number alone: inspect
the failing source and rendered SVG, record precision/recall and alpha error, and keep a failed
trace only when the difference is confined to antialiasing or chalk texture.

Promote one book at a time. Before the first broad batch, use a dense landscape page as the size,
fidelity, and WebKit gate. After each book: inspect representative simple and dense SVGs over the
matching paper/fill, run the SVG and coloring-asset checks, rebuild the pack manifest, and exercise
page selection, theme switching, Magic reveal, rotation, clearing, export, offline relaunch, and the
compact/full pack paths on a physical iPad. Mobile Safari may report CSS-scaled intrinsic dimensions
for a canonical 1024×1536 SVG; the durable requirements are the SVG's width, height, and viewBox
plus exact rendered registration with the paper and fill.

## Endpoints

Base URL `https://api.vectorizer.ai/api/v1`. HTTP Basic auth on every call, HTTPS only, and your
client must do SNI.

| Endpoint     | Method | Purpose                                                       |
| ------------ | ------ | ------------------------------------------------------------- |
| `/vectorize` | POST   | Bitmap in (multipart), vector out. The main call.             |
| `/download`  | POST   | Another format / the production upgrade, from an Image Token. |
| `/delete`    | POST   | Drop a retained image before its retention expires.           |
| `/account`   | GET    | Subscription state and remaining credits.                     |

Full parameter tables, response headers, rate limiting, and timeouts: [`docs/api.md`](docs/api.md).
What every output option actually does: [`docs/output-options.md`](docs/output-options.md). Every
error status and code: [`docs/errors.md`](docs/errors.md).

## Recipe: flat icon art → transparent-background SVG

The common ask — a flat, few-color icon (a PNG export of a logo, an app icon, a sticker) traced to a
clean SVG with the white background dropped. Two passes, and only the second costs anything.

**Pass 1, free — discover the real colors.** Trace in test mode with retention and read the fills
back out:

```bash
node tools/vectorize/vectorize-image.mjs icon.png \
  --out vectorized/discover.svg --retain 1 --param processing.max_colors=0
grep -o 'fill="#[0-9a-f]\{6\}"' vectorized/discover.svg | sort | uniq -c | sort -rn
```

**Use `processing.max_colors=0` for discovery specifically** — see the watermark gotcha below.
Ignore the greys `#7f7f7f`, `#696d69`, `#6b6d6b`, and `#323533`; they are watermark, not artwork.

**Pass 2 — the keeper.** Re-run through the token (free to rehearse, `--production` to commit):

```bash
node tools/vectorize/vectorize-image.mjs "token:<image-token>" \
  --out vectorized/icon.svg --production \
  --param 'processing.palette=#FFFFFF -> #00000000 ~ 0.05;' \
  --param output.gap_filler.enabled=false \
  --param output.shape_stacking=stacked \
  --param output.group_by=color
```

### Dropping white without losing near-white

Remapping a color to a fully transparent one deletes it, since transparent colors are omitted from
the result. The tolerance is what makes this safe. Measured against the service, it is **Euclidean
RGB distance over 255**:

```
distance(a, b) = hypot(Δr, Δg, Δb) / 255
```

This was established by bisecting the tolerance on `setup.png`, whose screen cream and check green
sit far apart, and asking after each run whether the color survived:

| Color           | Euclidean | Max-channel | Survives at | Deleted at | Bracket contains |
| --------------- | --------- | ----------- | ----------- | ---------- | ---------------- |
| Cream `#F2EBD9` | 0.176     | 0.149       | 0.17        | 0.18       | Euclidean only   |
| Green `#6AB86D` | 0.864     | 0.584       | 0.85        | 0.90       | Euclidean only   |
| Blue `#326999`  | 1.073     | 0.804       | 0.90        | —          | Euclidean only   |

Every max-channel prediction is falsified: each color outlived the tolerance that metric says would
delete it. Test-mode runs cost nothing, so re-measure rather than trusting either formula if a
result ever looks wrong.

Two caveats worth keeping. The docs' own anchors (opaque red → opaque black = 1.0, black → white =
1.0, transparent black → opaque white = 2.0) do **not** fit this formula either — black → white is
`hypot(255,255,255)/255 = 1.732` — so the anchors describe something the observed behaviour
contradicts, and the alpha term has not been measured at all. Treat the formula above as an
empirical fit over opaque colors, not as the service's specification.

The practical guidance is unchanged, and the correction only widens its margin: compute the distance
from white to your nearest surviving color and pick a tolerance comfortably below it. `0.05` is a
good default — loose enough to catch anti-aliased near-white pixels, tight enough to spare anything
a viewer would read as a distinct off-white. Across the thirteen-icon refresh the tightest case was
this same cream at 0.176, giving the default more than 3× margin.

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

**Vectorizer.AI itself does no centerline tracing.** Strokes come back as narrow *filled* shapes,
not stroked paths — an outline traces to two paths hugging each side of the ink, not one path down
its middle. No API parameter changes that. `output.draw_style=stroke_edges` strokes the boundaries
of those filled shapes once each; it is not a centerline. Feed accepted filled output to the
[centerline-tracing capability](../centerline-tracing/README.md) when the next stage needs
single-line geometry.

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
* **A test-mode result cannot be de-watermarked, so test mode can never preview appearance.** The
  watermark is not an overlay sitting on top of the art — the lettering is *knocked out of the
  artwork's own geometry*. Dropping every shape whose fill is a watermark grey leaves word-shaped
  holes through the drawing, not a clean preview. Test mode proves **parameters** (colors,
  transparency, shape counts, curve types, viewBox); judging how a result *looks* costs a credit,
  and there is no way around that.
* **`X-Credits-Remaining` lags the charge.** The value the driver prints straight after a production
  run can still be the pre-charge balance; `GET /account` a moment later shows the debit. Confirm a
  spend with `--account`, not with the header from the run that spent it.

## Batch conversion: what ten icons actually taught

From tracing the thirteen-icon refresh (ten traces, ten credits). The parameters in the recipe above
did not change once after the first icon, so the per-icon work is only ever **two calls**: a free
discovery pass, then the keeper.

* **Separate watermark from artwork by measuring, not by eye.** Discovery reports every color it
  finds, and on these icons 4–11 of them were watermark. Guessing from the hex is unreliable —
  `#383723` and `#5E3A52` look plausibly like artwork. Sample each candidate against the source PNG
  instead: a watermark color occupies **0.000%** of it. Anti-aliased edge blends show up as real but
  vanishing (0.001–0.03%), which is a different and equally clear signal.
* **Squaring the viewBox and un-grouping are pure serialization — never re-spend a credit on them.**
  `output.size.*` only pads the viewBox; it does not move coordinates. Neither does moving a `<g>`
  fill onto its children. Both are text edits on the file you already paid for, and both were
  verified pixel-identical (0 of 262,144 pixels differ). Pass `output.group_by=none` in the keeper
  and square the box offline.
* **Stacking cannot recover geometry the pixels never contained.** `shape_stacking=stacked` keeps a
  shape whole where the tracer can infer containment — a night sky under its stars, a lens ring
  under its glass. But where an overlapping shape *fully severs* the one beneath (a slider knob
  taller than its track, a folder back hidden behind a photo), the visible region is genuinely two
  disconnected areas and comes back as two shapes. No parameter changes this; it is a property of
  the artwork. Budget for it when a "single bar" turns out to be two fills to recolor.
* **Primitive recognition is a lottery. Expect nothing.** Across ten icons it produced four
  `<circle>` elements and seven rotated rounded `<rect>` elements — genuinely valuable, a whole
  eight-rayed sun in 982 bytes. But it cannot be forced or predicted: one star of three, a lens but
  not its visually-identical ring, seven of eight sun rays whose areas differ by 2%, and one of two
  heads in the same drawing where the unrecognized one is within 0.8% of square. There is no
  parameter and no property of the artwork that reliably predicts it. Treat every primitive as found
  money and never plan a byte budget around getting one.
* **Interior alpha bleed is real, and is not worth fixing.** With the gap filler off, two abutting
  opaque shapes composite to roughly 0.76 alpha along their shared edge rather than 1.0, so the
  background shows faintly through internal joins. Every icon in the batch had some (0.24%–7.3% of
  interior pixels at 128 px, lowest alpha ~180). None of it is perceptible at 44 or 128 px on either
  a light or a dark ground — check by eye rather than by metric. Stroking each shape in its own fill
  to force an overlap was tried and rejected: at sub-pixel widths it clears the artifact at one
  raster size and worsens another.
* **A low fidelity score is usually the drawing.** Comparing a traced SVG to its source per opaque
  pixel, the disagreeing pixels are almost all anti-aliased ones on a color boundary. Across the
  ten, boundary density versus fidelity gives **r = −0.77**: the icon with the least boundary per
  unit area scored 99.1%, the busiest scored 95.3%. Watch for a score that moves without the drawing
  explaining it, not for an absolute number.
* **Measurement traps that produced wrong answers in this batch**, all worth guarding against:
  flood-filling the background 4-connected reports diagonally-pinched *outside* pockets as interior
  holes (use 8-connected for background, 4 for foreground); the axis-aligned bounding box of a
  rotated shape is not its dimensions, so comparing a rotated ray's bbox to an upright one's
  "proves" a size difference that isn't there; and rasterizing one shape in isolation with
  fit-to-contain can rescale it, so radii measured that way are meaningless — take geometry from
  `getBBox()` in a browser instead.

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
  pages. They are listed in [`docs/api.md`](docs/api.md) under *Undocumented parameters* and work
  fine as `--param` passthroughs.

If Vectorizer.AI ever moves into app or asset-pipeline code rather than agent-run scripts,
reconsider the SDK for its typed enums — and write an ADR for it.

## Maintenance

`vectorize-image.mjs` owns authentication loading, credit-safe request construction, response
headers, retries, and output writes. Keep the inlined API documents aligned when the service
contract changes. `tests/vectorize-image.test.mjs` imports the request seams without executing the
CLI, making the metered production path safe to verify without credentials, network calls, or
credits.

Run focused verification with:

```bash
npm run test:tools -- tools/vectorize/tests/vectorize-image.test.mjs
npm run vectorize -- --help
```

The committed [`pilot/`](pilot/) records the coloring-outline experiment that established the keeper
parameters and compared one cover plus simple/dense pen and chalk pages. It is evidence for the
proposed runtime direction, not part of the production coloring pipeline.
