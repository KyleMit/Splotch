---
name: design
description: Design-system reference — the token vocabulary (color, spacing, radius, type, elevation, motion), the React Strict DOM primitives, the voice & copy rules, brand/iconography, and the rules for styling UI. Use before writing or changing any component styles, picking a color/size/shadow/easing, adding a UI element, writing user-facing copy, or when visual consistency or the /design styleguide comes up.
---

# Splotch design system

The source of truth is **`web/src/lib/design/tokens.ts`**. React Strict DOM consumes the generated
projection in `experiments/native-architecture/src/rsdDrawing/tokens.css.ts`. Read the token's usage
rule in `web/src/lib/design/tokenUsage.ts` before choosing one.

## Hard rules

1. **Edit the source, then regenerate the projection.** Run
   `node --experimental-strip-types tools/migration/gen-rsd-drawing-tokens.mjs`, then
   `npm run check:migration:rsd-drawing-tokens`, and commit the source and generated output.
2. **Use a token wherever one exists.** Components use the RSD token variables for colors, radii,
   type, spacing and motion. Raw values are for genuine one-offs, with a reason when non-obvious. A
   second consumer is a reason to promote the value into the shared vocabulary.
3. **Keep themed colors together.** Light and dark values live in `tokens.ts`; add a shared themed
   token instead of giving a component an independent palette.
4. **Import token values for imperative consumers.** Avoid hand-copied colors and dimensions. A
   measured startup boundary that prevents sharing needs a drift guard and its enforcing test.
5. **De-emphasize text and glyphs by token, never opacity.** Whole disabled controls retain their
   component treatment.

## Voice & copy

