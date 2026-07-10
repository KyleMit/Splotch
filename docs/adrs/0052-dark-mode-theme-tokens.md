# ADR-0052: Dark Mode via `data-theme` + CSS Custom-Property Tokens; Dark Paper, White "Chalk" Line Art, Night Coloring Fills

**Status:** Active
**Date:** 2026-07

## Context

Parents asked for a dark mode with three choices — Light, Dark, or System (follow the OS) —
picked in the Parent Center, with the drawing paper itself going dark (not pure black, texture
kept) and the coloring pages adapting. The design questions with real alternatives:

1. **How the theme reaches CSS.** `light-dark()` would let every color declare both values
   inline, but it needs Chrome 123 / Safari 17.5 — above the supported floor
   (Chrome 111 / Safari 16.4, `docs/COMPATIBILITY.md`). A JS-resolved class (always stamping
   `light`/`dark` and listening for OS changes) makes the default "system" behavior depend on a
   runtime listener. A `data-theme` attribute that is **absent in system mode** lets plain
   `prefers-color-scheme` CSS handle the default with no JS at all.
2. **How the paper darkens without a second texture.** The handmade-paper webp turns out to be
   a **low-alpha grain layer** (alpha ≈ 0.07–0.29) composited over a CSS `background-color`,
   so a pre-generated dark texture asset is unnecessary — swapping the color under the same
   texture darkens the paper with the grain intact. The same holds in the export path, which
   fills the paper color and then patterns the texture over it.
3. **How coloring pages stay usable.** The line art is black-on-white, composited with
   `mix-blend-mode: multiply` (white ≈ transparent over light paper). On dark paper that art
   would be invisible. Pre-generating inverted page assets was on the table, but a pure
   runtime treatment works: `filter: invert(1)` on the art plus `mix-blend-mode: screen`
   (black ≈ transparent over dark paper) — white "chalk" lines, no new assets, no asset-sync
   burden across ~100 page/thumb/cover files.
4. **First-paint correctness.** `/` is prerendered (ADR-0040), so the static HTML can't know a
   returning user's stored choice; without a pre-paint stamp an explicit-dark user would flash
   light on every load.

## Decision

**Attribute + tokens.** `<html>` carries `data-theme="light"` or `"dark"` only when the parent
explicitly chose one; the default `system` leaves the attribute off. All themed surfaces read
semantic custom properties (`--surface`, `--text`, `--border`, `--paper`, `--lineart-*`, `--float-*`, …)
defined in `web/src/app.css`: light values on `:root`, dark overrides in **two deliberately
identical blocks** — `:root[data-theme='dark']` and
`@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }`. CSS below the
browser floor has no way to share one declaration block between an attribute selector and a
media query, so the duplication is the accepted cost; keep the blocks in sync.

- Setting: `settings.theme` in `web/src/lib/state/settings.svelte.ts` (`splotch-theme`,
  covered by `reloadSettings()` / the native durable mirror). `web/src/lib/theme.ts` owns the
  runtime side: `applyTheme()` stamps the attribute, keeps `<meta name="theme-color">` on the
  *resolved* theme, and watches OS switches while in system mode. The pre-paint head script in
  `web/src/app.html` stamps `data-theme` before first paint, following the existing
  "attribute only on deviation from default" convention.
- UI: the **Appearance Control** (Light / Dark / System segmented control) at the top of the
  Parent Center Settings tab (`SettingsToggles.svelte`).
- **The paper darkens with the theme.** `--paper` (dark: a warm near-black, not pure black)
  sits under the unchanged low-alpha texture (`DrawingCanvas.svelte`); `--paper-margin` is the
  flat tone behind the rotation-locked sheet. The clear gesture's paper washes and page-turn
  ripple (`ClearButton.svelte`) follow `--paper` via `color-mix` (rgba fallbacks precede each,
  per `docs/COMPATIBILITY.md`).
- **Controls on the paper darken too.** The Actions Panel cards and stroke flyout use
  `--float-surface` (dark: a step *lighter* than `--paper`, since their drop shadows vanish on
  a dark ground); corner buttons (drawer toggle, Fullscreen Toggle, Parent Help) swapped their
  hand-tuned `invert()` icon chains for theme-token `fill`s — the old active state inverted to
  black, invisible on dark paper. Near-black `currentColor` ink on the cards gets a light
  keyline via `.dark-stroke` + `--dark-ink-keyline` (`isDarkInk` in `colors.svelte.ts`) — the
  exact mirror of the existing white-ink `.white-stroke` black keyline; the token is
  transparent in light mode so the class is inert there. The **Clear Button** is the one
  deliberately unthemed control — its red danger chrome reads the same on either paper.
