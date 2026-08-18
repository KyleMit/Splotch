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
   `gen:icon-names`/`gen:releases` it's deliberately not in `prebuild` — the Netlify build runs on
   the platform-default Node, which may lack `--experimental-strip-types`), so a `tokens.ts` edit is
   invisible until you rerun `gen:tokens`. If a token change doesn't show up, that's why.
2. **No raw values where a token exists.** In component `<style>` blocks, don't write hex colors, px
   radii, px font sizes, shadow literals, or easing curves that a token already covers — use the
   `var(--…)`. A raw value is only acceptable for genuine one-offs (e.g. the ground behind a
   picture, confetti colors, canvas ink) — and say why in a comment if it isn't obvious. A one-off
   stops being one the moment a second surface wants it: the polaroids' photographic white was the
   documented example here until a third copy of it turned up, and it is `--polaroid-paper` now.
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
* **No emoji in UI chrome — anywhere.** The one historical exception (`/privacy` used emoji as
  friendly bullet leads on its "no ___" highlight cards) was retired in the 2026-08 privacy
  redesign: list leads that want warmth get a crayon pill (`CrayonStrip` vocabulary, hues via
  `paletteHex`) instead. Don't reintroduce the exception.
* **Short, concrete, reassuring.** Feature bullets lead with verbs ("Draw with big, chunky,
  crayon-like strokes"); Settings help text is one calm sentence.
* **"You" is the parent, "they"/"kids" is the child.** First-person-plural "we" for the maker's
  promises.
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
| Radius    | `--radius-sm/md/lg` (8/12/16px), `--radius-pill` — inline chips sm, controls md, everything            |
|           | card-sized and up (cards, modal cards, banners, page sheets) lg, pills pill. There is no xs step       |
|           | and no xl step (ADR-0098 folded it into lg)                                                            |
| Border    | `--border-width` (1px) — the hairline width; the color comes from a theme token (`--border`,           |
|           | `--border-warm`, `--float-border`). Older components still write `1px solid` raw — prefer the token    |
| Type      | `--font-size-xs/sm/md/lg/xl` (12/14/16/18/22px) — fine print · UI chrome · body prose ·                |
|           | ledes/section heads · titles (the ceiling inside any surface) — plus `--font-size-display`             |
|           | (fluid 34–46px), the H1 of a whole page: PageShell's hero, the crash screen. There is no 2xl           |
|           | step between them (ADR-0098). `--font-family`, `--font-mono`,                                          |
|           | `--font-weight-medium/semibold/bold` (500/600/700 — quiet labels · buttons/active states/sub-heads ·   |
|           | headings; body prose stays at the untokenized 400 default)                                             |
| Motion    | `--duration-fast/base/slow` (0.15/0.2/0.35s); two curves only — `--ease-pop` (springy overshoot:       |
|           | anything that pops in or celebrates) and `--ease-glide` (anything that settles or leaves).             |
|           | Control-state motion (hover, press, reveal, fades) pairs a curve with a duration token; tuned          |
|           | one-shot choreography — celebration keyframes, staged sequences like the AI reveal and polaroid        |
|           | flight, gesture feedback — carries its own timing, whichever CSS mechanism renders it                  |
| Elevation | Three shadows only: `--shadow-control` (the tight lift on a small raised control — modal close         |
|           | disc, selected segment thumb), `--shadow-pop` (deep overlay lift under modal cards), and the           |
|           | themed `--float-shadow` (everything floating on the paper — cards, flyouts, page sheets)               |
| Fill      | `--clear-gradient-rest` — the Clear Button's at-rest red, painted identically by the                   |
|           | drag-to-clear coachmark ghost so the tutorial can't drift from the real control. Unthemed on           |
|           | purpose (ADR-0052): it reads the same on both papers. `--polaroid-paper` / `--polaroid-ink` —          |
|           | the print white every polaroid in the app is made of and the brand ink written on it, unthemed         |
|           | for the same kind of reason (ADR-0117): a photograph doesn't repaint at night, so what is              |
|           | written on it can't either                                                                             |
| Stacking  | `--z-*` — the cross-component chrome order, `--z-canvas-chrome` (4) up to `--z-polaroid`               |
|           | (1004, the screenshot flight), listed low-to-high in `tokens.ts`. One list, not one context: all       |
|           | root-context except                                                                                    |
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
corner buttons, Clear Button) keep their bespoke paper treatments. The admin console (`/admin`) is
themed (the 2026-08 redesign, recorded in the ADR-0071 amendments) but keeps its own bespoke
controls: its ledger table, link-shaped actions, and standalone-page CTA are shapes the primitives
don't offer.

