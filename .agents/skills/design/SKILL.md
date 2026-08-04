---
name: design
description: Design-system reference — the token vocabulary (color, spacing, radius, type, elevation, motion), the primitives in lib/components/design/, the voice & copy rules, brand/iconography, and the rules for styling UI. Use before writing or changing any component styles, picking a color/size/shadow/easing, adding a UI element, writing user-facing copy, or when visual consistency or the /design styleguide comes up.
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

## Voice & copy

Two voices, one maker. Kid-adjacent copy is playful and warm ("Open it up, hand over the device, and
let them make a mess. That's the whole idea."). Parent-facing copy — Settings, store listings,
privacy — is plain, professional, and direct ("We never keep a copy of your key.").

* **Sentence case everywhere** — buttons, labels, headings ("Clear drawing", "Save screenshot").
  Title Case only for proper feature names (Night Mode, Advanced Controls, Guided Access).
* **"You" is the parent, "they"/"kids" is the child.** First-person-plural "we" for the maker's
  promises.
* **No emoji in UI chrome.** One documented exception: `/privacy` uses emoji as friendly bullet
  leads on its "no ___" highlight cards — legal copy softened for a 30-second parent skim.
* **Short, concrete, reassuring.** Feature bullets lead with verbs ("Draw with big, chunky,
  crayon-like strokes"); Settings help text is one calm sentence.
* **Honest about tradeoffs** — copy explains *why* ("so playtime stays in Splotch").

## Token vocabulary

Every token carries a one-line "reach for it when…" rule in **`web/src/lib/design/tokenUsage.ts`**,
rendered beside its specimen on `/design` (ADR-0097). The table below is the shape of the
vocabulary; the usage rules are the law — start from the defaults callout at the top of `/design`'s
Foundations and only reach past a default when a rule says so.

| Group     | Tokens                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------ |
| Brand     | `--brand`, `--brand-rgb` (plain-RGBA brand fallbacks), `--on-brand` (the ink on brand fills).          |
|           | `--brand` is the identity hue — hairlines, focus rings, `accent-color`, tints, and **textless** fills  |
|           | (it is only 3.4:1 against `--on-brand`). A brand fill that carries a label rests on the themed         |
|           | `--brand-solid`, and every brand fill hovers through the same ramp (`--brand-solid`, then              |
|           | `--brand-solid-hover`) — there is deliberately no second, unthemed hover step (ADR-0097)               |
| Spacing   | `--space-1` (4px) … `--space-8` (40px), a 4px-based ramp                                               |
| Radius    | `--radius-sm/md/lg/xl` (8/12/16/22px), `--radius-pill` — inline chips sm, controls md, cards lg,       |
|           | sheet-scale surfaces xl, pills pill. There is no xs step                                               |
| Border    | `--border-width` (1px) — the hairline width; the color comes from a theme token (`--border`,           |
|           | `--border-warm`, `--float-border`). Older components still write `1px solid` raw — prefer the token    |
| Type      | `--font-size-xs/sm/md/lg/xl/2xl` (12/14/16/18/22/28px) — fine print · UI chrome · body prose ·         |
|           | ledes/section heads · modal titles · page H1s — plus `--font-size-display` (fluid 34–46px), the        |
|           | standalone parent pages' PageShell hero. `--font-family`, `--font-mono`,                               |
|           | `--font-weight-medium/semibold/bold` (500/600/700 — quiet labels · buttons/active states/sub-heads ·   |
|           | headings; body prose stays at the untokenized 400 default)                                             |
| Motion    | `--duration-fast/base/slow` (0.15/0.2/0.35s); two curves only — `--ease-pop` (springy overshoot:       |
|           | anything that pops in or celebrates) and `--ease-glide` (anything that settles or leaves). Pair        |
|           | every curve with a duration token, never a raw seconds literal                                         |
| Elevation | `--shadow-control` (the tight lift on a small raised control — modal close disc, selected segment      |
|           | thumb), `--shadow-pop` (deep overlay lift under modal cards); `--float-shadow`,                        |
|           | `--float-shadow-flyout` (themed, paper cards)                                                          |
| Fill      | `--clear-gradient-rest` — the Clear Button's at-rest red, painted identically by the                   |
|           | drag-to-clear coachmark ghost so the tutorial can't drift from the real control. Unthemed on           |
|           | purpose (ADR-0052): it reads the same on both papers                                                   |
| Stacking  | `--z-*` — the cross-component chrome order, `--z-canvas-chrome` (4) up to `--z-polaroid`               |
|           | (1003), listed low-to-high in `tokens.ts`. One list, not one context: all root-context except          |
|           | `--z-flyout`, which `.actions-panel` caps inside its own. Layers sealed inside a real context (under   |
|           | `.canvas-stack`'s `isolation: isolate`, card close buttons) stay plain integers                        |
| Theme     | surfaces, borders, the three-step text ramp (`--text-strong` headings · `--text` body ·                |
|           | `--text-soft` de-emphasized, pinned to hold 4.5:1 at small sizes), icon inks, brand/success/danger     |
|           | washes, paper, float-card chrome — the full list with per-token docs is in `tokens.ts` (`ThemeTokens`) |

**Adding a token:** it must earn its place — a semantic meaning used (or clearly about to be used)
in 2–3 places. Prefer reusing an existing step of a ramp over minting a near-duplicate (ADR-0097
pruned the last crop of ≤2-consumer tokens; don't regrow them). New themed tokens need both light
and dark values (the compiler enforces this). Minting a token isn't done until it's registered in
the vocabulary table above, has its usage rule in `tokenUsage.ts` (the `Record` types make the
compiler demand one), and renders on `/design` — an undiscoverable token guarantees the next
hardcoded duplicate (a failure review has caught three times).

## Primitives

Shared UI primitives live in **`web/src/lib/components/design/`**. They style themselves entirely
from tokens and are for modal/settings surfaces — the canvas-floating controls (Actions Panel,
corner buttons, Clear Button) keep their bespoke paper treatments, and **`/admin` is excluded**: the
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
|                                          | AiImageResult, ColoringBook, SettingsModal                                 |
| `.modal-close-btn` / `.modal-close-icon` | The outlined 44px close disc in a modal's top-right corner — the same four |
|                                          | modals                                                                     |
| `.corner-button` / `.corner-button-icon` | Muted canvas-corner chrome: a 48px transparent button whose opacity and    |
|                                          | icon tint step idle → hover → pressed. Drawer toggle (ActionsPanel),       |
|                                          | Fullscreen Toggle, Settings Button; positioning and z-index stay           |
|                                          | per-component                                                              |
| `.flyout-menu` / `.flyout-option`        | The popover shell and its option buttons — BrushMenu, StrokeWidthMenu      |

They stay classes for one of two reasons: dialogs and imperative DOM need them unscoped, or the
pattern is chrome that several components share verbatim but that hasn't earned a primitive yet.
That second case is how a canvas-floating control de-duplicates: hoist the shared *rules* to
`app.css` with a comment naming the consumers, leaving each component only what genuinely differs —
not a wrapper component, which the bespoke-paper-treatment carve-out above rules out anyway.

**Extract a new primitive at the third duplicate**, not before — and add it to `/design` and the
component table above when you do.

## Brand & iconography

* **Mascot & marks.** Splotchy (`static/splotchy.svg`) is the mascot and PWA icon, rendered
  structurally via `SplotchyIcon.svelte` (it's in `NON_RENDERABLE_ICONS`, so `<Icon>` won't take
  it). The wordmark is plain Quicksand — no drawn logo. The crayon strip (`CrayonStrip.svelte`,
  seven pills in rainbow order, hues looked up from `lib/palette.ts`) is the wordmark's companion
  mark on parent pages.
* **Icons are first-party inline SVG** through `<Icon name="…">` — no icon font, no CDN set, no
  emoji-as-icons. Monochrome glyphs bake a near-black fill and get re-inked with
  `fill: var(--icon-ink)` on themed surfaces; full-color "spot" icons carry their own palette and
  are **never tinted** — the split is the `COLOR_ICONS` set in `Icon.svelte`. Adding an icon: see
  the icon steps in `.claude/rules/svelte.md`.
* **Paper.** The canvas is warm off-white `--paper` under the low-alpha handmade-paper grain
  (`static/icons/handmade-paper.webp`, tiled); dark paper keeps the same grain and changes only the
  color beneath. `--paper-margin` is the flat tone behind the rotation-locked sheet.
* **Touch targets are chunky.** Nothing interactive goes below 44px; kid-facing controls run
  deliberately larger. Don't shrink a control to fit a layout — rework the layout.

## The living styleguide

`/design` — public, live at <https://splotch.art/design> — renders the whole system from the real
source objects, in three parts ordered most-reusable-first: **Foundations** (every token group,
paper, the crayon palette, the icon set split by `COLOR_ICONS`), **Components & chrome** (the
primitives, the settings furniture `ToggleRow`/`SliderRow`, specimens of the shared `app.css` chrome
classes, and a named index of the bespoke canvas/page chrome), and **Brand & voice** (the copy rules
and brand marks), with a light/system/dark toggle and a jump nav. Each part's sections are partials
in `lib/components/styleguide/` (`TokenSections` + `AssetSections`, `PrimitiveSections` +
`ChromeSections`, `VoiceSections`); because everything is imported from `tokens.ts`, `palette.ts`,
and the icon glob, the page cannot drift from the implementation. `prerender = false` keeps the page
out of the native static export — no native surface links to it — and serves it via SSR on the web.
Use it to:

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
