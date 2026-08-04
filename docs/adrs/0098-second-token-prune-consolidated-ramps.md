# ADR-0098: Second Token Prune — Consolidated Radius, Type, Elevation, and Color Ramps

**Status:** Active **Date:** 2026-08

## Context

ADR-0097 pruned the token vocabulary to steps that earn their place and attached a usage rule to
every survivor. An owner review of the `/design` page a few days later found the inventory still
wider than the app's needs: contributors faced five radii, seven font sizes, four shadows, and a
theme palette holding several near-duplicate steps, each demanding a choice the design didn't
actually offer. Specifically:

* `--radius-xl` (22px) had four consumers, and one of them was a contradiction: the AI result
  dialog's download button used 22px on a 44px-tall control (a pill by construction), while the AI
  modal card itself rounded at `xl` when every other modal card rounds at `--radius-lg` via
  `.modal-shell`.
* `--font-size-2xl` (28px, "page H1s") had three consumer files, none of them an actual page H1 on
  the ramp's terms: the crash screen and the dev index are whole-page heroes (the display tier's
  role), and the parental gate used it for equation digits sitting next to `xl` operators.
* `--float-shadow-flyout` had exactly one consumer (`.flyout-menu`), kept in ADR-0097 without a
  usage-driven case.
* Four themed pairs were near- or exact duplicates: `--surface-warm-hover` vs `--surface-hover`
  (identical in dark, one warm step apart in light), `--slider-track` vs `--control-track` (two
  "inactive track" grays), `--icon-muted-hover` vs `--icon-ink` (two "strong icon" inks a few hex
  digits apart), and `--success-accent` vs `--success-text` (two confirmation greens, the accent
  unthemed and flagged in `tokens.ts` as awaiting exactly this review).

## Decision

**Prune again, harder: one corner for surfaces, one title step, one float shadow, and no
near-duplicate grays.** All merges move consumers to the nearest surviving token:

* **Radius: three steps plus pill** — `--radius-sm/md/lg` (8/12/16px) and `--radius-pill`.
  `--radius-xl` deleted: the page sheet, Install Banner, and parental gate round at `lg` (matching
  `.modal-shell`), and the AI download button becomes the pill it always was. The rule is now
  positional, not aesthetic: chips `sm`, controls `md`, everything card-sized and up `lg`.
* **Type: five body steps plus display** — `--font-size-xs/sm/md/lg/xl` (12/14/16/18/22px) and
  `--font-size-display`. `--font-size-2xl` deleted: `xl` is the ceiling inside any surface (modal,
  card, and section titles), and the display tier is the H1 of a whole page (PageShell hero, crash
  screen, dev index). There is deliberately nothing between 22px and the fluid display range — a
  heading is either a title on a surface or the page's hero.
* **Elevation: three shadows** — `--shadow-control`, `--shadow-pop`, and the themed
  `--float-shadow`. `--float-shadow-flyout` deleted; flyouts share the one paper-float lift (their
  dark-mode edge still comes from `--float-border`).
* **Theme palette: four merges**
  * `--surface-warm-hover` → `--surface-hover` (dark values were already identical).
  * `--slider-track` → `--control-track`: one recessed gray for every inactive track — toggle-off,
    slider rails, segmented-picker tracks. The two stray non-track consumers of the old grays moved
    to their semantic tokens instead (the folder-clear disc to `--surface`/`--surface-hover`, the
    disabled action-button icons to `--icon-muted`), so the track token's rule holds exactly. The
    merged token keeps the old *slider* values (`#e9e9e9` light / `#3a3a45` dark): segmented pickers
    set `--text-soft` labels directly on the track, and only those values hold 4.5:1 under them (the
    toggle's old grays fail axe at 4.2:1 — the a11y suite caught the first attempt at merging in the
    other direction).
  * `--icon-muted-hover` → `--icon-ink`: quiet chrome icons rest muted and hover to full ink; no
    intermediate step.
  * `--success-accent` → `--success-text`: one success green per theme. This resolves the
    `tokens.ts` note that the accent's unthemed `#4caf50` awaited a dark-tuned review — the
    confirmation checks now use the theme-tuned green.

This supersedes ADR-0097's "kept deliberately" carve-outs for `--surface-warm-hover` and
`--float-shadow-flyout`. The warm *border* family (`--border-warm`, `--border-warm-strong`) stays:
those borders are visibly warm and carry the paper-adjacent chrome on their own.

The guidance layer tightened with the vocabulary: the usage rules in `tokenUsage.ts` now state the
consolidations as law ("the one hover fill", "every inactive track", "the one themed lift"), and
`/design`'s defaults callout adds the title rule (`--font-size-xl` unless it heads a whole page).

## Consequences

* Visible changes accepted as deliberate tightening: sheet-scale corners tightened 22→16px (page
  sheets, Install Banner, parental gate — now matching the modal cards); the parental-gate equation
  digits dropped 28→22px to match their operators; the crash screen's and dev index's H1s grew onto
  the fluid display tier; flyout shadows softened to the standard float lift; confirmation checks
  turned theme-tuned green (deeper in light, mint in dark); the toggle's off-track moved onto the
  AA-pinned track gray (lighter in light mode, a step darker in dark); warm-chrome hover fills went
  neutral; quiet icons now hover all the way to full ink.
* Every ramp's steps are countable on one hand, and each merge's rule names the *only* token for its
  job, so the next contributor has fewer choices to second-guess.
* `--font-size-display` fallback-sizes the crash screen at a fixed 32px (near the display floor)
  because the crash path cannot assume `tokens.css` loaded — recorded in `ErrorScreen.svelte`.