| Primitive                | Use for                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `Button.svelte`          | Text-labeled actions. Variants `brand` / `wash` / `danger`, sizes `lg` / `md` / `sm`        |
|                          | (`lg` takes a 16px label, for a pair that is a screen's primary decision rather             |
|                          | than chrome). Not for controls with a **selected state** — those are pickers, not           |
|                          | actions: use `SegmentedPicker`                                                              |
| `SegmentedPicker.svelte` | Controls with a **selected state**. `mode` = `radio` (choose-one radiogroup with roving     |
|                          | tabindex + arrow-key selection: the theme pickers) / `toggle` (`aria-pressed`; deselection  |
|                          | and multi-select stay with the caller: the orientation segment, the controls chips).        |
|                          | `variant` = `segment` (raised-thumb track) / `chip` (borderless toggle grid) / `underline`  |
|                          | (tab row on a hairline, for a standalone page switching between two views of itself —       |
|                          | `/beta`'s platform tabs; the live tab replaces its stretch of the rule with a brand         |
|                          | segment and takes the brand ink, and its icon follows that ink rather than `--icon-ink`);   |
|                          | sizes `md` / `sm`; `fill={false}` hugs content — except under `underline`, which owns its   |
|                          | own width (hugs left on a sheet, splits the row evenly at phone width, where a caller       |
|                          | wanting the rule at the glass supplies the bleed past its own gutter); `inputName` renders  |
|                          | the options as real native radios for a form that must post without JavaScript (the         |
|                          | report-kind row); the forwarded `class` carries call-site restyling via `:global()`         |
| `Disclosure.svelte`      | A `<details>` panel with the rotating `›` chevron. `summary` snippet + children; the        |
|                          | forwarded `class` carries the call site's own padding/type/color (style it via `:global()`) |
| `StatusMessage.svelte`   | The wash-filled banner a form shows after a submit resolves. `status` = `success` / `error` |
| `ScrollCue.svelte`       | The fade that says a scroller's content carries on below. No props — render it as the       |
|                          | **last child of the scrolling content** and it plants its own end-of-content sentinel       |
|                          | there; one IntersectionObserver gives all three states, so it is absent when the content    |
|                          | fits, absent at the end of the scroll, and present only in between. Depth is the inherited  |
|                          | `--scroll-cue-height` (default 72px), set by the call site on any ancestor. It measures its |
|                          | scroller's bottom padding and reaches past it, so the fade meets the edge the scrollport    |
|                          | clips at however that scroller pads — never compensate for it at the call site. A scroller  |
|                          | that already paints its own edge affordance (the settings sidebar's `local` shades) does    |
|                          | not take one as well                                                                        |

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
| `.white-stroke` / `.dark-stroke`         | Ink keylines ringing an icon's ink-colored parts so white ink reads on the |
|                                          | white cards (black ring) and near-black ink reads on the dark ones         |
|                                          | (`--dark-ink-keyline`, inert in light mode). The brush/stroke trigger      |
|                                          | buttons (BrushControl, ActionsPanel), BrushMenu, StrokeWidthMenu           |

They stay classes for one of two reasons: dialogs and imperative DOM need them unscoped, or the
pattern is chrome that several components share verbatim but that hasn't earned a primitive yet.
That second case is how a canvas-floating control de-duplicates: hoist the shared *rules* to
`app.css` with a comment naming the consumers, leaving each component only what genuinely differs —
not a wrapper component, which the bespoke-paper-treatment carve-out above rules out anyway.

`app.css` also dresses one piece of UA chrome the app never marks up: a **classic, space-taking
scrollbar** gets a transparent track with the thumb in `--control-track-hover`, so a scroller's
gutter shows its own surface instead of a system track painted through its rounded corners. It is
one inherited `:root` declaration, and deliberately color only — the gutter's width is the reader's
OS preference — using the standard property rather than `::-webkit-scrollbar`, which would trade
WebKit's overlay scrollbar for a permanent gutter on iOS and macOS Safari. Don't restyle scrollbars
per component; `scrollbar-chrome.spec.ts` guards the shared treatment.

**Extract a new primitive at the third duplicate**, not before — and add it to `/design` and the
component table above when you do.

## Page chrome — standalone pages

Every standalone page — the link-shareable parent pages (`/privacy`, `/changelog`, `/beta`,
`/feedback`) and the admin console (`/admin`, via `AdminConsole`) — wears one shell, in
**`web/src/lib/components/page/`**. The `/design` styleguide is the one standalone page with its own
shell (sticky header + scrollspy TOC, in its route file); it still signs itself with `BrandMark`:

| Component            | Use for                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `PageShell.svelte`   | The whole page frame: ground, centered 880px sheet, masthead (back link + `BrandMark`),     |
|                      | hero H1 + lede. Exposes the `--page-*` palette (ground/sheet/ink/body/muted/rule/link/      |
|                      | accent/shadow/measure/gutter, plus the accent's hover and on-accent variants), resolved     |
|                      | from the themed app tokens                                                                  |
| `RuleLabel.svelte`   | The small-caps section marker with a hairline running to the sheet edge — a real `<h2>`     |
| `BrandMark.svelte`   | Crayon strip + small-caps wordmark lockup (the masthead's second way home)                  |
| `CrayonStrip.svelte` | (in `lib/components/`) Seven rainbow pills, hues via `paletteHex` — decorative, aria-hidden |

**No page opts out of night mode.** Every route wearing the shell follows the parent's Appearance
setting, `/privacy`, `/changelog` and `/beta` included — the older pages pinned a light `--page-*`
palette until 2026-08-10 and no longer do (ADR-0071's amendment records the reversal). Content
inside the shell reads `--page-*`, never restates a color, and a page that wants a color the palette
doesn't carry reaches for a themed app token, never a hex; `/design` styles itself from the themed
tokens directly, so its theme toggle keeps working.

Two consequences worth knowing before styling one:

* **A link hovers on its underline, not a second color.** The themed ramp stops at `--page-link`
  (`--brand-text`) — there is no deeper accessible step — so hover thickens the underline or brings
  one in. `/feedback` is the pattern.
* **A per-item accent gets mixed, not pinned.** A color keyed to content (BetaStep's four crayon
  hues) derives its wash and ink with `color-mix()` against `--page-sheet` and `--page-ink`, which
  darkens the hue on the light sheet and lightens it on the dark one from one declaration. The mix
  strengths are named custom properties; contrast is measured on both grounds by
  `web/tests/beta.spec.ts` rather than assumed from the light reading.

## Brand & iconography

* **Mascot & marks.** Splotchy (`web/src/lib/icons/splotchy.svg`) is the mascot, rendered
  structurally via `SplotchyIcon.svelte`, which pulls that one canonical file in as a Vite URL
  import (it's in `NON_RENDERABLE_ICONS`, so `<Icon>` won't take it). The installed-app icons are
  separate: `site.webmanifest` points at the `web-app-manifest-*.png` files in `web/static/`. The
  wordmark is plain Quicksand — no drawn logo. The crayon strip (`CrayonStrip.svelte`, seven pills
  in rainbow order, hues looked up from `lib/palette.ts`) is the wordmark's companion mark on parent
  pages.
* **Icons are first-party inline SVG** through `<Icon name="…">` — no icon font, no CDN set, no
  emoji-as-icons. Monochrome glyphs bake a near-black fill and get re-inked with
  `fill: var(--icon-ink)` on themed surfaces; full-color "spot" icons carry their own palette and
  are **never tinted wholesale** — the split is the `COLOR_ICONS` set in `Icon.svelte`. Adding an
  icon: see the icon steps in `.claude/rules/svelte.md`.
* **A single path inside a spot icon can still be themed** (ADR-0102). Declare it in
  `web/src/lib/design/iconTokens.ts` — keyed by icon then part, with a `light` and a `dark` hex —
  run `npm run gen:tokens`, and paint the path with
  `style="fill:var(--icon-<icon>-<part>,#lightHex)"`; then `npm run optimize:svg-assets`. The
  fallback hex must equal the `light` value and every declared part must be referenced by an SVG,
  both enforced by `web/src/lib/icons/tokenFallback.test.ts`. These are **not** `ThemeTokens`
  entries and need no `tokenUsage.ts` rule: they are a per-asset lookup table, and no component
  style may reference one. Reach for it when a path is illegible on a theme's grounds — the spot
  icons rest on `--surface`, `--surface-2` *and* the near-constant `--brand-solid`, so each theme's
  colors must clear both.
* **Paper.** The canvas is warm off-white `--paper` under the low-alpha handmade-paper grain
  (`static/icons/handmade-paper.webp`, tiled); dark paper keeps the same grain and changes only the
  color beneath. `--paper-margin` is the flat tone behind the rotation-locked sheet.
* **Touch targets are chunky.** Nothing interactive goes below 44px; kid-facing controls run
  deliberately larger. Don't shrink a control to fit a layout — rework the layout.

## The living styleguide

`/design` — public, live at <https://splotch.art/design> — renders the whole system from the real
source objects, in three parts ordered most-reusable-first: **Foundations** (every token group,
paper, the crayon palette, the icon set split by `COLOR_ICONS`, and the composed **recipes** — card,
form row, callout, CTA — showing tokens assembled into real surfaces), **Components & chrome** (the
primitives, the settings furniture `ToggleRow`/`SliderRow`, specimens of the shared `app.css` chrome
classes, and a named index of the bespoke canvas/page chrome), and **Brand & voice** (the copy rules
and brand marks), under a sticky header with a binary light/dark preview toggle (the 3-way choice
with System stays with the app Settings) and a scrollspy-driven table of contents — the shared
`SidebarToc` rail on wide screens, and on narrow ones the `TocDisclosure` row that opens onto that
same rail, its collapsed state naming the section being read. Each part's sections are partials in
`lib/components/styleguide/` (`ColorSections` + `TypeSections` + `ScaleSections` + `AssetSections` +
`RecipeSections`, `PrimitiveSections` + `ChromeSections`, `VoiceSections`); because everything is
imported from `tokens.ts`, `palette.ts`, and the icon glob, the page cannot drift from the
implementation. `prerender = false` keeps the page out of the native static export — no native
surface links to it — and serves it via SSR on the web. Use it to:

* review a token or primitive change in both themes (screenshot it for the PR — see the
  `pr-screenshots` skill);
* check what already exists before inventing a new value.

## Migration status

Colors, type, weights, radii, easing, and the swept surfaces' spacing are migrated; **spacing
elsewhere is not** — raw px padding/margin/gap is still the norm in older components, and only the
hex and font-size ratchets enforce anything, so rule 2 is what governs spacing in new and edited
styles. What remains raw beyond that is deliberate — documented one-offs (the photographic white
behind a picture, confetti colors, canvas chrome, functional literals like ColoringBook's label
reserve; the print white itself and ClearButton's danger red are tokens, unthemed on purpose). The
**light-only pages are gone**: `/admin` left that set in the 2026-08 redesign and `/privacy`,
`/changelog` and the beta sign-up page followed on 2026-08-10, so no surface pins a palette against
`data-theme`/`prefers-color-scheme` any more.

CI enforces this with `npm run lint:tokens` — per-file raw-hex and raw-font-size ratchets whose
allowlisted baselines (with per-file reasons) live in `tools/tokens/lint-token-styles.mjs`, plus a
zero-tolerance check on multi-digit raw z-index. A new raw hex color or raw `font-size` fails the
Quality job: use a token, or (for a genuine one-off) add a WHY comment and bump the baseline. When
you remove a one-off, lower its baseline entry so the ratchet holds. box-shadow is deliberately not
ratcheted: raw shadows are dominated by the canvas chrome's legitimate one-off alpha lifts, so a
baseline would blunt the signal (the elevation tokens govern modal/settings surfaces via rule 2).
