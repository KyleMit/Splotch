# Vectorizer.AI — output options

Inlined from <https://vectorizer.ai/api/outputOptions> (captured 2026-08-06). Parameter names,
ranges, and defaults are in [`api.md`](api.md); this file is what the options *mean*.

## The vector model

Results are **shapes** made of non-self-intersecting **loops** — sequences of curves where each
starts where the last ended and the last closes back to the first. Available curve primitives:
lines, circular and elliptical arcs, quadratic and cubic Bézier curves.

Every shape has exactly one *positive* loop (the filled area) and may have *negative* loops
(cut-outs that stay unfilled). Negative loops must be fully enclosed by the positive loop and must
not touch each other.

## No centerline tracing

Line drawings, CAD drawings, charts, and technical diagrams do **not** come back as stroked
geometry. There is no centerline tracing; all stroked input geometry becomes narrow *filled* shapes.
A 3px black line traces to a long thin filled shape, not a path with `stroke-width: 3`.

The Stroke Style options below style the paths of those filled shapes — they are unrelated to
centerline tracing and cannot substitute for it.

## Draw order and layers

Shapes are drawn in file order. Any set of shapes whose internal order can be permuted without
changing the image forms a **Layer**. Layers must be drawn in order; shapes within one can be
reordered or grouped freely. This is what `output.group_by=layer` groups on.

## File formats

| Format | Notes                                                                                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| SVG    | Supports the full range of options (readers vary). Best default for web and print interchange.                    |
| EPS    | Version 3. Legacy print format: **no grouping, no transparency**, limited non-scaling strokes.                    |
| PDF    | Version 1.4 (earliest with transparency). **No grouping**, limited non-scaling strokes.                           |
| DXF    | Version AC1021 (2007). Supports layers and all curve types, but reader support varies wildly — see compatibility. |
| PNG    | Raster, with transparency. Rendered at **4× the vectorized size** by default, or a custom size within the max.    |

### SVG version

* **1.0 / 1.1** — identical output apart from the header; 1.1 is by far the most common. Neither
  formally supports non-scaling strokes (an SVG Tiny 1.2 / SVG 2.0 feature), but they are widely
  honored in practice, so they are allowed in all SVG output.
* **Tiny 1.2** — subset of 1.1 plus a few 2.0 features, aimed at mobile. No clipping paths, but
  formal non-scaling stroke support. Rarely an advantage over the same content with an 1.1 header.

### SVG options

* **Fixed size** — writes `width`/`height` on the `<svg>` tag, so viewers render at that size.
  Omitting them (`false`, the default) makes the SVG scale to fill its container.
* **Adobe compatibility mode** — exports SVG 1.1 limited to lines and cubic Béziers, the forms
  Illustrator imports most reliably, keeping artwork editable.

### DXF compatibility level

* `lines_only` — everything flattened to lines; maximum downstream compatibility.
* `lines_and_arcs` — lines plus circular/elliptical arcs, no splines. Works in most CAD apps;
  confirmed with LibreCAD.
* `lines_arcs_and_splines` — all curve types. Confirmed with Autodesk TrueView 2024.

## Draw style

* **Fill Shapes** (default) — fill each shape's interior with its color. Looks like the input, with
  sharp boundaries and free scaling.
* **Stroke Shapes** — stroke every curve of each shape using the Stroke Style instead of filling.
  Touching shapes get their shared edge stroked **twice**, once per shape. Cut-outs always produce
  two strokes per edge; stacked shapes produce one between a shape and shapes it fully contains, two
  between neighbors where neither contains the other.
* **Stroke Edges** — stroke each edge between shapes exactly **once**. This is the one for laser
  engraving and vinyl cutting.

## Shape stacking

* **Cut-outs** (default) — each shape sits in a hole cut from the shapes below, so everything is one
  layer with nothing on top of anything. Simplifies the gap filler (all its strokes go in one layer
  underneath) but needs more of them, and produces larger files because cut-out curves are
  duplicated. Easier to pull one component out of the artwork; harder to edit a shape's outline,
  since the matching cut-out must be edited too.
* **Stacked** — shapes sit on top of each other like tiers of a cake. Smallest files and fewest gap
  filler strokes, but the filler strokes must be interleaved between layers, which can let bits of
  them poke out past the shapes they serve — fix with clipping or (preferred) non-scaling strokes.
  Easier to edit a boundary, harder to separate a component.

## Group by

Grouping is organizational, for easier editing downstream. SVG has full group support; **EPS and PDF
have none**; DXF has layers, which are similar.

