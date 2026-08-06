# Vectorizer.AI — API reference

Inlined from <https://vectorizer.ai/api> and <https://vectorizer.ai/api/documentation> (captured
2026-08-06). Output-option semantics live in [`output-options.md`](output-options.md); the error
table in [`errors.md`](errors.md).

Base URL: `https://api.vectorizer.ai/api/v1`. The docs' quickstart also shows
`https://vectorizer.ai/api/v1`, which redirects; prefer the `api.` host.

## Authentication

Standard HTTP Basic auth over HTTPS: **API Id as username, API Secret as password**. Your HTTP
client must support SNI — unexplained TLS handshake errors are almost always that.

## Endpoints

| Endpoint     | Method | Body                  | Returns                                          |
| ------------ | ------ | --------------------- | ------------------------------------------------ |
| `/vectorize` | POST   | `multipart/form-data` | The result file (SVG/EPS/PDF/DXF/PNG)            |
| `/download`  | POST   | `multipart/form-data` | The result file, in another format               |
| `/delete`    | POST   | `multipart/form-data` | `{"success": true}`                              |
| `/account`   | GET    | —                     | `{subscriptionPlan, subscriptionState, credits}` |

`/account` response attributes: `subscriptionPlan` (plan name or `'none'`), `subscriptionState`
(`'active'`, `'pastDue'`, or `'ended'`), `credits` (**parse as a Double — it is fractional**; `0`
when not subscribed or on a non-API plan).

`/delete` is optional housekeeping — retained images expire on their own, and deleting early does
not refund the remaining storage days.

## Pricing

| Action          | Credits | Description                                                                     |
| --------------- | ------- | ------------------------------------------------------------------------------- |
| Testing         | 0.000   | `mode=test` / `mode=test_preview`. Free, no subscription needed, all params on. |
| Preview         | 0.200   | `mode=preview`. 4× PNG with a discreet watermark.                               |
| Vectorize       | 1.000   | `mode=production`. The real result.                                             |
| Upgrade preview | 0.900   | `/download` a production result from a preview Image Token.                     |
| Download format | 0.100   | `/download` another format of an already-vectorized result.                     |
| Storage day     | 0.010   | Per day beyond the first, when `policy.retention_days > 0`. First day free.     |

## Response headers

| Header                 | Meaning                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Image-Token`        | Present when `policy.retention_days > 0`. Feeds `/download` and `/vectorize`.                                                                                     |
| `X-Receipt`            | Returned when downloading a production result from a *preview* token. Pass it back to get extra formats at the 0.1 download rate instead of the 0.9 upgrade rate. |
| `X-Credits-Calculated` | On test requests: what the equivalent real call would have cost.                                                                                                  |
| `X-Credits-Charged`    | On every request: what this call actually cost. Always 0 in test modes.                                                                                           |

## Rate limiting

Generous, no hard cap. For batch jobs start at **5 concurrent threads and add 1 every 5 minutes**;
contact them before exceeding 100. On `429`, back off **linearly per thread** — 5s, then 10s, then
15s, … — and reset the counter after a success.

## Timeouts

Requests normally finish in seconds, but configure an **idle timeout of at least 180 seconds** so a
transient load spike doesn't look like a failure.

## Error JSON

Conventional HTTP statuses; `2xx` success, `4xx` your request, `5xx` theirs (wait and retry). Every
problematic request should carry an error object — though an internal failure can theoretically
return non-JSON. Some HTTP clients throw on 4xx/5xx; catch and read the body.

```json
{
  "error": {
    "status": 400,
    "code": 1006,
    "message": "Failed to read the supplied image. "
  }
}
```

`status` repeats the HTTP status, `code` is Vectorizer's internal code (**match on this**, not the
message), `message` is human-readable and not stable. Recent API errors are listed on the account
page at <https://vectorizer.ai/account#recent_api_errors>.

## `POST /vectorize`

Multipart form upload. Supply **exactly one** image source.

### Input

| Parameter      | Type   | Notes                                                                       |
| -------------- | ------ | --------------------------------------------------------------------------- |
| `image`        | Binary | The file itself. `.bmp`, `.gif`, `.jpeg`, `.png`, `.tiff`, or `.webp`.      |
| `image.base64` | String | Base64-encoded image, **max 1 MB**.                                         |
| `image.url`    | String | URL to fetch. Must return 200 and an image content type; host must be fast. |
| `image.token`  | String | An Image Token from an earlier call with `policy.retention_days > 0`.       |

Max upload: **33,554,432 px** (width × height) and **31,457,280 bytes**. Oversize inputs are
rejected (codes 1012/1013) — pre-shrink them. Accepted images are then shrunk to `input.max_pixels`.

### Processing

| Parameter                       | Type / range                                 | Default      | Notes                                                                                                                                 |
| ------------------------------- | -------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                          | `production` `preview` `test` `test_preview` | `production` | See pricing. `preview` produces a 4× watermarked PNG and ignores contradictory parameters.                                            |
| `input.max_pixels`              | Integer `100`–`3145828`                      | `2097252`    | Larger images are shrunk to this before processing.                                                                                   |
| `policy.retention_days`         | Integer `0`–`30`                             | `0`          | `> 0` returns an `X-Image-Token`. First day free, then 0.01 credits/day.                                                              |
| `processing.max_colors`         | Integer `0`–`256`                            | `0`          | `0` = unlimited. `1` and `2` both mean two colors. **With the gap filler on you still get blends** — disable it for exactly N colors. |
| `processing.shapes.min_area_px` | Float `0.0`–`100.0`                          | `0.125`      | Shapes smaller than this are discarded. Raise to kill speckle.                                                                        |
| `processing.palette`            | String                                       | *(empty)*    | Snap / remap / drop colors — see below.                                                                                               |

### `processing.palette`

Format: `[color][-> remapped][~ tolerance];`, repeated. Detected colors within the tolerance of a
palette color snap to the nearest such color, and are remapped if that entry specifies one.
Unmatched colors are left unchanged.

```
#00000000;
#FFFFFF ~ 0.1;
#0000FF -> #00FF00;
#FF0000 -> #00FF00 ~ 0.1;
```

* Snap everything to red/green/blue: `#FF0000; #00FF00; #0000FF;`
* Clean up only near-RGB colors, leave the rest: `#FF0000 ~ 0.02; #00FF00 ~ 0.02; #0000FF ~ 0.02;`
* Recolor near-red to green, leave the rest: `#FF0000 -> #00FF00 ~ 0.02;`
* Snap to RGB and **delete** everything else: append `#00000000;` (transparent) to the tolerant set.

