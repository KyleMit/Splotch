# Splotch — "Surprise Me" coloring mode · engineering handoff

Prototype validated in design review. **Ship variants A and B** behind a Parent Center toggle.
Screenshots in `assets/` show the target UX at each step.

## Summary

A **Surprise Tile** in the Coloring Book Picker deals a random coloring page and applies it
**hidden**: the paper looks blank, the Magic Brush is auto-selected, and the picture (color fill AND
line art together) emerges only where the child paints — scratch-off style. At **65% paper
coverage** a finale fades the complete crisp line art in over ~1s with confetti and a gentle chime,
after which it behaves as a normal magic-brush coloring page.

Two shipping modes, chosen by a parent setting (default: **Hidden**):

| Mode                       | Behavior                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Hidden** (variant A)     | No hint at all. Lines + color appear only under strokes. Max surprise.                                                           |
| **Ghost hint** (variant B) | Same, but the page's line art is faintly visible the whole time (~6% opacity, multiply blend) so younger kids know where to aim. |

## Flow (see screenshots)

1. `assets/01-picker-surprise-tile.png` — Surprise Tile is the FIRST tile in the book grid (before
   Clear Page). Soft pastel-rainbow card, big white "?" (gentle wobble), 3 twinkling sparkles, label
   "Surprise!". Same tile chrome as other books (2px border, 12px radius, label strip). Ignore the
   dark dev strip at the top of every screenshot — prototype-only.
2. Tap → modal closes, brief ~0.8s sparkle burst on the paper, page applied hidden.
   `assets/02-blank-canvas-armed.png` — paper looks blank; Magic Brush auto-selected (brush button
   face swaps to the magic icon with the active purple ring, `--brand-wash` bg).
3. `assets/03-variant-a-mid-reveal.png` — Hidden mode mid-reveal: soft-edged ~48px round brush
   reveals fill + lines locally. `assets/04-variant-b-mid-reveal.png` — Ghost mode: same reveal over
   the faint full-page ghost.
4. `assets/05-finale-after.png` — at 65% coverage: full line art fades in (~1s ease), confetti burst
   from upper-center (palette colors), soft 3-note chime (E5→A5→E6 sines, ~0.12 gain, 0.9s decay),
   gentle scale pulse (1 → 1.025 → 1, 0.9s). Painting continues as normal magic-brush coloring
   afterwards.

## Implementation notes (mapped to the codebase)

### Picker (`ColoringBook.svelte`)

* Add the Surprise Tile as the first tile in the books grid (before the conditional Clear Page
  tile). Reuse `.coloring-tile` chrome; the rainbow face is
  `linear-gradient(140deg,#ffd9e8,#ffefc2 28%,#d6f2cf 54%,#cfe6ff 76%,#e6d9ff)`.
* On tap: pick a uniformly random page from all licensed books for the current `paperOrientation`
  (exclude the currently applied page), call `setOverlayPage` with a new `hidden: true` flag,
  `selectBrush('magic')`, close the modal.

### Reveal engine (`engine.ts` / `DrawingCanvas.svelte`)

The magic brush already reveals the `.light` fill through stroke alpha. Surprise mode adds:

* **Hidden overlay**: while `surpriseActive`, don't render the outline overlay img normally. Keep an
  offscreen **reveal mask** (existing magic-brush stroke alpha works): the composite is
  `mask ⊗ (light fill)` plus `mask ⊗ (outline)` blended with `multiply` — so lines appear under the
  brush together with color. Prototype-verified pipeline per frame:
  `clearRect → drawImage(mask) → globalCompositeOperation='source-in' → drawImage(art)`.
* **Ghost mode**: additionally render the outline overlay at `opacity: 0.06` with
  `mix-blend-mode: var(--lineart-blend)` (multiply / screen in dark mode).
* **Brush**: soft round stamp, ~48 CSS px diameter, radial gradient hard to 45% then fade to 0,
  stamp spacing ≈ 0.35 × radius. A tiny white sparkle trail at the pointer sells the magic.
* **Coverage**: downsample the mask to ~96×144, count alpha > 60, throttle to ~150ms during
  strokes + once on pointerup. 65% threshold felt right in review; keep it a constant so it's easy
  to tune (prototype exposed 40–90%).
* **Finale** (once, at threshold): fade the full outline overlay from its current opacity to 1 over
  1s ease; confetti (~130 particles, palette colors, gravity + rotation, 2.4s, fade after 60%);
  chime (respect the existing sound setting); then clear `surpriseActive` — the page is a normal
  applied coloring page from here (undo, clear, rotation lock per ADR-0050 all apply).

### Parent Center (`parent/ControlsSection.svelte` or a new row)

* Toggle: **"Surprise pages: Hidden / Ghost hint"** (two-option control, default Hidden). Persist
  alongside the other settings; no child-facing text anywhere in the feature.

### Assets

* No new assets needed: uses each page's existing `.outline.webp` + `.light.webp` (pixel-aligned).
  Note the prototype's handoff PNGs' "light" files were flattened (no alpha); production
  `.light.webp` files are already outline-punched, which only improves the composite.

## QA checklist

* [ ] Surprise page never repeats the immediately previous page.
* [ ] Magic brush auto-selected; picking a color/brush mid-reveal keeps the mask intact.
* [ ] Finale fires exactly once; painting after finale keeps revealing color normally.
* [ ] Ghost hint invisible in screenshots/export until revealed (export compositor must not bake the
      6% ghost).
* [ ] Dark mode: ghost + revealed lines use the `.chalk` art / `--lineart-*` tokens.
* [ ] Rotation with ink on canvas keeps the locked orientation art (ADR-0050).
* [ ] Clear (trash) and Clear Page both fully exit surprise mode.
* [ ] Sound off in Parent Center silences the finale chime.

## Prototype

The interactive prototype lives in the Claude Design project (not committed) — its dev strip
switches variants A/B (plus two explored-but-cut variants C "develop" and D "big-shapes hint"),
shuffle/reset, live coverage readout with the finale threshold tick. The dark dev strip visible at
the top of every screenshot here is that prototype chrome, not product UI.