* **None** — every shape stands alone.
* **Color** — group by fill color. Under `cutouts`, all shapes of a color form one group. Under
  `stacked`, a group must occupy one position in the draw order, so grouping is per color *per
  layer*.
* **Parent** — group by containing shape. A shape fully inside another has that outer shape as its
  parent; everything not contained by anything is grouped at the top level.
* **Layer** — group by draw-order layer (see above).

## Parameterized shapes

Circles, ellipses, rectangles, isosceles triangles, stars (N=3–6), and D-shapes are identified
specially, at arbitrary rotations and corner radii, producing perfect geometry and consistent
corners. Formats with native support for a primitive get the native form, which is easier to edit.

**Flatten** turns all of them into ordinary curves, even where the format supports them natively.

## Allowed curve types

Each format and several options impose their own curve restrictions; the **most restrictive wins**.
Disabling a type triggers a documented fallback chain:

| Type             | Supported by             | Falls back to (in order)             |
| ---------------- | ------------------------ | ------------------------------------ |
| Quadratic Bézier | SVG, DXF, PNG rasterizer | Cubic Bézier → Elliptical Arc → Line |
| Cubic Bézier     | All formats              | Line                                 |
| Circular Arc     | SVG, DXF, PNG rasterizer | Elliptical Arc → Cubic Bézier → Line |
| Elliptical Arc   | SVG, DXF, PNG rasterizer | Cubic Bézier → Line                  |

## Line fit tolerance

Maximum distance between an original curve and the line segments approximating it, when curves must
be flattened. The web app's presets map to `output.curves.line_fit_tolerance`:

| Preset     | Max distance              |
| ---------- | ------------------------- |
| Coarse     | 0.30 px                   |
| Medium     | 0.10 px (the API default) |
| Fine       | 0.03 px                   |
| Super Fine | 0.01 px                   |

## Gap filler

Nearly every vector rasterizer lets the background show through between shapes whose boundaries are
exactly coincident — thin white lines that slice the result into puzzle pieces. It is a defect in
those renderers, and a durable one.

The gap filler draws a narrow stroke *underneath* each such boundary, colored the average of the two
shapes, so nothing shows through.

* **Clip overflow** — clip the filler strokes so their end caps don't poke out from behind the
  shapes. Needed under `stacked` stacking, where filler strokes are interleaved between layers.
* **Non-scaling strokes** — the other (preferred, for SVG) fix for the same overflow problem.
* **Stroke width** — in pixels; **1.5–2.0 px is usually enough** to cover the gaps.

**Cost:** the filler introduces averaged intermediate colors, so a result with
`processing.max_colors=N` will contain more than N colors unless you disable it.

## Non-scaling strokes

Strokes drawn at constant width regardless of zoom.

* **SVG** — arbitrary widths, widely supported, *except Adobe Illustrator*, which ignores the style
  and scales the stroke. The PNG vector rasterizer also has full support.
* **EPS / PDF** — only an unspecified minimal display width (about a pixel or less). Adobe
  discourages them, and Illustrator 2023 handles them with significant defects.
* **DXF** — supports a minimum display width; a very common DXF stroke style.

Recommendation: use non-scaling strokes for **SVG, DXF, and PNG** only.

## Stroke style

Applies when the draw style is Stroke Shapes or Stroke Edges.

* **Non-scaling strokes** — as far as the format permits (see above).
* **Use override color** — by default a stroke takes the color of what it traces: the shape's own
  color when stroking shapes, the average of the two flanking shapes when stroking edges. This
  replaces that with the override color.
* **Override color** — the replacement color (`#RRGGBB`).
* **Stroke width** — in pixels.

## Output size

Controls the dimensions written into the exported file. The web app's presets map onto the
`output.size.*` parameters:

| Preset           | Mapping                                                                      |
| ---------------- | ---------------------------------------------------------------------------- |
| Unchanged        | Format defaults — vector formats natural size, PNG at 4× the vectorized size |
| Scaled           | `output.size.scale`                                                          |
| Set width/height | One of `width`/`height`; the other is computed to preserve aspect ratio      |
| Fit inside box   | Both, with `aspect_ratio=preserve_inset` — fits inside, no overflow          |
| Fill box         | Both, with `aspect_ratio=preserve_overflow` — fills, may overflow one axis   |
| Stretch to box   | Both, with `aspect_ratio=stretch` — non-uniform, matches exactly             |

Pixel sizing uses `px`; physical units (`in`, `cm`, `mm`, `pt`) use the DPI parameters when
converting to pixels for bitmap output. PNG output is also bounded by a maximum result size —
exceeding it is error 1023, not a silent clamp.
