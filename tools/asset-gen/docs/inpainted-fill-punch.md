# Punch by Inpainting — Shipped Fills Are Opaque, Outline Pixels Replaced by Bled Fill Color

**Decision record** — in force.
**Date:** 2026-07

## Context

The build-time punch (ADR-0043 follow-up) cut a fill's outline pixels to
**transparency**: alpha 0 where the line art is ink-dark, 255 elsewhere. That
is exact at native resolution — the overlay line covers every hole — but the
app and the contact sheet always display fills **downscaled** (a 1024×1536
page on a ~390px-wide phone), and resampling breaks the covering in two ways:

- **The alpha edge blends with the paper.** A downscaled boundary pixel is
  part fill, part hole; over the dark board the hole contributes near-black,
  and the screened chalk above it cannot re-brighten a half-paper pixel back
  to the fill's level. Every bright region (eye whites, cheeks, clouds, the
  bee's yellow) grew a dark rim where it met a line.
- **Independent resample phases.** The fill's alpha edge and the line art's
  ink edge are resampled as two unrelated images; where their subpixel phases
  disagree the rim becomes a **dotted dark ring** stitched around the line.
  The contact-sheet client made this worse by re-cutting shipped fills with a
  binary destination-out mask at render resolution (fixed in the same change:
  the in-browser punch now runs only for `--source samples`, whose raw takes
  genuinely carry outlines).

The chalk edge crisping (`docs/chalk-edge-crisping.md`) cleaned the native-
resolution composite but could not fix this: the artifact is created by the
display-time resample, not by the assets' edge quality.

## Decision

Punch by **inpainting**: every outline-masked pixel's color is replaced by the
surrounding fill color, bled inward ring by ring (`bleedUnderMask` in
`lib/punch-fill.mjs`), and the shipped fill is **fully opaque** — no alpha
plane at all. The mask math (line-art luma < 150, pen for light / chalk for
night) is unchanged.

ADR-0043's "reveal fills only" contract still holds — the fill carries no copy
of the outlines, so nothing can ghost — but the pixels under a line now hold
plausible fill color instead of a hole. There is no alpha edge to resample, so
the composite is smooth at every display scale: the overlay alone decides what
a line looks like, and misregistration between fill and line shows fill color,
never paper and never a ghost line.

## Alternatives rejected

- **Feathered alpha** (grade the punch across the line's antialias ramp):
  still an alpha edge blending with paper, just a softer one — the rim
  survives downscale.
- **Compositor change** (alpha-blend a white line overlay instead of CSS
  invert + screen): fixes the math but rewrites ADR-0052's runtime rendering
  and forfeits "no pre-generated inverted assets" for a defect that lives in
  the shipped asset.

## Consequences

- Shipped fills are plain opaque RGB webp — slightly **smaller** than before
  (the transparent era paid for a lossless binary alpha plane;
  `web/static/coloring/` dropped ~1 MB total).
- The seam of blended color running down the middle of each inpainted stroke
  is never visible by construction — the overlay line always covers it at any
  scale, because covering it no longer requires out-brightening dark paper.
- `magicBrush.ts` is untouched: the reveal draws whatever the fill image
  holds, and the overlay draws lines on top in both themes.
- The sharp RGBA/`joinChannel` encode trap documented in `CLAUDE.md` no longer
  applies to the punch (nothing ships alpha), but stays documented for any
  future alpha-carrying asset.
