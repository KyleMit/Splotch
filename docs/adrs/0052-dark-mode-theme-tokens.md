# ADR-0052: Dark Mode via `data-theme` + CSS Custom-Property Tokens; Dark Free-Draw Paper, Light Coloring Sheet

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
semantic custom properties (`--surface`, `--text`, `--border`, `--paper`, `--float-*`, …)
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
- **Coloring pages keep a LIGHT sheet, even in dark mode.** A coloring page is authored for
  white paper — black lines, white regions to fill — so forcing it onto dark paper broke the
  metaphor (un-colored regions read as filled-dark, not "blank to color"; pen strokes floated
  on charcoal; the magic-brush light twin clashed with the dark ground). Instead, while a page
  is applied `DrawingCanvas.svelte` toggles `data-coloring` on `<html>`, and
  `:root[data-coloring]` reverts `--paper`/`--paper-margin` to their light values (it comes
  after both dark blocks, so it wins by source order at equal specificity). Result: a bright
  coloring sheet spotlit on the dark desk — chrome, palette, and buttons stay dark. The overlay
  line art always multiplies black-on-light (`DrawingCanvas` / picker tiles hard-code
  `mix-blend-mode: multiply`; the picker tiles stay light in both themes since they preview
  pages), and the magic-brush colored twin (light background) now lands seamlessly on the light
  sheet. Free-hand drawing with no page keeps the dark paper. *(This supersedes an earlier
  attempt to invert the line art to white on dark paper via `--lineart-filter`/`--lineart-blend`
  tokens, now removed.)*
- **JS consumers of the resolved theme.** `PAPER_COLORS` in `theme.ts` mirrors `--paper` (keep
  in sync); `lib/state/appearance.svelte.ts` exposes a reactive `resolvedTheme()` (setting +
  live OS preference). Both the **Notch Band** and the **export path** additionally treat an
  active coloring page as light, mirroring `:root[data-coloring]`: the Notch Band's eraser
  clears the band to the light paper (`NotchBand.svelte`), and `exportDrawing.ts` fills the
  light paper + multiplies the black line art when an overlay image is present (its presence IS
  the coloring-active signal), so a saved coloring page is always black-on-white. Free-draw
  exports still follow the resolved theme (dark paper in dark mode).
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
- + One texture and one set of assets serve both themes; coloring pages behave like real paper
    in either theme, and exports match what the child saw.
- + Coloring pages sidestep the dark-paper tradeoffs entirely (they're always a light sheet),
    so the magic-brush reveal blends and un-colored regions read as white.
- - Black/dark strokes are nearly invisible on the dark FREE-DRAW paper — the mirror image of
    white crayon on light paper today. A free-hand drawing made in one theme can look different
    (or partly vanish) when viewed in the other; the strokes themselves are never lost.
    (Coloring pages are unaffected — they stay light.)
- - `data-coloring` flips the paper between two states; the transition when applying/clearing a
    page in dark mode is a visible (deliberate) change, not a flash.
- - The dark token block is duplicated (attribute selector + media query) and the two copies
    must be kept in sync by hand until the floor reaches `light-dark()`; `PAPER_COLORS` in
    `theme.ts` is a third copy of `--paper`.
- - Every new chrome surface must remember to use tokens; a literal hex sneaks in as
    light-only and only shows up when eyeballing dark mode.
- - `/admin` and `/privacy` are deliberately out of scope (self-contained light pages).