**Colors** use basic CSS syntax — `#RRGGBBAA` for transparency, `#RRGGBB` for opaque. Fully
transparent colors are omitted from the result, which is how you remove a color. Max 1,024 colors.

**Tolerance** is fractional ARGB distance where `1.0` = opaque red → opaque black; max `2.0` =
transparent black → opaque white, which is also the **default** (so an entry with no `~` snaps from
any distance). Divide 0–255 values by 255.

### Output

| Parameter                             | Values                                                 | Default          |
| ------------------------------------- | ------------------------------------------------------ | ---------------- |
| `output.file_format`                  | `svg` `eps` `pdf` `dxf` `png`                          | `svg`            |
| `output.svg.version`                  | `svg_1_0` `svg_1_1` `svg_tiny_1_2`                     | `svg_1_1`        |
| `output.svg.fixed_size`               | `true` `false`                                         | `false`          |
| `output.svg.adobe_compatibility_mode` | `true` `false`                                         | `false`          |
| `output.dxf.compatibility_level`      | `lines_only` `lines_and_arcs` `lines_arcs_and_splines` | `lines_and_arcs` |
| `output.bitmap.anti_aliasing_mode`    | `anti_aliased` `aliased` (PNG only)                    | `anti_aliased`   |
| `output.draw_style`                   | `fill_shapes` `stroke_shapes` `stroke_edges`           | `fill_shapes`    |
| `output.shape_stacking`               | `cutouts` `stacked`                                    | `cutouts`        |
| `output.group_by`                     | `none` `color` `parent` `layer`                        | `none`           |
| `output.parameterized_shapes.flatten` | `true` `false`                                         | `false`          |

Curves — each may be disallowed, with documented fallback chains:

| Parameter                                | Values              | Default                                                                |
| ---------------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `output.curves.allowed.quadratic_bezier` | `true` `false`      | `true`                                                                 |
| `output.curves.allowed.cubic_bezier`     | `true` `false`      | `true`                                                                 |
| `output.curves.allowed.circular_arc`     | `true` `false`      | `true`                                                                 |
| `output.curves.allowed.elliptical_arc`   | `true` `false`      | `true`                                                                 |
| `output.curves.line_fit_tolerance`       | Float `0.001`–`1.0` | `0.1` — max px distance between a curve and the lines approximating it |

Gap filler (works around the white-seam rendering bug in most vector viewers):

| Parameter                              | Values            | Default |
| -------------------------------------- | ----------------- | ------- |
| `output.gap_filler.enabled`            | `true` `false`    | `true`  |
| `output.gap_filler.clip`               | `true` `false`    | `false` |
| `output.gap_filler.non_scaling_stroke` | `true` `false`    | `true`  |
| `output.gap_filler.stroke_width`       | Float `0.0`–`5.0` | `2.0`   |

With `output.shape_stacking=stacked`, either clip or use non-scaling strokes.

Stroke style — applies when `output.draw_style` is `stroke_shapes` or `stroke_edges`:

| Parameter                           | Values / format   | Default   |
| ----------------------------------- | ----------------- | --------- |
| `output.strokes.non_scaling_stroke` | `true` `false`    | `true`    |
| `output.strokes.use_override_color` | `true` `false`    | `false`   |
| `output.strokes.override_color`     | `#RRGGBB`         | `#000000` |
| `output.strokes.stroke_width`       | Float `0.0`–`5.0` | `1.0`     |

Output size:

