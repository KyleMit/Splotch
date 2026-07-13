# Idea 20 — Upscale / resolution audit vs device DPR

**Verdict: WORKED** (as an audit — the question is answered empirically; the deterministic upscale
path was tested and rejected on evidence).

## 1. What the app actually does with the art (code-grounded)

Two independent render paths consume a coloring page (`web/src/lib/components/DrawingCanvas.svelte`,
`web/src/lib/drawing/engine.ts`, `web/src/lib/drawing/magicBrush.ts`):

* **Line art** — the overlay `<img id="coloringOverlay">`, `object-fit: contain` in the paper area.
  The *browser* rasterizes it at full native `devicePixelRatio`, so on a 3x phone the outline
  renders at DPR 3.
* **Colored fill** — the magic-brush sheet, an offscreen canvas the size of the engine's *paper*:
  `CSS size x renderScale`, where `renderScale = min(devicePixelRatio, 2)` (`MAX_RENDER_SCALE = 2`,
  ADR-0015). So the fill can **never** be displayed above 2x CSS, regardless of DPR.

Canvas CSS area = viewport minus the palette bar (landscape single-column: 84px wide; portrait row:
~75px tall) and safe-area insets; the art contain-fits inside it.

## 2. Measured rendered sizes (Playwright, emulated profiles)

Measured live: dev server + Playwright Chromium per profile, applying a Creatures page and reading
`#coloringOverlay`'s rect, `naturalWidth`, DPR, and the canvas backing store
(`code/idea20-measure.mjs`, raw data `measurements.json`). Assets are 1536x1024 (wide) / 1024x1536
(tall).

| Profile                          | Viewport@DPR  | Art box (CSS px) | Outline display (device px) | Outline x native | Fill sheet (px) | Fill x native |
| -------------------------------- | ------------- | ---------------- | --------------------------- | ---------------- | --------------- | ------------- |
| iPhone SE, portrait              | 375x667@2     | 375x563          | 750x1125                    | **0.73**         | 750x1125        | 0.73          |
| iPhone 15, portrait              | 393x852@3     | 393x590          | 1179x1769                   | **1.15**         | 786x1179        | 0.77          |
| iPhone 15, landscape             | 852x393@3     | 590x393          | 1769x1179                   | **1.15**         | 1179x786        | 0.77          |
| iPhone 16 Pro Max, landscape     | 932x430@3     | 645x430          | 1935x1290                   | **1.26**         | 1290x860        | 0.84          |
| Pixel 8, portrait                | 412x915@2.625 | 412x618          | 1082x1622                   | **1.06**         | 824x1236        | 0.81          |
| Pixel Tablet / Tab S9, landscape | 1280x800@2    | 1196x797         | 2392x1595                   | **1.56**         | 2392x1595       | **1.56**      |
| iPad Air 11, landscape           | 1180x820@2    | 1096x731         | 2192x1461                   | **1.43**         | 2192x1461       | **1.43**      |
| iPad Pro 13, landscape           | 1366x1024@2   | 1282x855         | 2564x1709                   | **1.67**         | 2564x1709       | **1.67**      |
| iPad Pro 13, portrait            | 1024x1366@2   | 861x1291         | 1721x2582                   | **1.68**         | 1721x2582       | **1.68**      |

Answer to the core question: **yes — every 2x tablet displays the asset above native size, up to
1.67–1.68x on a 13" iPad Pro** (both outline and fill, since DPR 2 = the renderScale cap). On 3x
phones only the *outline* runs slightly hot (1.15–1.26x); the fill is capped at renderScale 2 and
stays *below* native (0.77–0.84x). 2x phones are below native everywhere. (Emulation has zero
safe-area insets; real devices lose a few more px, so these are upper bounds.)

## 3. Deterministic path tested: lanczos 2x + re-punch (dragon-wide)

`code/idea20-upscale.mjs` (run from `tools/asset-gen/`):

1. Lanczos3-upscaled `fill-src/creatures/dragon-wide.light.raw.webp` and the pen outline 2x ->
   3072x2048.
2. Re-punched at 3072 (same luma<150 mask + bleed-inpaint logic as `lib/punch-fill.mjs`; punch took
   ~0.2s at 4x pixels).
3. Simulated the worst-case display (iPad Pro 13 landscape, 2564x1709 device px) for both pipelines:
   shipped 1536 fill -> bilinear up 1.67x (what canvas `drawImage` does) vs upscaled 3072 fill ->
   bilinear down; identical outline scaling in both (lanczos3, standing in for the browser's `<img>`
   resampler); composited fill x outline (multiply = light mode).
4. Same-crop 2x zoomed comparisons of line-adjacent detail (face/eyes, flower).

**Result: just bigger, not better.**

