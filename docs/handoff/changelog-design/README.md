# Handoff: Changelog contents (`/changelog`)

## Overview

The `/changelog` route currently renders its table of contents as a two-column grid of bordered
links (`.contents ol` in `web/src/routes/changelog/+page.svelte`). Two problems:

1. **Widescreen.** The grid asks the reader to scan in a Z pattern across a list that is already
   strictly ordered newest-first, and it consumes the sheet's full width while the release notes
   below it sit at a 62ch measure.
2. **Phone (≤ 420px).** The grid collapses to one column *and* each link stacks its version over its
   date, so six releases run roughly 430px tall — an entire second screen of contents before
   `Version 1.4.0` begins.

This handoff replaces the contents block with two treatments of the same anchors: a **sticky left
rail** at widescreen and a **collapsed disclosure** on phones. Nothing else on the page changes —
same route, same anchors, same `releases.json`, same pinned light palette, same `ReleaseHistory`
markup.

## About the design files

The files in this bundle are **design references created in HTML** — a prototype showing intended
look and behavior, not production code to copy. The task is to recreate them inside the existing
SvelteKit app using its established patterns: Svelte 5 runes, scoped `<style>` blocks, the
`--page-*` custom properties declared by `PageShell.svelte`, and the design tokens in
`web/src/tokens.css`. Do not port inline styles from the HTML; the prototype uses them only because
it has no build step.

`Changelog Contents Options.dc.html` is a canvas holding **six** options across two turns. Only
**1a** (widescreen) and **2a** (phone) are approved. Ignore 1b, 1c, 2b, 2c — they are rejected
alternatives kept for context.

## Fidelity

**High-fidelity.** Colors, type, and spacing below are the real token values read out of
`web/src/tokens.css` and the pinned palette in `web/src/routes/changelog/+page.svelte`. Match them
exactly, but express them as the existing tokens (`var(--space-4)`, `var(--font-size-sm)`,
`var(--page-rule)`) rather than as literals — the prototype only writes literals because it cannot
read the app's stylesheets.

One caveat: the prototype's sheet is 1148px wide. The repo's `PageShell.svelte` pins
`.sheet { max-width: 880px }`. The rail design does not depend on 1148px — it works at 880px, where
the notes column lands at ~536px. Implement against the real 880px sheet unless a wider sheet ships
separately.

---

## Screen 1 — Widescreen (`> 920px`): sticky contents rail

Reference: `1a-widescreen-sticky-rail.png`

### Purpose

Contents leaves the reading column entirely. It becomes a persistent rail on the left that tracks
position as the reader scrolls, so "where am I / what else is there" is answerable at any scroll
depth instead of only at the top.

### Layout

Inside `PageShell`'s sheet, below the hero, wrap the nav and `<ReleaseHistory />` in one grid:

```
display: grid;
grid-template-columns: 232px minmax(0, 1fr);
gap: 56px;                 /* var(--space-7) + var(--space-6), or a literal 56px */
align-items: start;
```

* Left column: the contents `<nav>`, `position: sticky; top: var(--space-6)`.
* Right column: `<ReleaseHistory />` unchanged. Its `.release` rules already carry `border-top` +
  `padding: var(--space-8) 0`; keep them. Because the first release now sits at the top of its own
  column, its `border-top` reads as the rule that separates hero from body — that is intended.
* The nav's own `margin-bottom` (currently `var(--space-8)`) goes away; the grid gap owns that space
  now.

`--page-measure: 62ch` still caps `.release-notes p` / `ul`, so the notes never run wider than they
do today.

### Components