- **Coloring pages stay on the DARK paper — white "chalk" line art + pre-colored NIGHT fills
  (direction B).** A coloring page keeps the same dark chalkboard paper as free-draw, not a
  light sheet. Its line art inverts to white and screens over the dark paper via
  `--lineart-filter` (`none` → `invert(1)`) + `--lineart-blend` (`multiply` → `screen`) on the
  `DrawingCanvas` overlay — white lines on dark, no pre-generated inverted assets. The overlay
  only renders while a page is applied, so these tokens are effectively the dark+coloring
  treatment. The coloring-book **picker tiles** (`ColoringBook.svelte`) carry the same
  `--lineart-*` tokens, so covers and page thumbnails preview as white-on-dark in dark mode,
  matching the chalkboard the page applies to. The magic brush then reveals a whole PARALLEL
  SET of pre-colored **night fills**
  (`{page}-{orient}.night.webp`, `tools/asset-gen/gen-coloring-fills-dark.mjs`): deep-navy backgrounds
  with glowing, cozy-night fills, registered to the original outline. `DrawingCanvas` picks the
  fill by `resolvedTheme()` — the light fill (`.light.webp`) in light mode, the night fill in
  dark mode — reading it reactively so a live theme flip re-rasterizes the sheet. Where a night
  fill isn't generated yet (an orientation/page still pending), dark mode falls back to the
  light fill. Both fills ship **fills-only** — asset-gen punches each one's outlines out at
  build time against the **original** black-on-white line art (ADR-0043's build-time
  follow-up), keyed off the line art's darkness so both fills punch with the same polarity —
  no per-fill flip needed, and the overlay line art stays the single source of line work in
  either theme. *(This supersedes two earlier attempts: inverting the
  line art with the magic brush left untouched — the light fill's bright background jarred on
  dark — and the light-sheet approach that reverted the whole page to light paper via a
  now-removed `:root[data-coloring]` override.)*
- **Pen coloring on the dark sheet** uses the same palette as dark free-draw (night fills power
  only the magic brush); dark palette colors on dark paper carry the same low-contrast tradeoff
  as free-hand dark drawing, accepted rather than adding a second palette.
- **JS consumers of the resolved theme.** `PAPER_COLORS` in `theme.ts` mirrors `--paper` (keep
  in sync); `lib/state/appearance.svelte.ts` exposes a reactive `resolvedTheme()` (setting +
  live OS preference). The **Notch Band** eraser clears the band to the resolved theme's paper
  (`NotchBand.svelte`), and the **export path** (`exportDrawing.ts`) follows the resolved theme
  for coloring pages too: a dark-mode save is the night version — dark paper, inverted white
  line art screened on top, and the night-fill reveals already baked into the replayed strokes.
- **Catalog.** `books.ts` carries a `nightImages: Partial<Record<orientation, url>>` per page
  (only the orientations that have a generated fill) with a `pageNightImage()` helper;
  `coloringBook.svelte.ts` tracks `nightSheetUrl` alongside `colorSheetUrl`. `bookAssetPaths()`
  lists the shipped night fills so `check-assets` validates them and `strip-native-assets`
  removes them, exactly like the light `.light.webp` fills (no thumbnails — never in the grid).
- **Prominence of the float cards in dark mode.** The action buttons' warm drop shadow vanishes
  on dark paper, so `--float-border` (a faint light hairline) + `--float-shadow` /
  `--float-shadow-flyout` give each card a visible edge and lift in dark mode; both are
  byte-identical to the prior light styling in light mode (transparent border + the warm
  shadow).
- **Icons.** Monochrome Material SVGs bake in `fill="#1f1f1f"`; the CSS `fill` property beats
  that presentation attribute, so one zero-specificity rule
  (`:where(.modal-shell) :where([data-icon]:not(.icon-color):not(.icon-tinted)) svg`) re-inks
  them to `--icon-ink` on themed surfaces (InstallBanner repeats it locally). Where an icon
  was tinted by a hand-tuned `filter` chain (modal close, coloring-book back, breadcrumb
  home), the filter was replaced with theme-aware `fill` — a filter composed over the re-ink
  would drift in dark mode.

## Consequences

- + System mode is pure CSS — an OS theme switch recolors the app (paper included) live with
    no JS listener; the only JS followers are the `theme-color` meta and the Notch Band.
- + Prerendered HTML with no attribute renders the system default correctly even if the head
    script never runs; explicit choices restore before first paint (no flash).
- + One texture and one set of line-art assets serve both themes; coloring pages stay on the
    same dark chalkboard as free-draw (one coherent dark surface, no light sheet spotlit on a
    dark desk), and exports match what the child saw.
- + The night fills turn dark mode into a distinct experience rather than a compromise — a
    parallel set of cozy-night pictures under the same brush — while light mode is untouched.
- - Black/dark strokes are nearly invisible on the dark paper (free-draw AND pen-coloring) — the
    mirror image of white crayon on light paper today. A free-hand drawing made in one theme can
    look different (or partly vanish) when viewed in the other; the strokes themselves are never
    lost. Magic-brush reveals are unaffected (they carry the fill's colors).
- - Night fills are a second asset set to generate and ship (~8 categories × 6 pages × 2
    orientations), rolled out category by category; until an orientation/page has one, dark mode
    falls back to revealing the light fill under the brush.
- - The dark token block is duplicated (attribute selector + media query) and the two copies
    must be kept in sync by hand until the floor reaches `light-dark()`; `PAPER_COLORS` in
    `theme.ts` is a third copy of `--paper`.
- - Every new chrome surface must remember to use tokens; a literal hex sneaks in as
    light-only and only shows up when eyeballing dark mode.
- - `/admin` and `/privacy` are deliberately out of scope (self-contained light pages).
