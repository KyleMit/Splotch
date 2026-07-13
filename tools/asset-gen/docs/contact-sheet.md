# The contact sheet — `bin/gen-contact-sheet.mjs`

**Read this before modifying `bin/gen-contact-sheet.mjs` or anything under
`contact-sheet-assets/`.** It is the single review surface for the coloring fills — the review-sheet
role previously split across `gen-coloring-sheet.mjs` lives here now.

## What it builds

A **self-contained HTML contact sheet** of the coloring fills for **one category**, so they can be
reviewed in a browser and published as an Artifact. Images are embedded as base64 data URIs (no
external file refs), so the page renders anywhere — including the Artifact sandbox, whose CSP blocks
linking to local files.

The sheet has a light page background and shows every page as a **light + night pair, side by side**
(light fill left, night fill right). A page's orientations stay together — its wide row, then its
tall row — so each page is judged as one unit. The layout is a single centered column (`max-width`
capped), so the images simply grow with the viewport until they hit that cap.

## CLI

```bash
node --experimental-strip-types --disable-warning=ExperimentalWarning \
  tools/asset-gen/bin/gen-contact-sheet.mjs <category>[/page[-orient]] \
    [--source shipped|samples] [--out FILE]
```

| Argument           | Meaning                                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<category>`       | Exactly **one** category per sheet (`nature`), optionally focused to a page (`nature/ant` — both orientations) or a single cell (`nature/ant-wide`). `all` is rejected: a whole-catalog sheet exceeds the 16 MB Artifact upload cap — build one sheet per category. |
| `--source shipped` | (default) read the committed assets — the live `web/static/coloring/**/*.night.webp` night fills.                                                                                                                                                                   |
| `--source samples` | read fresh night-fill takes from the gitignored `.coloring-samples-dark/` instead — the human review gate before a take is punched and committed. Line art and light fills always come from `web/static` either way.                                                |
| `--out FILE`       | output path (default `.coloring-samples/contact-sheet.html`, gitignored).                                                                                                                                                                                           |

Page IDs come from the real catalog (`web/src/lib/state/books.ts` — one of the four sanctioned
`web/src` imports), so the sheet always matches what will ship. A missing image renders as a
placeholder, not a crash.

## The three views

A sticky toolbar (only the view toggle is sticky, not the whole header) sets the view for every
tile: **Outline → Color → Combined**, defaulting to **Combined**. Tapping a tile cycles that tile on
its own, in the same order. Each tile embeds the layers to reproduce what a child actually sees, not
just the raw generated fill:

* **outline** — the page line art rendered as the canvas renders it: the PEN outline as black lines
  on light paper in the light half; in the night half the CHALK outline (`{page}.chalk.webp`, with
  its deliberate solid whites) as white chalk on dark paper, falling back to inverting the pen for
  un-forked pages (the dark caption notes "no chalk (inverted pen)" when it does).
* **color** — the generated colored fill alone (`.light.webp` in the light half, night fill in the
  dark half).
* **combined** — the real canvas composite: the fills-only fill under the themed line-art layer,
  over the paper. Shipped fills draw **as-is** — they are already fills-only (opaque, outline pixels
  inpainted with bled fill color; `lib/punch-fill.mjs`, `docs/inpainted-fill-punch.md`) and
  re-cutting them with a binary mask at render resolution is exactly what used to stitch a dotted
  dark ring around every line in dark mode. Only `--source samples` runs the in-browser punch
  (themed mask: pen light half, chalk night half), because fresh takes still carry their own
  outlines. **This is the view to trust when judging a fill** — a bug like blown-out eyes only shows
  once the layers are merged.

The compositing mirrors `DrawingCanvas.svelte` + `magicBrush.ts` (ADR-0043/0052).

## The outline % badge

Each **light** tile carries an outline-keep badge: the % of the source line art the fill preserves,
scored by the shared `lib/outline-match.mjs` (the same scorer as the `gen:coloring-fills:audit`
drift audit). It is computed from the **lined raw fill** in `fill-src/` — the shipped fill is
punched fills-only, leaving nothing to register. Night tiles have no badge: night raws have *white*
outlines, which the dark-ink mask can't read. Badge colors: green ≥ 99, yellow ≥ 96, red below.

## Where the code lives

* `bin/gen-contact-sheet.mjs` — assembles the HTML shell, embeds the images, scores the badges, and
  injects the cell data as a JSON global (`window.__CONTACT_SHEET__`). No build-time string
  interpolation reaches the runtime.
* `contact-sheet-assets/contact-sheet.css` — the entire look.
* `contact-sheet-assets/contact-sheet.client.js` — the in-browser render/interaction runtime (canvas
  compositing, view toggle, per-tile cycling).

Change look or behavior in those two real files (they get editor highlighting, Prettier, and ESLint)
— never by interpolating strings in the generator.

## When to rebuild and how to view

Rebuild the sheet **every time you touch an asset** (generate, retouch, regenerate, or ship a fill)
and **publish it with the Artifact tool** — it is self-contained, so it renders in the sandbox; do
NOT hand-composite a PNG. Judge on the Combined view. The Artifact tool caps uploads at **16 MB**;
one category per sheet stays comfortably under it (the generator warns if a sheet ever exceeds the
cap — focus it to a page range if that happens).