Two voices, one maker. Kid-adjacent copy is playful and warm ("Open it up, hand over the device, and
let them make a mess. That's the whole idea."). Parent-facing copy — Settings, store listings,
privacy — is plain, professional, and direct ("We never keep a copy of your key.").

* **Sentence case everywhere** — buttons, labels, headings ("Clear drawing", "Save screenshot").
  Title Case only for proper feature names (Night Mode, Parent Center, Guided Access).
* **No emoji in UI chrome — anywhere.** The one historical exception (`/privacy` used emoji as
  friendly bullet leads on its "no ___" highlight cards) was retired in the 2026-08 privacy
  redesign: list leads that want warmth get a crayon pill (`CrayonStrip` vocabulary, hues via
  `paletteHex`) instead. Don't reintroduce the exception.
* **Short, concrete, reassuring.** Feature bullets lead with verbs ("Draw with big, chunky,
  crayon-like strokes"); Settings help text is one calm sentence.
* **"You" is the parent, "they"/"kids" is the child.** First-person-plural "we" for the maker's
  promises.
* **Honest about tradeoffs** — copy explains *why* ("so playtime stays in Splotch").
* **Cut stock AI phrasing.** Review drafts for formulaic lead-ins, repeated bold leads, contrast
  formulas, and chains of em dashes. Use short active sentences and one term per concept, with the
  app's actual UI names. Describe routine mechanics as calm promises while preserving required
  privacy and permission facts. Critique and revise important public copy before publishing.

## Token vocabulary

Every token carries a one-line "reach for it when…" rule in **`web/src/lib/design/tokenUsage.ts`**,
rendered beside its specimen on `/design` (ADR-0097). The table below is the shape of the
vocabulary; the usage rules are the law — start from the defaults callout at the top of `/design`'s
Foundations and only reach past a default when a rule says so.

| Group     | Tokens                                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Brand     | `--brand`, `--on-brand` (the ink on brand fills).                                                                                                                                                |
|           | `--brand` is the identity hue — hairlines, focus rings, `accent-color`, tints, and **textless** fills                                                                                            |
|           | (it is only 3.4:1 against `--on-brand`). A brand fill that carries a label rests on the themed                                                                                                   |
|           | `--brand-solid`, and every brand fill hovers through the same ramp (`--brand-solid`, then                                                                                                        |
|           | `--brand-solid-hover`) — there is deliberately no second, unthemed hover step (ADR-0097)                                                                                                         |
| Spacing   | `--space-1` (4px) … `--space-8` (40px), a 4px-based ramp                                                                                                                                         |
| Radius    | `--radius-sm/md/lg` (8/12/16px), `--radius-pill` — inline chips sm, controls md, everything                                                                                                      |
|           | card-sized and up (cards, modal cards, banners, page sheets) lg, pills pill. There is no xs step                                                                                                 |
|           | and no xl step (ADR-0098 folded it into lg)                                                                                                                                                      |
|           | `--radius-blob-1/2/3` — paint daubs for gate operands, answer dabs, numbered steps, section links, back links and external marks.                                                                |
| Border    | `--border-width` (1px) — the hairline width; the color comes from a theme token (`--border`,                                                                                                     |
|           | `--border-warm`, `--float-border`). Older components still write `1px solid` raw — prefer the token                                                                                              |
| Type      | `--font-size-xs/sm/md/lg/xl` (12/14/16/18/22px) — fine print · UI chrome · body prose ·                                                                                                          |
|           | ledes/section heads · titles (the ceiling inside any surface) — plus `--font-size-display`                                                                                                       |
|           | (fluid 34–46px), the H1 of a whole page: PageShell's hero, the crash screen. There is no 2xl                                                                                                     |
|           | step between them (ADR-0098). `--font-family`, `--font-mono`,                                                                                                                                    |
|           | `--font-weight-medium/semibold/bold` (500/600/700 — quiet labels · buttons/active states/sub-heads ·                                                                                             |
|           | headings; body prose stays at the untokenized 400 default)                                                                                                                                       |
| Motion    | `--duration-fast/base/slow` (0.15/0.2/0.35s) and `--duration-exit` (0.2s, what an exit takes);                                                                                                   |
|           | `--ease-pop` (springy overshoot: two-state pops and single-segment keyframes), `--ease-glide`                                                                                                    |
|           | (anything that settles or leaves), and `--ease-drawer` (symmetric, for two things that must move                                                                                                 |
|           | as one — the drawer and its chevron).                                                                                                                                                            |
|           | Control-state motion (hover, press, reveal, fades) pairs a curve with a duration token; tuned                                                                                                    |
|           | one-shot choreography — celebration keyframes, staged sequences like the AI reveal and polaroid                                                                                                  |
|           | flight, gesture feedback — carries its own timing, whichever CSS mechanism renders it. The rules                                                                                                 |
|           | for choosing among them are under **Motion** below                                                                                                                                               |
| Elevation | Three shadows only: `--shadow-control` (the tight lift on a small raised control — selected                                                                                                      |
|           | segment thumb, tool popover), `--shadow-pop` (deep overlay lift under modal cards), and the                                                                                                      |
|           | themed `--float-shadow` (everything floating on the paper — cards, flyouts, page sheets)                                                                                                         |
| Opacity   | `--disabled-opacity` — the one dimming for a whole parked control (toggle rows, chips, buttons,                                                                                                  |
|           | gate keys). Text and glyphs on their own never take it: they change ink token (rule 5). The                                                                                                      |
|           | canvas action buttons keep their deeper bespoke fade                                                                                                                                             |
| Fill      | `--clear-gradient-rest` — the Clear Button's at-rest red, painted identically by the                                                                                                             |
|           | drag-to-clear coachmark ghost so the tutorial can't drift from the real control. Unthemed on                                                                                                     |
|           | purpose (ADR-0052): it reads the same on both papers. `--polaroid-paper` / `--polaroid-ink` —                                                                                                    |
|           | the print white every polaroid in the app is made of and the brand ink written on it, unthemed                                                                                                   |
|           | for the same kind of reason (ADR-0117): a photograph doesn't repaint at night, so what is                                                                                                        |
|           | written on it can't either                                                                                                                                                                       |
| Stacking  | `--z-*` — the cross-component chrome order, from toolbar paper and pointer halos through `--z-canvas-chrome` up to `--z-polaroid`                                                                |
|           | (1004, the screenshot flight), listed low-to-high in `tokens.ts`. One list, not one context: all                                                                                                 |
|           | root-context except                                                                                                                                                                              |
|           | `--z-flyout`, which `.actions-panel` caps inside its own. Layers sealed inside a real context (under                                                                                             |
|           | `.canvas-stack`'s `isolation: isolate`, card close buttons) stay plain integers                                                                                                                  |
| Glass     | `--glass-rail` / `--glass-strip` set Bare toolbar tint strength; `--glass-tint-rgb` follows paper. `--rule-ink`, `--rule-blend`, `--rule-opacity` / `--rule-secondary-opacity` paint its margin. |
| Scrim     | `--scrim-ink`, `--scrim-ink-danger`, `--scrim-ink-soft`, `--scrim-pill` —                                                                                                                        |
|           | fixed inks and glass for disclosure text on the dark backdrop in both themes.                                                                                                                    |
| Steps     | `--step-wash-strength` / `--step-ink-strength` — numbered-step disc and digit mixes.                                                                                                             |
|           | Light sheets keep crayon tints; dark digits use full heading ink on lifted discs.                                                                                                                |
| Theme     | surfaces, borders, the three-step text ramp (`--text-strong` headings · `--text` body ·                                                                                                          |
|           | `--text-soft` de-emphasized, pinned to hold 4.5:1 at small sizes), icon inks, brand/success/danger                                                                                               |
|           | washes (the brand and danger washes each with a `-hover` step), paper, float-card chrome, and                                                                                                    |
|           | `--surface-rgb` (`--surface` as channels, for a fade that paints without `color-mix()`) — the                                                                                                    |
|           | full list with per-token docs is in `tokens.ts` (`ThemeTokens`)                                                                                                                                  |

**Adding a token:** it must earn its place — a semantic meaning used (or clearly about to be used)
in 2–3 places. Prefer reusing an existing step of a ramp over minting a near-duplicate (ADR-0097
pruned the last crop of ≤2-consumer tokens; don't regrow them). New themed tokens need both light
and dark values (the compiler enforces this). Minting a token isn't done until it's registered in
the vocabulary table above, has its usage rule in `tokenUsage.ts` (the `Record` types make the
compiler demand one), and renders on `/design` — an undiscoverable token guarantees the next
hardcoded duplicate (a failure review has caught three times).

## Motion

Keep what already works: the one `:root[data-reduce-motion]` answer with per-element
`data-start-reduced-motion` stamps, nothing animating while a stroke may be live, pre-rasterized
bitmaps behind the undo ghost and the clear sheet, and durations justified against measured frames
rather than taste.

1. **One curve per cue.** A shorthand timing function applies between *every* pair of keyframes. A
   keyframe block that draws its own overshoot runs `linear` at the shorthand and sets
   `animation-timing-function` per keyframe (`undo-spin`, `dialogFlyFromOrigin`). `--ease-pop` is
   for two-state transitions and single-segment keyframes. `ease-in-out` is fine per segment when
   every stop is a turning point — a shake, a wiggle, a pulse. `npm run lint:css` enforces it
   (`splotch/keyframe-curves`, three or more transform stops).
2. **Every entrance owes an exit.** An exit runs at roughly 0.6 of its entrance, on `--ease-glide`,
   heading back toward where the entrance came from. Under reduced motion an exit is a **fade, never
   `animation: none`** — code waits on it finishing (ADR-0170).
3. **Compositor-only while ink can be live.** Anything that can run during a stroke animates
   `transform`, `opacity` or `clip-path`. Known exceptions to work off: the drawer's grid track,
   `action-unavailable-flash`, the Clear Button's lid `margin` and dock `border-radius`, the Bare
   toolbar's sibling `filter`, the color picker hexagon `filter`.
4. **Interruptible by construction.** A cue that can reverse mid-flight restarts or reverses from
   the current state (the swatch press rewinds with `currentTime = 0`; a dialog reopened mid-exit
   drops its closing class and restarts the fly-in) rather than cutting to an end state.
5. **Whole-screen state changes swap layers, not properties.** A theme change swaps every token at
   once and fades a veil of the open card's previous surface off the new one — opacity on one small
   layer, never a whole-screen snapshot, whose capture and teardown each cost a frame on the
   release-gate devices (ADR-0171).
6. **Frame budget on a 60 Hz beat.** WebKit hands web content 60 Hz even on a 120 Hz iPad: no cue
   under 120 ms unless it follows the finger, keyframe stops at least two frames (33 ms) apart, and
   a stagger capped so the last item lands within 1.3× the single-item duration.
7. **Declare the calm twin beside the cue**, in the same commit. Entrances and exits fade; state
   changes snap; loops slow or hold one frame.
8. **`will-change` is a loan.** Promote in the frame before a cue and release after, or justify a
   permanent layer in place.

| Kind           | Duration                  | Curve                                                 | Reduced motion          |
| -------------- | ------------------------- | ----------------------------------------------------- | ----------------------- |
| Enter          | 300–360 ms                | `--ease-pop`, or `linear` + per-keyframe curves       | fade, `--duration-base` |
| Exit           | `--duration-exit` (≈0.6×) | `--ease-glide`, 30–40% of the way back toward origin  | fade, `--duration-base` |
| State change   | 150–200 ms                | `ease`; a symmetric curve when two things move as one | snap                    |
| Gesture-follow | 0, or ≤120 ms catch-up    | `linear`                                              | instant                 |
| Celebration    | own timing, ≤2 s          | `linear` + per-keyframe curves                        | 0.7 s fade, or hidden   |
| Ambient loop   | 0.8–2.8 s                 | `linear` / `ease-in-out`                              | slow, or hold one frame |

Undo feedback lives with `experiments/native-architecture/src/drawing/UndoInkMotion.tsx` and its
platform-specific painters. Measure native drawing through the app's probe; measurements of the
retired Svelte tiled renderer do not establish an RN budget.

## Primitives

The React Strict DOM primitives live in `experiments/native-architecture/src/rsdDrawing/`. Reuse
`RsdButton`, `RsdTextLink`, `RsdSegmentedPicker`, `RsdToggleRow`, `RsdSlider`, `ModalShell`,
`RsdScrollCue` and `RsdVisuallyHidden` before adding a bespoke equivalent. Consult each component's
props and its mounted tests under `tools/migration/tests` instead of assuming a DOM-only attribute
works on native.

Controls need visible keyboard focus, adequate contrast in both themes, and an accessible name.
Extract a new primitive after the third duplicate, and add it to the RN `/design` specimens.

## Page chrome — standalone pages

Web documents are implemented in `experiments/native-architecture/src/pageDocument/` and share RSD
primitives with `experiments/native-architecture/src/rsdDrawing/`. The route inventory and
prerendering are owned by `tools/migration/prerender-native-web-pages.mjs`. Use the page typography,
frame and footer owners instead of copying a document's layout into another route.

Every parent-facing page follows light and dark appearance. A content accent must remain legible on
each ground. Check the rendered page in both schemes and preserve keyboard navigation and heading
order; the browser axe scan is in `e2e/specs/a11y.spec.ts`.

## Brand & iconography

* **Mascot & marks.** Splotchy's canonical SVG is `web/src/lib/icons/splotchy.svg`;
  `RsdSplotchyIcon` renders its generated platform representation. The wordmark uses Quicksand.
  Dottie's first-party spot icons provide the friendly error and empty-state expressions.
* **Icons are first-party SVG.** `RsdIcon` renders the generated icon registry. Monochrome glyphs
  follow the ink token; full-color spot icons retain their palette. The classification contract is
  `web/src/lib/components/iconTypes.ts`.
* **Generate icons from their source assets.** Themed parts belong in
  `web/src/lib/design/iconTokens.ts`. Regenerate through `tools/migration/gen-native-icons.mjs`
  after changing the SVG or token inputs, and run `npm run optimize:svg-assets` and the relevant
  icon-generation tests. Preserve the startup/deferred split in the generated registry.
* **Paper.** The canvas is warm off-white `--paper` under the low-alpha handmade-paper grain
  (`static/icons/handmade-paper.webp`, tiled); dark paper keeps the same grain and changes only the
  color beneath. `--paper-margin` is the flat tone behind the rotation-locked sheet.
* **Touch targets are chunky.** The shared dialog chrome, Button, SegmentedPicker, and Settings
  switches use `--touch-target-min` (48px) in both axes across web and native. Compact switch tracks
  can remain smaller inside the full button. Keep targets separate from neighboring controls and
  verify effective hit regions on Android alongside accessibility bounds; CSS pixels alone are not a
  dp measurement. Existing bespoke page/admin controls still have their own sizing; changing the
  shared floor does not certify every app target. Kid-facing controls run deliberately larger. Don't
  shrink a control to fit a layout — rework the layout.

## The living styleguide

The public `/design` document is built from
`experiments/native-architecture/src/pageDocument/design/`. It renders the RSD token module and
primitives, with usage guidance from the shared token sources. Add each new reusable token or
primitive there so the vocabulary remains discoverable.

Review a token or primitive change in both themes, capture its states for the PR through the
`pr-screenshots` skill, and inspect the current styleguide before introducing a new value.

## Checks

`npm run check:migration:rsd-drawing-tokens` guards the generated token projection. The RN build and
mounted tests cover component behavior; `npm run lint:css` checks hand-authored CSS for invalid
properties, media features, selectors and notation. The Svelte component style ratchets retired with
their consumers; do not describe them as an active gate for RSD styles.