* Combined view (what the child sees): visually indistinguishable — `face-shipped-2x.webp` vs
  `face-upscaled-2x.webp`, `flower-shipped-2x.webp` vs `flower-upscaled-2x.webp`. Display-space mean
  abs diff 0.83/255.
* Fill-only view: the re-punch at 3072 *does* produce cleaner, smoother inpaint seams under the
  lines (`face-shipped-fill-2x.webp` vs `face-upscaled-fill-2x.webp`) — but those pixels sit exactly
  under the overlay's line art, which covers them by design (that is the point of the inpainted
  punch). The improvement is invisible in the composite.
* Lanczos invents no detail: the fill regions are flat colors, so upscaling only moves *where* the
  resampling blur happens, not how much detail exists.
* **Shipping cost is real:** dragon-wide.light.webp 92.7 KB -> 218.7 KB (2.36x). The catalog ships
  188 fills (15 MB) + 188 outlines/chalks (18 MB); a blanket 2x upscale is roughly 33 MB -> ~75 MB
  of committed/downloaded art for no visible gain.

## 4. Model resolution probe (2 API calls)

* `gemini-2.5-flash-image` (the pipeline's model, every generator): `imageConfig.imageSize: '2K'` is
  **silently ignored** — returned 1248x832 at 3:2 (~1MP class). The current model **cannot**
  regenerate at higher resolution.
* `gemini-3-pro-image-preview` with `imageSize: '2K'` returned **2528x1696** — almost exactly the
  worst-case measured demand (2564x1709).

Cost implication (published pricing at time of writing; verify before acting): 2.5-flash-image image
output ~ $0.039/image; gemini-3-pro-image at 1K/2K ~ $0.13–0.14/image (~3.4x), 4K ~
$0.24. A full-catalog 2K regen ~ 188 fills x ~$0.14 ~ $26 before retries (the drift gates typically
consume multiple attempts per page), plus chalk outlines. The money is trivial; the *real* cost is a
model swap: new art style, re-validation of every outline-match/eye/solidity gate, human re-review
of ~100 pages, and the same ~2x+ payload growth.

## 5. Recommendation

**Keep 1024x1536 / 1536x1024. Do not lanczos-upscale. Do not regen now.**

* Phones (all DPRs): adequate by construction — the fill is capped at renderScale 2 (ADR-0015) and
  stays under native; the outline's 1.15–1.26x overscale on 3x phones is imperceptible for thick
  toddler line work.
* 2x tablets landscape: genuinely undersupplied (1.43–1.68x), but the evidence shows the only
  fixable-without-regen component (the fill) gains nothing visible from upscaling, and the softness
  that remains lives in the *outline* — thick, high-contrast strokes that survive 1.7x browser
  upscaling gracefully (see the combined crops: lines stay clean at 2x zoom on top of the 1.67x
  display scale, i.e. ~3.3x total magnification).
* If tablet crispness ever becomes a priority (e.g. a 13"-tablet marketing push), the correct path
  is **regen at 2K via a model that honors `imageSize`** (gemini-3-pro-image-preview delivered
  2528x1696 — a near-exact match for the worst case), applied to the *outlines first* (they carry
  the visible edges), accepting the model-swap re-validation cost. Consider shipping 2K art only for
  the variants tablets actually hit, or responsive variants, to contain the payload.

## Limitations

* Browser resampling approximated with sharp kernels (bilinear for canvas `drawImage`, lanczos3 for
  `<img>`); Chromium's actual filters differ in detail but not in information content.
* Emulated profiles have no safe-area insets and no browser chrome; real-device art boxes are
  slightly smaller (measurements are upper bounds).
* Only the light theme (multiply composite) was simulated; night mode has identical geometry (screen
  blend over chalk) so the conclusions carry.
* Desktop web with a large low-DPR window can also exceed native (e.g. ~2400 CSS px canvas at DPR 1
  -> 1.56x) — same magnitude as tablets, same conclusion; not separately measured.
* One page tested for the upscale path (dragon-wide, dense detail); flat-fill + thick-line style is
  uniform across the catalog, so generalization risk is low.

## Files

* `measurements.json` — raw per-profile data.
* `code/idea20-measure.mjs` — Playwright measurement (needs the run-splotch driver's dev server on
  :5199; lived in `screenshots/` when run).
* `code/idea20-upscale.mjs` — upscale + re-punch + display-simulation harness (lived in
  `tools/asset-gen/` when run; `IDEA_DIR` env sets output).
* `code/idea20-res-probe.mjs` — Gemini imageSize probe (`node idea20-res-probe.mjs <model> <size>`).
* `face-*.webp`, `flower-*.webp` — 560x560 same-crop comparisons (280px display-space crops at 2x
  nearest zoom): `*-shipped-2x` vs `*-upscaled-2x` (combined view), `*-shipped-fill-2x` vs
  `*-upscaled-fill-2x` (fill only, punch seams visible).
