---
name: design
description: Design-system reference — the token vocabulary (color, spacing, radius, type, elevation, motion), the primitives in lib/components/design/, and the rules for styling UI. Use before writing or changing any component styles, picking a color/size/shadow/easing, adding a UI element, or when visual consistency or the /dev/design styleguide comes up.
---

# Splotch design system

The visual language is defined once, in **`web/src/lib/design/tokens.ts`** (ADR-0071), and emitted
as CSS custom properties into **`web/src/tokens.css`** by `npm run gen:tokens`. Custom properties
pierce Svelte's style scoping, so every component references them directly via `var(--…)`.

## Hard rules

1. **Never edit `web/src/tokens.css`** — it's generated. Edit `tokens.ts`, run `npm run gen:tokens`,
   commit both. CI fails on drift (`npm run gen:tokens:check`). Nothing regenerates it
   automatically: `npm run dev` and the Netlify build both serve the *committed* file (unlike
   `gen:icons`/`gen:releases` it's deliberately not in `prebuild` — the Netlify build runs on the
   platform-default Node, which may lack `--experimental-strip-types`), so a `tokens.ts` edit is
   invisible until you rerun `gen:tokens`. If a token change doesn't show up, that's why.
2. **No raw values where a token exists.** In component `<style>` blocks, don't write hex colors, px
   radii, px font sizes, shadow literals, or easing curves that a token already covers — use the
   `var(--…)`. A raw value is only acceptable for genuine one-offs (e.g. the polaroid frame's
   photographic white, confetti colors, canvas ink) — and say why in a comment if it isn't obvious.
3. **Themed color goes through the theme tokens.** Light and dark values live side by side in
   `tokens.ts` (`themes.light` / `themes.dark` — the shared `ThemeTokens` interface keeps them
   structurally identical). If a new color should differ in dark mode, it belongs there, not in a
   component.
4. **JS never mirrors a token by hand.** The few JS consumers of token values (canvas export fill,
   Notch Band, theme-color meta) import from `$lib/design/tokens` — see `lib/theme.ts`
   (`PAPER_COLORS`). Don't paste a hex into TypeScript.

## Token vocabulary

| Group     | Tokens                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------- |
| Brand     | `--brand`, `--brand-hover`, `--brand-tint-filter`                                                         |
| Spacing   | `--space-1` (4px) … `--space-8` (40px), a 4px-based ramp                                                  |
| Radius    | `--radius-xs/sm/md/lg/xl` (4/8/12/16/22px), `--radius-pill`                                               |
| Type      | `--text-xs/sm/md/lg/xl/2xl/3xl` (12–28px)                                                                 |
| Motion    | `--duration-fast/base/slow` (0.15/0.2/0.35s), `--ease-pop` (overshoot), `--ease-glide` (settle)           |
| Elevation | `--shadow-sm`, `--shadow-pop` (neutral); `--float-shadow`, `--float-shadow-flyout` (themed, paper cards)  |
| Theme     | surfaces, borders, text ramp, icon inks, brand/success/danger washes, paper, float-card chrome — the full |
|           | list with per-token docs is in `tokens.ts` (`ThemeTokens`)                                                |

**Adding a token:** it must earn its place — a semantic meaning used (or clearly about to be used)
in 2–3 places. Prefer reusing an existing step of a ramp over minting a near-duplicate. New themed
tokens need both light and dark values (the compiler enforces this).

## Primitives

Shared UI primitives live in **`web/src/lib/components/design/`**. They style themselves entirely
from tokens and are for modal/parent/admin surfaces — the canvas-floating controls (Actions Panel,
corner buttons, Clear Button) keep their bespoke paper treatments.

| Primitive       | Use for                                                                                 |
| --------------- | --------------------------------------------------------------------------------------- |
| `Button.svelte` | Text-labeled actions. Variants `brand` / `wash` / `danger` / `ghost`, sizes `md` / `sm` |

Shared *global* patterns (modal shell, close button, corner buttons, dialog fly-in) remain classes
in `app.css` because dialogs and imperative DOM need them unscoped.

**Extract a new primitive at the third duplicate**, not before — and add it to `/dev/design` and
this table when you do.

## The living styleguide

`/dev/design` (gated by `PUBLIC_ENABLE_DEV_HARNESS=true`, like the other `routes/dev/*` harnesses)
renders every token group and primitive from the real source objects, with a light/system/dark
toggle. Use it to:

* review a token or primitive change in both themes (screenshot it for the PR — see the
  `pr-screenshots` skill);
* check what already exists before inventing a new value.

## Migration status

Older components still carry pre-token raw values (hex colors, literal radii and font sizes). When
you touch a component's styles for any reason, migrate the values you touch to tokens — same-value
swaps, no visual change. Don't mass-migrate unrelated files in a feature PR.
