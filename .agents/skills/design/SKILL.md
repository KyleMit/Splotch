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

| Group     | Tokens                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand     | `--brand`, `--brand-rgb` (plain-RGBA brand fallbacks), `--brand-hover`, `--brand-tint-filter`, `--on-brand` (text/icon ink on brand fills), |
|           | `--brand-solid` + `--brand-solid-hover` — the darkened brand **fill that carries text**. `--brand`                                          |
|           | is only 3.4:1 against `--on-brand`, so a solid purple control with a white label fails WCAG AA at                                           |
|           | body size; keep `--brand` for hairlines, focus rings, `accent-color` and tints (3:1 non-text)                                               |
| Spacing   | `--space-1` (4px) … `--space-8` (40px), a 4px-based ramp                                                                                    |
| Radius    | `--radius-xs/sm/md/lg/xl` (4/8/12/16/22px), `--radius-pill`                                                                                 |
| Border    | `--border-width` (1px) — the hairline width; the color comes from a theme token (`--border`,                                                |
|           | `--border-warm`, `--float-border`). Older components still write `1px solid` raw — prefer the token                                         |
| Type      | `--font-size-xs/sm/md/lg/xl/2xl/3xl` (12–28px), `--font-family` (the app-wide sans stack),                                                  |
|           | `--font-mono`, `--font-weight-semibold` (600 — the only weight with a token; 500/700 are still raw                                          |
|           | everywhere they appear)                                                                                                                     |
| Motion    | `--duration-fast/base/slow` (0.15/0.2/0.35s), `--ease-pop` (overshoot), `--ease-pop-strong` (harder                                         |
|           | overshoot — visibly springier than `--ease-pop`, don't converge them), `--ease-glide` (settle)                                              |
| Elevation | `--shadow-sm`, `--shadow-pop`, `--shadow-segment` (neutral; the last is the tight active-segment                                            |
|           | lift — tighter and harder than `--shadow-sm`, don't converge them); `--float-shadow`,                                                       |
|           | `--float-shadow-flyout` (themed, paper cards)                                                                                               |
| Fill      | `--clear-gradient-rest` — the Clear Button's at-rest red, painted identically by the                                                        |
|           | drag-to-clear coachmark ghost so the tutorial can't drift from the real control. Unthemed on                                                |
|           | purpose (ADR-0052): it reads the same on both papers                                                                                        |
| Stacking  | `--z-*` — the cross-component chrome order, `--z-canvas-chrome` (4) up to `--z-screenshot-flash`                                            |
|           | (10000), listed low-to-high in `tokens.ts`. One list, not one context: all root-context except                                              |
|           | `--z-flyout`, which `.actions-panel` caps inside its own. Layers sealed inside a real context (under                                        |
|           | `.canvas-stack`'s `isolation: isolate`, card close buttons) stay plain integers                                                             |
| Theme     | surfaces, borders, text ramp, icon inks, brand/success/danger washes, paper, float-card chrome — the full                                   |
|           | list with per-token docs is in `tokens.ts` (`ThemeTokens`)                                                                                  |

**Adding a token:** it must earn its place — a semantic meaning used (or clearly about to be used)
in 2–3 places. Prefer reusing an existing step of a ramp over minting a near-duplicate. New themed
tokens need both light and dark values (the compiler enforces this). Minting a token isn't done
until it's registered in the vocabulary table above and renders on `/dev/design` — an undiscoverable
token guarantees the next hardcoded duplicate (a failure review has caught three times).

## Primitives

Shared UI primitives live in **`web/src/lib/components/design/`**. They style themselves entirely
from tokens and are for modal/parent surfaces — the canvas-floating controls (Actions Panel, corner
buttons, Clear Button) keep their bespoke paper treatments, and **`/admin` is excluded**: the
primitives are built from themed washes, which would flip on a page that is deliberately light-only
(see the ADR-0071 amendments).

| Primitive              | Use for                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `Button.svelte`        | Text-labeled actions. Variants `brand` / `wash` / `danger` / `ghost`, sizes `md` / `sm`. Not |
|                        | for controls with a **selected state**, whether `role="radio"` (theme picker, report-kind    |
|                        | row) or `aria-pressed` (the controls chips, the orientation segment) — those are pickers,    |
|                        | not actions, and the primitive has no selected variant                                       |
| `Disclosure.svelte`    | A `<details>` panel with the rotating `›` chevron. `summary` snippet + children; the         |
|                        | forwarded `class` carries the call site's own padding/type/color (style it via `:global()`)  |
| `StatusMessage.svelte` | The wash-filled banner a form shows after a submit resolves. `status` = `success` / `error`  |

Shared *global* patterns are classes in **`web/src/app.css`** rather than components:

| Global class (`app.css`)                 | Use for                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `.modal-dialog` / `.modal-fly-in`        | The dimmed, blurred `<dialog>` backdrop, and the fly-in from the opening   |
|                                          | button. AiImageResult has its own open choreography, so it takes           |
|                                          | `.modal-dialog` alone                                                      |
| `.modal-shell`                           | The centered modal card — surface, radius, shadow, and re-inked            |
|                                          | monochrome icons. Width/max-height/overflow stay per-modal. AiImagePrompt, |
|                                          | AiImageResult, ColoringBook, ParentCenter                                  |
| `.modal-close-btn` / `.modal-close-icon` | The outlined 44px close disc in a modal's top-right corner — the same four |
|                                          | modals                                                                     |
| `.corner-button` / `.corner-button-icon` | Muted canvas-corner chrome: a 48px transparent button whose opacity and    |
|                                          | icon tint step idle → hover → pressed. Drawer toggle (ActionsPanel),       |
|                                          | Fullscreen Toggle, Parent Help Button; positioning and z-index stay        |
|                                          | per-component                                                              |
| `.flyout-menu` / `.flyout-option`        | The popover shell and its option buttons — BrushMenu, StrokeWidthMenu      |

They stay classes for one of two reasons: dialogs and imperative DOM need them unscoped, or the
pattern is chrome that several components share verbatim but that hasn't earned a primitive yet.
That second case is how a canvas-floating control de-duplicates: hoist the shared *rules* to
`app.css` with a comment naming the consumers, leaving each component only what genuinely differs —
not a wrapper component, which the bespoke-paper-treatment carve-out above rules out anyway.

**Extract a new primitive at the third duplicate**, not before — and add it to `/dev/design` and the
component table above when you do.

## The living styleguide

`/dev/design` (gated by `PUBLIC_ENABLE_DEV_HARNESS=true`, like the other `routes/dev/*` harnesses)
renders every token group and primitive from the real source objects, with a light/system/dark
toggle. Use it to:

* review a token or primitive change in both themes (screenshot it for the PR — see the
  `pr-screenshots` skill);
* check what already exists before inventing a new value.

## Migration status

The legacy migration is done: every raw value in component `<style>` blocks that mapped to a token
was swapped (same-value, zero visual change). What remains raw is deliberate — documented one-offs
(polaroid/photographic whites, ClearButton's unthemed danger red, confetti colors, canvas chrome)
and the two **deliberately light-only pages** (`/admin`, `/privacy`): a dark theme for them was
considered and declined (owner decision, recorded in the ADR-0071 amendment — don't re-open it).
Their self-contained palettes must not use the themed color tokens: those flip with
`data-theme`/`prefers-color-scheme` and would half-dark-theme them.

CI enforces this with `npm run lint:tokens` — a per-file raw-hex ratchet whose allowlisted baseline
(with per-file reasons) lives in `scripts/lint-token-styles.mjs`. A new raw hex color fails the
Quality job: use a token, or (for a genuine one-off) add a WHY comment and bump the baseline. When
you remove a one-off, lower its baseline entry so the ratchet holds.
