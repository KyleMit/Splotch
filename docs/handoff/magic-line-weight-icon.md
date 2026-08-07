# Handoff — magic brush line-weight icon

> 2026-08-07 · branch `claude/magic-brush-icon-design-uaa8b8` · Give the Stroke Width trigger a
> rainbow face while the magic brush is held

## Objective & non-goals

**Objective.** When `toolState.brush === 'magic'`, the Stroke Width Button
(`ActionsPanel.svelte:326`) should paint a rainbow face instead of `line-weight-brush.svg`. Today
that icon fills with `currentColor` — the palette's active color — which the magic brush ignores
entirely, so the control advertises a color the tool will not paint.

Ten directions were mocked up and reviewed; the chosen one is **"Off-axis"** — a single linear
gradient laid across all three strokes at 34°, echoing how `paintGradient()` lays the brush's own
gradient line across the canvas at `spec.angle` rather than square to it. Gallery of all ten,
including the nine rejected: <https://claude.ai/code/artifact/ccd922d3-528d-4123-8e05-f7341ef39693>

**Non-goals.**

* The five size previews *inside* the flyout (`size-brush-1..5`, `StrokeWidthMenu.svelte:55`). They
  also tint via `currentColor`. Leaving them as-is for now — see Open questions.
* The eraser face. `line-weight-eraser` keeps its current behaviour untouched.
* Any change to what the magic brush actually paints. This is the icon only.
* Animating the icon. Direction 07 (shimmer) was considered and rejected — see Decisions.

## State

Nothing is implemented. This branch carries **no code commits** — the work so far was design
exploration, and its entire output is this packet. The SVG below has been generated and verified but
is deliberately *not* committed (see Risks — an unreferenced SVG fails `icon-orphans.test.ts`).

| Item                     | Status                                           |
| ------------------------ | ------------------------------------------------ |
| Direction chosen         | 04 "Off-axis", confirmed by the user             |
| `line-weight-magic.svg`  | Content finalized below, not yet written to disk |
| Component / test changes | Not started                                      |

## The icon

