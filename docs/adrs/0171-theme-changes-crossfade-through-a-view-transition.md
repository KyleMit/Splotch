# ADR-0171: Theme Changes Crossfade Through a View Transition

**Status:** Active **Date:** 2026-09

## Context

Switching Light, Dark, or System in Appearance flipped every token in one frame: paper, palette bar,
float surfaces, icon ink, line-art. Only the Notch Band eased, and the Appearance picker's own thumb
slid while the room around it cut. The 2026-09 motion audit (ticket B) asked for the change to read
as one event.

The alternatives weighed:

* **Per-property transitions on the themed surfaces.** Each theme is ~45 tokens, and the
  `prefers-color-scheme` half of the dark declaration (ADR-0052) cannot be transitioned at all, so
  some surfaces would still cut while others eased — and every themed surface would carry a
  transition list forever.
* **A clip-path spread from the picker** (the audit's second option). More theatrical, and a moving
  edge crossing the whole screen, which is the larger motion under a reduced-motion answer.
* **One crossfade of a whole-screen snapshot** with `document.startViewTransition`. The compositor
  owns it, it needs no per-surface opt-in, and an engine without the API runs the callback directly.

## Decision

`applyTheme` in `web/src/lib/theme.ts` stamps `data-theme` inside `document.startViewTransition`,
and `app.css` gives `::view-transition-old(root)` / `::view-transition-new(root)` a
`--theme-crossfade-duration` (320 ms) `ease` crossfade. It swaps directly instead when:

* **Nothing changes.** A restamp to the attribute's current value returns before any transition, so
  the boot fallback in `routes/+page.svelte` and settings hydration never start one and first paint
  stays instant. The pre-paint stamp in `app.html` is untouched.
* **Reduced motion is on.** A full-screen crossfade is a large moving surface even at opacity only,
  so the calm answer keeps the one-frame swap. `theme.ts` reads it through `prefersReducedMotion()`;
  `platform/reducedMotion.ts` has no imports and appearance already loads it, so this adds no edge
  to the startup bundle.
* **The engine has no View Transitions** — Safari before 18 and Firefox before 144, both above the
  Chrome 111 / Safari 16.4 / Firefox 114 floor (`docs/COMPATIBILITY.md`). Those swap as before.

## Consequences

* \+ Every themed surface, including the `prefers-color-scheme` half, changes as one event, with no
  per-surface transition to maintain.
* \+ The fallback path is exactly the old behavior, so an unsupported engine loses nothing.
* − The OS flipping its own scheme while the preference is System does not go through `applyTheme` —
  the attribute never changes, only the media query — so that path still cuts.
* − The snapshot is taken on the next rendering opportunity after the call, so state that repaints
  synchronously in between (a canvas redrawn by an effect on the same theme change) can land in the
  "old" picture. Wrapping the settings state change itself inside the transition would close that,
  at the cost of `theme.ts` owning more than the attribute.
* − The document takes no input while the transition runs. Appearance lives inside Settings, which
  already covers the canvas, so no stroke can be live; if a theme control ever becomes reachable
  mid-stroke, gate the transition at that call site.
* − ADR-0087 measured theme changes on a physical iPad at the frame-gap gate. The crossfade adds two
  full-screen snapshot textures for its duration; that path needs a hardware recapture before its
  cell is trusted again.
