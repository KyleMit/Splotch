# Crisp the Chalk's Edges at Render Time, Not the Punch or the App Compositor

**Decision record** — in force. **Date:** 2026-07

## Context

The first shipped chalks (nature) carried the same soft 2–3px antialias ramp and faintly-grey ground
as the pen outlines — `toInkPolarity` reused the pen tools' gentle `linear(1.25, -18)` contrast,
whose comment warned only that a hard threshold "would jaggy the lines". On the light theme that
softness is invisible: the pen multiplies over near-white paper, so a 6% deviation from white stays
a 6% deviation. Dark mode is not symmetric. The chalk is shown by invert + **screen over a
near-black board** (ADR-0052), where human vision is ratio-based — the same 6% deviation from white
becomes a ~40% relative brightening of a dark pixel — and the night punch (`lib/punch-fill.mjs`)
cuts the fill with a **binary** threshold (luma 150) that lands mid-ramp. Lossy webp ringing jitters
which edge pixels cross that threshold, and every spuriously punched fill pixel shows dark paper
that the screened mid-grey chalk above it cannot re-brighten: `screen(#211f29, inv(150)) ≈ 133`
against a ~200+ fill and a 255 line. The combined dark-mode image wore a dirty ring of dark specks
around every chalk line (first reported on nature's proof sheet, 2026-07).

## Decision

Crisp the **chalk asset itself** with a smoothstep S-curve centered on the punch threshold
(`lib/crisp-ink.mjs`, ramp 110→190 around 150): near-white pins to pure white, near-ink to pure ink,
and only a ~1px antialias ramp survives. `gen-coloring-chalk.mjs` applies it in `toInkPolarity`, and
the shipped nature chalks were migrated through the identical curve (all 12 kept 100% global /
≥99.3% worst-tile registration; mid-grey edge pixels fell ~4.7×) followed by a night re-punch.

Centering the ramp on the punch threshold is what makes the migration safe: the luma-150 crossing —
the punch boundary, and the stroke width every ink-on-white analysis tool measures — does not move.

## Alternatives rejected

* **Feather the night punch** (alpha follows the ramp instead of binary): measurably worse than
  crisping on the same crops — the speckle survives because the ramp noise itself remains, and it
  forks the shared punch math per theme.
* **Change the app compositor** (alpha-blend the chalk instead of invert+screen): touches ADR-0052's
  runtime rendering for an asset-side defect, and every un-forked page still relies on the blanket
  invert.

## Consequences

* Chalks are near-binary; pens keep their soft antialiasing (light mode wants it, and light
  rendering hides what dark rendering amplifies).
* Crisper edges compress slightly worse: the nature chalks grew ~10–15% (~10 KB each) at the same
  q92.
* Anything that derives from the chalk (night fills conditioning on it, the night punch mask,
  `--rescore` gating) reads the crisped asset — no other tool needs to know the curve exists.