**Rule label** — reuse `RuleLabel` unchanged (`Contents`, 12px / 600 / .14em / uppercase /
`--page-muted`, hairline `--page-rule` running to the column's right edge). Override its
`padding-bottom` to `var(--space-4)` inside the rail; the default 30px is tuned for a full-width
band.

**Rail item** (`<a>` per release, `<ol>` / `<li>` preserved for semantics):

| Property          | Value                                                                                |
| ----------------- | ------------------------------------------------------------------------------------ |
| Layout            | `display: flex; flex-direction: column; gap: 2px`                                    |
| Padding           | `var(--space-2) var(--space-3)` (8px 12px)                                           |
| Left border       | `2px solid var(--page-rule)` (#eeeae4)                                               |
| Version line      | `var(--font-size-sm)` / `var(--font-weight-semibold)` / `var(--page-link)` (#7c4dcf) |
| Date line         | 13px / `var(--font-weight-medium)` / `var(--page-muted)` (#6c6c76)                   |
| Gap between items | `var(--space-1)` (4px)                                                               |
| Border radius     | none — the flush left border is the alignment device                                 |

**Rail item, current** (the release whose article is in view):

| Property    | Value                                                                                                                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Left border | `2px solid var(--page-link)`                                                                                                                                                                                                                                                    |
| Background  | `var(--brand-wash)`. This packet originally specced a pinned `#f6f2fd` and warned off `--brand-wash` because the page was light-only; `/changelog` follows night mode now (ADR-0071's 2026-08-10 amendment), so the themed wash is the right answer and no new token is needed. |

**Rail item, hover** (`@media (hover: hover)` only, matching the existing guard):
`text-decoration: underline` on the version line only — the date stays unmarked. There is no
`--page-link-hover` any more: the themed link ramp has no deeper step, so the underline is the whole
hover signal.

**Focus:** keep the app's default focus ring; do not suppress it.

### Behavior

* Anchor links, unchanged: `href={`#${release.id}`}`, and `.release` keeps its `scroll-margin-top`.
  Raise it from `var(--space-4)` to `var(--space-6)` so a jumped-to heading clears the sticky rail's
  top edge.
* **Current-item tracking** is the one piece of new behavior. Use an `IntersectionObserver` over the
  `.release` articles with `rootMargin: '0px 0px -70% 0px'`, and mark the last entry that is
  intersecting. Seed the state to the newest release (index 0) so the rail is never blank at the top
  of the page, and set `aria-current="true"` on the active link. Prefers-reduced-motion is not a
  factor; nothing animates.
* No smooth scrolling — the page uses the browser default today, keep it.

### Responsive

* **> 920px:** as above.
* **541–920px:** `PageShell` already drops `.sheet` to fluid width here. Collapse the grid to a
  single column (`grid-template-columns: 1fr`), drop the sticky positioning, and render the contents
  as the phone treatment below (one disclosure row). A 232px rail beside a ~600px sheet squeezes the
  notes.
* **≤ 540px:** phone treatment, see Screen 2.

---

## Screen 2 — Phone (`≤ 920px`, tuned at 390px): collapsed contents

Reference: `2a-phone-collapsed-contents.png`

### Purpose

Get `Version 1.4.0` above the fold. The contents list stops being a wall and becomes a single row
that says how much is behind it.

### Layout

Everything in `PageShell`'s phone rules stays as-is: 20px gutter (`clamp(20px, 5vw, 34px)`), sheet
wall-to-wall with `border-radius: 0` and no shadow, `--font-size-display` at its 34px clamp floor,
16px lede, 28px hero `padding-bottom`, and `BrandMark`'s small strip (7×6px chips, 2px gap, 10px
wordmark at .08em).

The contents block becomes one row directly under the hero, then `margin-bottom: var(--space-6)`
(24px), then `<ReleaseHistory />`.

### Components

**Disclosure row** — a native `<details>` / `<summary>`; no JS.

`<summary>`:

| Property    | Value                                                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout      | `display: flex; align-items: center; justify-content: space-between; gap: var(--space-3)`                                                            |
| Padding     | `var(--space-3) var(--space-4)` (14px 16px in the mock; `var(--space-3)` = 12px is close enough if you prefer the scale)                             |
| Height      | ≥ 48px — this is the whole tap target                                                                                                                |
| Border      | `var(--border-width) solid var(--page-rule)`                                                                                                         |
| Radius      | `var(--radius-sm)` (8px)                                                                                                                             |
| Left label  | `Contents` — `var(--font-size-xs)` / 600 / .14em / uppercase / `var(--page-muted)`. Same treatment as `RuleLabel`, minus the hairline.               |
| Right label | `6 releases` + a caret — `var(--font-size-sm)` / `var(--font-weight-semibold)` / `var(--page-link)`                                                  |
| Count       | Derived: `releases.length`. Never hardcode.                                                                                                          |
| Marker      | `list-style: none` + `::-webkit-details-marker { display: none }`; draw the caret yourself so it inherits `--page-link`.                             |
| Open state  | Rotate the caret 180°, `transition: transform var(--duration-fast) var(--ease-glide)`; wrap in `@media (prefers-reduced-motion: reduce)` to disable. |

**Open contents:** the existing single-column list, unchanged from today's `≤ 420px` styling (each
link `flex-direction: column`, version over date). It is only ever seen deliberately, so its height
no longer matters.

**Hover:** `@media (hover: hover)` only — `border-color: var(--page-link)`.

### Behavior

* Closed by default on every load. Do **not** persist the open state; a reader who opened it once
  should still land on the newest release next visit.
* Tapping a version inside the open list jumps to the anchor. Leave the details open; closing it on
  navigation moves the page under the reader's finger.
* The `<details>` element gives keyboard and screen-reader behavior for free. Keep
  `aria-label="Changelog contents"` on the wrapping `<nav>`.

### Responsive

Use this treatment for everything `≤ 920px`. Above that, Screen 1.

---

## State management

Only one new piece of state, and only on the widescreen path:

```
activeReleaseId: string   // seeded to releases[0].id
```

Written by the `IntersectionObserver` callback, read by the rail to apply the current styling and
`aria-current`. Tear the observer down in the effect's cleanup. No data fetching: `releases.json` is
imported at build time and `ReleaseHistory.svelte` is generated from `releases/*.md` by
`tools/release/generate-releases.mjs` — neither changes.

## Design tokens

All existing, and all themed — `/changelog` no longer pins a palette, so read them from
`PageShell.svelte` and never restate a value:

| Token           | Used for                          |
| --------------- | --------------------------------- |
| `--page-ground` | ground behind the sheet           |
| `--page-sheet`  | sheet                             |
| `--page-ink`    | h1, h2, h3                        |
| `--page-body`   | lede, list copy                   |
| `--page-muted`  | dates, rule labels                |
| `--page-rule`   | hairlines, item borders           |
| `--page-link`   | version links, active rail border |
| `--brand-wash`  | active rail item background       |

From `web/src/tokens.css`: `--space-1..8` (4/8/12/16/20/24/32/40), `--radius-sm` 8px,
`--border-width` 1px, `--font-size-xs..xl` (12/14/16/18/22), `--font-size-display`
`clamp(34px, 3.2vw + 17px, 46px)`, `--font-weight-medium/semibold/bold` 500/600/700, `--font-family`
`'Quicksand Variable', 'Quicksand', …`, `--duration-fast` 0.15s, `--ease-glide`
`cubic-bezier(0.22, 1, 0.36, 1)`.

Two values in the mock are not on the scale and are deliberate: the rail's **232px** column width
(fits `Version 1.4.0` plus its date without wrapping at 14px Quicksand) and its **56px** grid gap.
The 13px date line is also off-scale; `--font-size-sm` (14px) is an acceptable substitute if you
would rather not add a value.

## Assets

None. The crayon strip is `CrayonStrip.svelte` reading `paletteHex()` from `web/src/lib/palette.ts`;
the mock reproduces those hexes only because it cannot import the module. The emoji in the release
headings (✨ 🚀 🛠) come from the generated `ReleaseHistory.svelte` and are untouched.

## Files

**In this bundle**

* `Changelog Contents Options.dc.html` — the prototype canvas. Open in a browser. Turn 2 (phone) is
  at the top, turn 1 (widescreen) below it. Approved options are `1a` and `2a`.
* `support.js` — runtime for the prototype. Required for it to render; not something to port.
* `1a-widescreen-sticky-rail.png`, `2a-phone-collapsed-contents.png` — the two approved states.

**In the repo, to change**

* `web/src/routes/changelog/+page.svelte` — the contents markup and all of its styling. This is
  where nearly all the work is.

**In the repo, to read but not change**

* `web/src/lib/components/page/PageShell.svelte` — sheet width, gutters, hero, the 920/540
  breakpoints, the `--page-*` defaults.
* `web/src/lib/components/page/RuleLabel.svelte` — the section-label treatment.
* `web/src/lib/components/page/ReleaseHistory.svelte` — generated; regenerating it must keep
  working.
* `web/src/lib/releases.json` — the six entries the contents is built from.
* `web/src/tokens.css` — generated from `web/src/lib/design/tokens.ts`. If a new token is genuinely
  needed, edit the `.ts` source and regenerate. A route may not pin a color of its own: no page opts
  out of night mode.

Repo: `KyleMit/Splotch`, branch `main`.