| Parameter                  | Values / range                                 | Default                               |
| -------------------------- | ---------------------------------------------- | ------------------------------------- |
| `output.size.scale`        | Float `0.0`–`1000.0`                           | *(optional)* — wins over width/height |
| `output.size.width`        | Float `0.0`–`1.0E12`                           | *(optional)*                          |
| `output.size.height`       | Float `0.0`–`1.0E12`                           | *(optional)*                          |
| `output.size.unit`         | `none` `px` `pt` `in` `cm` `mm`                | `none`                                |
| `output.size.aspect_ratio` | `preserve_inset` `preserve_overflow` `stretch` | `preserve_inset`                      |
| `output.size.align_x`      | Float `0.0` (left) – `1.0` (right)             | `0.5`                                 |
| `output.size.align_y`      | Float `0.0` (top) – `1.0` (bottom)             | `0.5`                                 |
| `output.size.input_dpi`    | Float `1.0`–`1000000.0`                        | *(from file)*                         |
| `output.size.output_dpi`   | Float `1.0`–`1000000.0`                        | *(optional)*                          |

Specifying only one of width/height computes the other to preserve aspect ratio. `pt`/`in`/`cm`/`mm`
are physical units and interact with the DPI parameters; `none`/`px` are not.

## `POST /download`

Same output parameters as `/vectorize` (everything under `output.*`), plus:

| Parameter     | Type   | Notes                                                                                                                                      |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `image.token` | String | The `X-Image-Token` from a retained vectorize call.                                                                                        |
| `receipt`     | String | The `X-Receipt` from an earlier preview→production download. **Required to get the 0.1 download rate** when the token came from a preview. |

Two uses: pull the production result after a preview (0.9), or pull additional formats of an
already-produced result (0.1 each) without re-vectorizing.

## `POST /delete`

`image.token` only. Returns `{"success": true}`.

## Undocumented parameters

The OpenAPI spec (`https://vectorizer.ai/api/openapi.json`, and the SDKs generated from it) carries
parameters the HTML docs pages omit. They pass through as ordinary form fields; dotted names below
are the API form, inferred from the SDK's camelCase.

* `processing.color_profile.input` — `ignore` | `preserve` (ICC profile handling on input)
* `processing.color_profile.output`
* `processing.parameterized_shapes.ellipse.general.enabled`, `…ellipse.circle.enabled`,
  `…triangle.general.enabled`, `…triangle.isosceles.enabled`, `…quadrilateral.general.enabled`,
  `…quadrilateral.rectangle.enabled`, `…quadrilateral.bullet.enabled`, `…star.n3.enabled`,
  `…star.n4.enabled`, `…star.n5.enabled`, `…star.n6.enabled` — per-shape detection toggles, finer
  grained than `output.parameterized_shapes.flatten`
* `output.pdf.version`, `output.pdf.compression_mode`, `output.eps.version`

Treat these as unverified: they are declared by the spec, not exercised by this repo's smoke tests.

## Workflows

* **Single image** — one `/vectorize` call, done.
* **Preview first** — `/vectorize` with `mode=preview` and `policy.retention_days > 0`, keep
  `X-Image-Token`; after the customer converts, `/download` with the token (0.9); keep the returned
  `X-Receipt` if you also need other formats (then 0.1 each).
* **Multi-format** — `/vectorize` with `policy.retention_days > 0`, then `/download` per extra
  format at 0.1.
* **Multi-option** — `/vectorize` with retention, then `/vectorize` again passing `image.token` to
  re-run the same image under different processing options (saves bandwidth and latency, not the
  1-credit vectorize charge).

## Other clients

Official SDKs (Python — pending PyPI, TypeScript/JavaScript `@vectorizer-ai/sdk`, Java, C#/.NET, Go,
PHP, Ruby) and a standalone CLI (`vectorizer vectorize logo.png -o logo.svg`, releases at
<https://github.com/clv/vectorizer-ai-cli/releases>) wrap this same API with identical results,
auth, pricing, and options. Specs: `/api/openapi.json`, `/api/openapi-codegen.json`,
`/api/openapi-swagger.json`. This repo calls the HTTP API directly — see the *Why direct HTTP*
section of `SKILL.md`.

## Changelog highlights

| Date       | Change                                                                          |
| ---------- | ------------------------------------------------------------------------------- |
| 2026-06-01 | OpenAPI 3.0 spec downloads; official SDK + CLI documentation                    |
| 2024-11-04 | `processing.shapes.min_area_px`                                                 |
| 2024-09-23 | Image Tokens, Receipts, per-call charge headers, `/download` and `/delete`      |
| 2024-06-11 | `processing.palette`                                                            |
| 2024-01-24 | `/account` endpoint; error listing                                              |
| 2023-10-03 | Clarified that `output.gap_filler.enabled=true` adds colors beyond `max_colors` |
| 2023-09-20 | `mode`                                                                          |
| 2023-08-01 | `output.size.*` group and `output.bitmap.anti_aliasing_mode`                    |
| 2023-06-07 | `processing.max_colors`                                                         |
