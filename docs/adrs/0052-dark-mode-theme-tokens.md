# ADR-0052: Dark Mode via `data-theme` + CSS Custom-Property Tokens; the Paper Stays Light

**Status:** Active
**Date:** 2026-07

## Context

Parents asked for a dark mode with three choices — Light, Dark, or System (follow the OS) —
picked in the Parent Center. Three design questions had real alternatives:

1. **How the theme reaches CSS.** `light-dark()` would let every color declare both values
   inline, but it needs Chrome 123 / Safari 17.5 — above the supported floor
   (Chrome 111 / Safari 16.4, `docs/COMPATIBILITY.md`). A JS-resolved class (always stamping
   `light`/`dark` and listening for OS changes) makes the default "system" behavior depend on a
   runtime listener. A `data-theme` attribute that is **absent in system mode** lets plain
   `prefers-color-scheme` CSS handle the default with no JS at all.
2. **What "dark" means in a drawing app.** Toddler drawings are made for white paper — dark
   default stroke colors, coloring-page line art composited with `mix-blend-mode: multiply`,
   exported PNGs on paper white. Darkening the canvas would change how every drawing looks
   (and make black line art invisible), so "theme everything" was rejected.
3. **First-paint correctness.** `/` is prerendered (ADR-0040), so the static HTML can't know a
   returning user's stored choice; without a pre-paint stamp an explicit-dark user would flash
   light on every load.

## Decision

**Attribute + tokens.** `<html>` carries `data-theme="light"` or `"dark"` only when the parent
explicitly chose one; the default `system` leaves the attribute off. All themed chrome reads
semantic custom properties (`--surface`, `--text`, `--border`, `--brand-wash`, …) defined in
`web/src/app.css`: light values on `:root`, dark overrides in **two deliberately identical
blocks** — `:root[data-theme='dark']` and
`@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }`. CSS below the
browser floor has no way to share one declaration block between an attribute selector and a
media query, so the duplication is the accepted cost; keep the blocks in sync.

- Setting: `settings.theme` in `web/src/lib/state/settings.svelte.ts` (`splotch-theme`,
  covered by `reloadSettings()` / the native durable mirror). `web/src/lib/theme.ts` owns the
  runtime side: `applyTheme()` stamps the attribute, keeps `<meta name="theme-color">` on the
  *resolved* theme, and watches OS switches while in system mode.
- Pre-paint: the head script in `web/src/app.html` stamps `data-theme` before first paint,
  following the existing "attribute only on deviation from default" convention.
- UI: the **Appearance Control** (Light / Dark / System segmented control) at the top of the
  Parent Center Settings tab (`SettingsToggles.svelte`).
- **The paper stays light.** The canvas sheet, its rotation-lock margins, and every control
  floating on the paper (Actions Panel, Clear Button, corner buttons, Notch Band) keep literal
  colors and are *not* tokenized. Dark mode themes the chrome around the paper: app
  background, palette bar, all modals, Install Banner, error screen. Coloring-book picker
  tiles also stay light (multiply-blended line art needs a paper background).
- **Icons.** Monochrome Material SVGs bake in `fill="#1f1f1f"`; the CSS `fill` property beats
  that presentation attribute, so one zero-specificity rule
  (`:where(.modal-shell) :where([data-icon]:not(.icon-color):not(.icon-tinted)) svg`) re-inks
  them to `--icon-ink` on themed surfaces (InstallBanner repeats it locally). Where an icon
  was tinted by a hand-tuned `filter` chain (modal close, coloring-book back, breadcrumb
  home), the filter was replaced with theme-aware `fill` — a filter composed over the re-ink
  would drift in dark mode.

## Consequences

- + System mode is pure CSS — an OS theme switch recolors the app live with no JS listener
    (the only JS follower is the `theme-color` meta).
- + Prerendered HTML with no attribute renders the system default correctly even if the head
    script never runs; explicit choices restore before first paint (no flash).
- + Drawings, exports, and coloring pages look identical in both themes.
- - The dark token block is duplicated (attribute selector + media query) and the two copies
    must be kept in sync by hand until the floor reaches `light-dark()`.
- - Every new chrome surface must remember to use tokens; a literal hex sneaks in as
    light-only and only shows up when eyeballing dark mode.
- - `/admin` and `/privacy` are deliberately out of scope (self-contained light pages), which
    reads as an inconsistency if you navigate there from a dark app.
