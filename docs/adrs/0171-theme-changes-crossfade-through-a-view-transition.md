# ADR-0171: Theme Changes Crossfade Through a View Transition

**Status:** Active (amended 2026-09-26: a veil on the card replaces the view transition) **Date:**
2026-09

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

## Amendment (2026-09-26): a veil on the card, not a whole-screen snapshot

The hardware recapture this record asked for came back red on both release-gate engines (#2225):

* **Android Chrome:** the first frame after the tap became a 50 ms three-beat gap. Starting a view
  transition captures the old screen and holds rendering until the update callback has run.
* **iPad native WKWebView:** a new 31–37 ms frame landed about 350 ms after the tap, where the 320
  ms crossfade ends and the snapshot tree is torn down.

With Reduce Motion on, which swaps without a transition, every one of those cells passed on both
devices. So the snapshot was the cost, not the theme change.

**Decision.** `applyTheme` now stamps `data-theme` at once, without a view transition. Before the
stamp it reads each open modal card's surface color (`.modal-shell[open]`). After it, it lays a
`.theme-veil` of that previous color over the card and fades it from opacity 1 to 0 over the same
320 ms with `ease`, then removes it. Parents only change the theme from Settings (Appearance, or
Night Mode in the landscape phone's compact shell), so the card is where they are looking. Opacity
on one card-sized layer is compositor work, with nothing to capture or tear down. The rest of the
screen sits under the dialog's 60% black, blurred scrim and swaps at once. A veil there would change
what the backdrop blur reads on every frame of the fade, and ADR-0157 measured that kind of repaint
under the blur as a frame cost on the iPad. A change mid-fade replaces the veil with one in the
surface the card has just reached. Reduced motion, a restamp that changes nothing, and a change with
no card open still swap at once, as before.

What the parent sees changes in two ways. The card's surface still eases from the old color to the
new one. Its text and controls now fade in over the new surface instead of crossfading from the old
ink. And the scrimmed room behind the card cuts under the scrim instead of fading. Engines without
View Transitions (Safari 16.4–17.x, Firefox 114–143) now get the veil too, because it needs only the
Web Animations API, which is below the floor.

**Measured (Android physical, `--actions=theme`).** Against an unchanged-`main` control from the
same harness on the same phone: Chrome arms interleaved, native arms back to back with each build
installed in turn. Each sweep is one warm-up and three scored repeats:

| Cell (post-action max per scored repeat) | `main` (view transition)     | This change (veil)      |
| ---------------------------------------- | ---------------------------- | ----------------------- |
| Web portrait-light, dark to light        | n = 9, 3 over 33.5, max 50.1 | n = 9, 0 over, max 33.3 |
| Web portrait-light, light to dark        | n = 9, 3 over 33.5, max 50.0 | n = 9, 0 over, max 17.4 |
| Web landscape-light, enable Night Mode   | n = 6, 6 over 33.5, max 50.1 | n = 6, 0 over, max 33.5 |
| Web landscape-light, disable Night Mode  | n = 6, 2 over 33.5, max 50.0 | n = 6, 0 over, max 16.8 |
| Native portrait-light, dark to light     | n = 9, 4 over 33.5, max 41.7 | n = 9, 0 over, max 25.0 |
| Native portrait-light, light to dark     | n = 9, 5 over 33.5, max 42.8 | n = 9, 0 over, max 25.0 |

The canonical full sweeps of all four modes, on both Android rows, are recorded on the PR that made
this change. Readiness is not slower. `data-theme` now flips inside the tap's own task, where the
view transition flipped it only after the capture. In every arm the ready predicate already holds at
the runner's first poll, so the readiness figures measure when that poll lands. They differ between
arms by less than the 50 ms poll interval, except `light to dark` on Chrome, where the view
transition's P50 was about 100 ms against about 45 ms now.

**Not validated on the iPad.** The same code runs in iPad Safari and the iPad native app, whose
theme-switch cells (all four modes of both iPad rows) are red at the view-transition build. Nothing
in this amendment measures them. They stay red until an iPad recapture, which #2225 tracks.

**Reopen** if an iPad recapture shows the veil's fade or removal costing a frame, or if a theme
control becomes reachable outside a modal card, where no veil is laid.