Write this verbatim to `web/src/lib/icons/line-weight-magic.svg`. The path data is
`line-weight-brush.svg`'s, unchanged; only the fill differs. It is already SVGO-optimized under this
repo's config **plus the `cleanupIds` override described below** — running `npm run img:audit` over
it is a no-op, and re-optimizing is idempotent.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15.5 -8.7 307.7 194.7"><defs><linearGradient id="icon-line-weight-magic-rainbow" x1="-12.52" x2="289.22" y1="-13.11" y2="190.41" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c453ea"/><stop offset=".2" stop-color="#ea5373"/><stop offset=".4" stop-color="#eace53"/><stop offset=".6" stop-color="#69ea53"/><stop offset=".8" stop-color="#53ead8"/><stop offset="1" stop-color="#535fea"/></linearGradient></defs><path fill="url(#icon-line-weight-magic-rainbow)" d="PASTE_THE_d_ATTRIBUTE_FROM_line-weight-brush.svg"/></svg>
```

**Copy the `d` attribute out of `web/src/lib/icons/line-weight-brush.svg`** rather than retyping it
— it is ~1.8 KB of path data and a single wrong character is invisible until it renders.

The six stops are `hsl(h 78% 62%)` at `h = 285, 347, 49, 111, 173, 235` — a 310° sweep starting in
violet, converted to hex because the chroma classifier only reads hex (see Decisions). Saturation
and lightness sit inside the band `magicBrush.ts` actually paints in (`RAINBOW_SATURATION_MIN_PCT`
70 + span 25, `RAINBOW_LIGHTNESS_MIN_PCT` 55 + span 15), so the icon is honest about the tool's
output and clears both `--paper` values without a per-theme token.

The gradient vector spans the viewBox diagonally at 34°, derived the same way `paintGradient()`
derives its own: centre ± `(cos a · w + sin a · h) / 2`.

## Decisions made (and why)

* **04 over the other nine.** It is the only direction whose *geometry* matches the brush — the real
  sheet gradient is laid at a random angle, never axis-aligned. 01 (horizontal sweep) reads as a
  generic rainbow; 07 (shimmer) added an animation to a control that is not busy, and would have
  needed a `prefers-reduced-motion` branch for no functional gain; 10 (icon mirrors the brush's
  currently-held gradient) was the most truthful but requires reading live `magicBrush` state from
  an `{@html}`-injected SVG, which is exactly the thing that cannot be done reactively.
* **A fixed angle, not a random one.** The brush re-rolls its gradient; the icon does not. A trigger
  that changes appearance without the user acting on it reads as a glitch.
* **Hex stops, not `hsl()`.** `scripts/lib/iconChroma.mjs` → `paintHexes()` only matches
  `fill|stroke|stop-color` followed by a **hex** literal. With `hsl()` stops, `isSpot()` returns
  false, and the `COLOR_ICONS` guard in `Icon.svelte.test.ts` would pass vacuously instead of
  protecting the new icon. Verified: with hex, `isSpot()` returns `true`.
* **No `iconTokens.ts` entry.** The spot-icon theming map (ADR-0102) exists for icons whose parts
  vanish against one theme's ground. These six hues sit at L 62% and read on both `--paper` values,
  so there is nothing to theme. This also keeps the icon out of `tokenFallback.test.ts`'s
  `var(--x, #hex)` checks entirely — it contains no `var()`.

### The SVGO id collision — read this before writing the file

`img:audit:check` is a CI gate that fails if any SVG under `web/` is not already SVGO-optimized
(`scripts/image-audit.mjs`, config `{ multipass: true, plugins: ['preset-default'] }`).
`preset-default` includes **`cleanupIds`, which minifies the gradient id to `a`**.

`web/src/lib/icons/more-colors.svg` **already ships `id="a"`** (a `<path>` in `<defs>` that its
seven `<use>` elements reference). It renders in `ColorPalette.svelte:148` — the same document as
the Actions Panel on the drawing route. Two `id="a"` elements in one document means `url(#a)` and
`href="#a"` both resolve to whichever comes first, and either the rainbow strokes or the palette
hexagons paint wrong.

The fix, in `scripts/image-audit.mjs`:

```js
const SVGO_CONFIG = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: { overrides: { cleanupIds: { preservePrefixes: ['icon-'] } } },
    },
  ],
};
```

Verified: with this override the id survives as `icon-line-weight-magic-rainbow`, optimization stays
idempotent, and **zero existing icons are rewritten** — so `img:audit:check` stays green without a
mass reformat. The `SVGO_CONFIG` comment should record why the override exists.

### The face cannot be a reactive ternary

`Icon.svelte` renders its SVG through `{@html}`, which **hydration does not reconcile**
(`.claude/rules/svelte.md`). So an icon chosen from client-only state keeps the *server-rendered*
SVG after hydration. The two brush states differ here, and the difference is the whole design:

* **`magic` is persisted and seeded pre-paint.** `app.html:131-132` sets `data-brush` on `<html>`
  when the stored brush is `crayon` or `magic`. So on a reload where the child last held the magic
  brush, SSR renders the *pen* face and the client's first value is *magic* — the exact mismatch
  `{@html}` will not fix. **The magic face must be CSS-driven**, the way `BrushButtonFaces.svelte`
  drives the Brush Button.
* **`eraser` is deliberately never persisted** (`tool.svelte.ts:57-64` — "a stored value is never
  restored as the eraser"). `erasing` can only become true through a live interaction *after*
  hydration, at which point Svelte re-renders normally. **The existing `erasing ? … : …` ternary at
  `ActionsPanel.svelte:326` is safe and should stay.**

So the shape is: keep the reactive eraser branch; in the non-eraser branch render *both*
`line-weight-brush` and `line-weight-magic` and let CSS pick. Mirror `BrushButtonFaces.svelte`'s
selector pattern exactly — it has to cover both the pre-hydration
`html[data-brush='magic'] .actions-panel:not([data-action-panel-live])` case and the live
`.actions-panel[data-action-panel-live][data-brush='magic']` case.

## Unverified assumptions

* **That the `<Icon>` markup can be duplicated inside the Stroke Width Button without disturbing
  layout.** `BrushButtonFaces` gets away with it via `display: contents` on the wrapper plus
  `display: none` on the inactive faces; the Stroke Width Button's icon is sized by
  `:global(.action-icon) { width: 100%; height: 100% }` (`ActionsPanel.svelte:704`). Expected to
  behave the same, not checked in a browser.
* **That the keyline rules stay inert.** `app.css:391,400` target `svg path[fill='currentColor']`.
  The new icon's path is `fill="url(#…)"`, so `whiteStroke` / `darkStroke`
  (`ActionsPanel.svelte:170-171`) should no-op on it. Worth an eyeball with white ink selected.
* **That 24 px still reads.** Rendered and eyeballed at 24 px during design and it holds, but that
  was a standalone render, not the real Settings → Controls row (`ControlsSection.svelte:63`).
* **That no E2E spec asserts the Stroke Width Button's icon identity.** Not searched. `<Icon>` sets
  `data-icon={name}`, so a spec pinning `[data-icon='line-weight-brush']` would now find two icons
  in the DOM. Grep `web/tests/` before assuming.

## Done & verified

Everything below was actually run, on the SVG content quoted above:

* `isSpot(svg)` from the real `scripts/lib/iconChroma.mjs` → **`true`**. The `COLOR_ICONS` guard
  will genuinely cover the icon.
* SVGO with `cleanupIds: { preservePrefixes: ['icon-'] }` → id preserved, output **idempotent**, and
  a sweep over all 66 existing icons in `web/src/lib/icons/` confirmed **none** would be rewritten
  by the override.
* Without the override, SVGO renames the id to **`a`**, colliding with `more-colors.svg` — confirmed
  by grepping `id="` across every icon (`more-colors.svg` is the only current holder).
* Rendered in Chromium at 236 px, on the real 60 px button chrome in **both** light
  (`--float-surface: #ffffff`) and dark (`#2e2c38`), and at 24 px — all legible. Rendered in the
  same document as `more-colors.svg` with the prefixed id: no collision, both correct.
* The three stroke bands were sampled off the path itself (`getPointAtLength` × 4000) — gaps at y ≈
  29.7–53.8 and 96.6–120.7 — confirming the gradient crosses all three strokes continuously.

**Not run:** `npm run check`, `npm test`, `npm run gen:icons`, `npm run img:audit`. No source file
has been modified, so there was nothing to check.

## Risks & next 3 steps

**Risk — do not commit the SVG on its own.** `icon-orphans.test.ts` counts an icon as referenced
only where a **quoted string literal** of its name appears in non-test source. An SVG added without
its `'line-weight-magic'` literal fails the suite. Land the asset and its reference in one commit.

1. **Land the asset + config.** Write `web/src/lib/icons/line-weight-magic.svg` (path data copied,
   not retyped), apply the `cleanupIds` override in `scripts/image-audit.mjs` with a comment saying
   why, run `npm run gen:icons` to regenerate `icon-names.d.ts`, and add `'line-weight-magic'` to
   `COLOR_ICONS` in `Icon.svelte`.
2. **Wire the face.** Rework the Stroke Width Button's icon at `ActionsPanel.svelte:326` per "The
   face cannot be a reactive ternary" above — reactive eraser branch preserved, `brush`/`magic`
   faces both rendered and picked by CSS on `[data-brush='magic']`. Add `'line-weight-magic'` to the
   styleguide group at `AssetSections.svelte:65` (currently
   `['line-weight-brush', 'line-weight-eraser']`).
3. **Verify.** `npm run check`, `npm test`, `npm run img:audit:check`, then run the app
   (`run-splotch` skill) and confirm: pen → ink face, magic → rainbow face, eraser → eraser face,
   and **reload while holding the magic brush** — that reload is the specific case the CSS pattern
   exists to fix, and a reactive implementation would look correct in every other scenario. Check
   both themes and the Settings → Controls row.

## Open questions

* **Do the flyout's size previews follow the trigger?** `size-brush-1..5` tint via `currentColor`
  (`StrokeWidthMenu.svelte:55`). Leaving them ink while the trigger goes rainbow is defensible —
  they show *size*, not color — but it is a visible inconsistency once the flyout is open. Worth
  asking before shipping. Rainbowing all five means five more assets and five more `COLOR_ICONS`
  entries.
* **Should a drift guard pin id uniqueness across icons?** The `more-colors` collision was found by
  hand and the prefix fix only protects icons that opt in. A test asserting every `id="…"` across
  `web/src/lib/icons/*.svg` is globally unique would close the class of bug and matches the repo's
  drift-guard convention. Small, and arguably belongs with this change.

## Reread first

* `web/src/lib/components/BrushButtonFaces.svelte` — the CSS-driven face pattern to mirror; read
  this before writing any of step 2.
* `.claude/rules/svelte.md` — the `{@html}` hydration rule and the new-icon procedure.
* `web/src/lib/components/ActionsPanel.svelte:326` (trigger), `:49` (`erasing`), `:170-171`
  (keylines), `:704` (`.action-icon` sizing).
* `web/src/lib/state/tool.svelte.ts:57-64` — why the eraser is never persisted.
* `web/src/app.html:131-132` — the pre-paint `data-brush` seed.
* `scripts/image-audit.mjs` (SVGO config) and `scripts/lib/iconChroma.mjs` (`isSpot`).
* `web/src/lib/components/icon-orphans.test.ts`, `Icon.svelte.test.ts`,
  `web/src/lib/icons/tokenFallback.test.ts` — the three guards this change has to satisfy.
* `web/src/lib/drawing/magicBrush.ts:204-227` — `createRainbowGradient` / `paintGradient`, the
  source of the angle and the HSL bounds.
* ADR-0102 (spot-icon theme tokens), and the `design` skill for the icon conventions.
