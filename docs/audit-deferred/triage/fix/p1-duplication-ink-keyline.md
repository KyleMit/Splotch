# White/dark ink keyline CSS is triplicated across ActionsPanel, BrushMenu, and StrokeWidthMenu

**Priority/category:** P1[duplication] · **Cluster:** C04 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/ActionsPanel.svelte:772-787`,
`web/src/lib/components/BrushMenu.svelte:155-170`,
`web/src/lib/components/StrokeWidthMenu.svelte:175-190` — pinned at SHA f934d43 **Draft patch:**
none

## Verdict

**FIX — clear winner.** Hoist the `.white-stroke`/`.dark-stroke` keyline rules to `web/src/app.css`
as global classes beside the `.flyout-menu` chrome that was already hoisted there since the pin,
using a union selector so StrokeWidthMenu's icon variant needs no asset edits. This is the design
skill's own documented pattern for exactly this situation ("hoist the shared *rules* to `app.css`
with a comment naming the consumers"), and the finding's alternative — tagging the icon SVGs — is
strictly more churn.

## Original finding (condensed)

The four-declaration keyline trick (`stroke` + `stroke-width: 2px` + `paint-order: stroke` +
`vector-effect: non-scaling-stroke`, in a `#000` white-ink flavor and a `--dark-ink-keyline`
dark-ink flavor) is pasted into three components, identical comments included. ActionsPanel and
BrushMenu target `svg path[fill='currentColor']`; StrokeWidthMenu widens to `svg path`. Changing the
width, tokenizing the `#000`, or adjusting the selector means editing three files that must not
drift. Proposed promoting the pair to global utility classes in `app.css`.

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md.

## Current state of the code

Still triplicated — six rules, 24 declarations. Verified at HEAD: `ActionsPanel.svelte:766-781`,
`BrushMenu.svelte:66-81`, `StrokeWidthMenu.svelte:87-102`, each with the same explanatory comment
pair. All three components toggle the classes declaratively (`class:white-stroke` /
`class:dark-stroke` at `BrushMenu.svelte:29-30`, `StrokeWidthMenu.svelte:36-37`,
`ActionsPanel.svelte:279-280,303-304`); no other file uses either class.

The drift since f934d43 makes the fix *more* natural, not less:

* The shared flyout shell was extracted to `app.css:242-335` (`.flyout-menu`/`.flyout-option`), and
  the design skill's global-class table registers it. The comment at `app.css:243-244` says each
  component keeps "only what genuinely differs — the eraser-mode sizing and the
  white-stroke/dark-stroke keylines". But the keylines *don't* differ: all six rules carry identical
  declarations; only StrokeWidthMenu's selector varies.
* That selector variance has a concrete cause: the `size-1..5` icons carry `fill="currentColor"` on
  the `<svg>` root, not the `<path>` (e.g. `web/src/lib/icons/size-3.svg`), so
  `path[fill='currentColor']` can't match them. The eraser-size icons use `<circle>` with
  `--paper`/`--hole-stroke` fills and are correctly untouched by either selector (and ActionsPanel
  drops the keyline flags while erasing anyway).
* `--dark-ink-keyline` is a real token (`web/src/tokens.css:110,153,197` — transparent in light
  mode), so the dark rule stays inert in light mode wherever it lives.

Conventions check: `.claude/rules/svelte.md` says "No global CSS except genuine cross-component
tokens", but the design skill (SKILL.md, "Shared *global* patterns" table and the paragraph below
it) explicitly carves out app.css classes for "chrome that several components share verbatim but
that hasn't earned a primitive yet" — and these exact components are its named example consumers.
The finding's approach fits the repo's conventions precisely.

## Options considered

1. **Hoist to `app.css` with a union selector (winner).** One rule pair covers all three components;
   the icon variance is absorbed by adding `svg[fill='currentColor'] path` as a second branch.
   Verified safe at HEAD: no other icon rendered inside these controls (`pen`, `crayon`,
   `magic-brush`, `eraser`, `line-weight`, `line-weight-eraser`, `eraser-size-*`) puts
   `fill="currentColor"` on the svg root, so the branch matches exactly the `size-*` icons and
   nothing else. Zero asset churn.
2. **Hoist plus retag `size-1..5.svg`** (the finding's suggestion) so one
   `path[fill='currentColor']` selector suffices. Works, but edits five assets and requires a
   `gen:icons` pass, for the same rendered result; the union selector's second branch with a
   one-line comment is cheaper and self-explanatory.
3. **Leave in place.** Rejected: the app.css comment already mislabels the keylines as "genuinely
   differs", which is exactly the drift-inviting state the finding warns about.

## Recommendation

In `app.css`, directly after the `.flyout-option` rules:

```css
/* Ink keylines shared by ActionsPanel's trigger buttons, BrushMenu, and
   StrokeWidthMenu: ring currentColor icon parts so white ink reads on the white
   cards (#000 is a deliberate one-off — black reads against every pen color and
   both papers) and near-black ink reads on dark cards (--dark-ink-keyline is
   transparent in light mode, so the dark rule is inert there). paint-order
   draws the stroke behind the fill; non-scaling-stroke pins it to 2 screen px
   across very different viewBoxes. The second selector branch catches the
   size-N icons, which carry fill="currentColor" on the svg root, not the path. */
.white-stroke :is(svg path[fill='currentColor'], svg[fill='currentColor'] path) {
  stroke: #000;
  stroke-width: 2px;
  paint-order: stroke;
  vector-effect: non-scaling-stroke;
}

.dark-stroke :is(svg path[fill='currentColor'], svg[fill='currentColor'] path) {
  stroke: var(--dark-ink-keyline);
  stroke-width: 2px;
  paint-order: stroke;
  vector-effect: non-scaling-stroke;
}
```

Then delete the six component rules (and their now-redundant `:global()` wrappers and comment
copies), fix the two stale comments — `app.css:243-244` ("what differs" is now only the eraser-mode
sizing) and `ActionsPanel.svelte:763-764` ("the matching keyline rules … live in
BrushMenu/StrokeWidthMenu") — and register `.white-stroke`/`.dark-stroke` in the design skill's
global-class table, edited at its source `.ruler/skills/design/SKILL.md` followed by
`npm run ruler:apply`.

Verification per the finding still applies: `grep -rn "paint-order" web/src` collapses to the two
app.css rules; in `run-splotch`, check white ink and (dark theme) near-black ink on the brush
trigger, open brush menu, stroke trigger, and open stroke menu — including that the stroke menu's
size lines keep their keyline (that's the union-selector branch working).

## Suggested next step

Re-stage in docs/AUDIT.md (or file as a `type:audit` issue) with the updated line references and the
union-selector approach above — it is a small, self-contained CSS move with a screenshot checklist,
well suited to a single PR (use the `pr-screenshots` before/after table).
