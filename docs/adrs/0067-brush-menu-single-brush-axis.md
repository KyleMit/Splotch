# ADR-0067: Brush Types as One Selectable Axis with Adaptive Controls

**Status:** Active — amends ADR-0043 (magic brush selection) and ADR-0065 (crayon as the only
free-draw mode). **Date:** 2026-07

## Context

The crayon brush (ADR-0065) shipped as the pen's *only* rendering mode: `DrawingCanvas.svelte`
hardcoded `setCrayonMode(!eraser && !magic)`, so every free-draw stroke was wax. The original solid
pen — flat ink, no texture, no color mixing — was still physically present as `renderOp()`'s
non-crayon fallback in `strokeOps.ts` (the eraser and the `colorMix: 0` escape hatch use it), but no
UI could reach it.

Meanwhile the tool model was two mutually-exclusive boolean modifiers (`toolState.eraser`,
`toolState.magic`) layered "on top of the pen", each with its own top-level Actions Panel button.
Bringing the pen back as a sibling of the crayon would have needed a third axis crossed against
those modifiers, and a fourth top-level button in a row that already strains small landscape screens
(`MAX_ACTION_BUTTON_COUNT` capped button size by count).

Snapshot undo (ADR-0066) matters here: brushes no longer owe replay determinism, so the pen needs no
seeds, no flush markers, and no dedicated op fields — an op without the `crayon` flag simply takes
the solid-fill branch that never left.

## Decision

**One brush axis.** `toolState` is a single `brush: 'pen' | 'crayon' | 'magic' | 'eraser'` — the
eraser and magic brush are peer brush types, not modifiers. The engine bridges stay independent
booleans (`setEraserMode`, `setMagicMode`, `setCrayonMode`), each derived from the one axis in
`DrawingCanvas.svelte`.

**One adaptive Brush control.** Pen remains the always-available baseline; Crayon, Magic Brush, and
Eraser each have an independent persisted availability setting. The Actions Panel presents the
smallest useful control for the enabled optional set:

* none — no Brush control;
* one — that tool's icon is a direct button that toggles between the tool and Pen;
* two or three — the Brush Button opens the flyout, which contains Pen followed by only the enabled
  optional tools in the established order.

The old top-level Eraser and Magic Brush buttons remain gone, keeping the worst-case row at six
buttons. The flyout reuses the Stroke Width flyout's shared `.flyout-wrapper` / `.flyout-menu` /
`.flyout-option` classes and one open-flyout slot. Menu selection stays idempotent (issue #276); the
single-tool direct button is deliberately a toggle because its only two states are that tool and
Pen. Disabling the active optional tool immediately resumes and persists the remembered ink brush,
so hidden tools can never remain active. Disabling Crayon also resets that remembered brush to Pen,
preventing a later color pick from reviving a hidden Crayon indirectly.

**Pen is the default; the choice persists — except the eraser.** The brush is stored under
`splotch-brush-type` (read through the durable-storage layer like every setting). Selecting the
eraser never overwrites the stored choice and a stored `eraser` is never restored: a fresh launch
always opens on a blank page, and waking up holding an eraser would strand the child with a tool
that does nothing — the same reasoning as `resetToolAfterClear()`. That reset (and a color pick
while erasing or in magic) now lands on the *last ink brush* (pen or crayon), not always the pen.

**Pen and crayon share the color and width state.** Both are "ink brushes" drawing
`colors.activeColor` at the shared pen stroke-width level (`splotch-stroke-width-size`); the eraser
keeps its independent level.

**First paint.** The Brush Button's face can't swap its `{@html}` icon on client-only state
(hydration caveat in `.claude/rules/svelte.md`), so all four icons are in the DOM and CSS shows the
one matching `data-brush` or `data-single-brush` — on `<html>` for the app.html pre-paint seed, then
on the panel after its hydration marker appears (ADR-0040). The three `data-off-*` availability
attributes hide disabled entries and, when all three are present, the Brush control itself.

## Alternatives considered

* **Crossed axes** (ink brush × eraser/magic modifiers) — preserves the old model but doubles the
  state space for no UI: the menu presents four flat choices, so the state should be four flat
  values.
* **Keep eraser/magic as top-level buttons, menu only for pen/crayon** — leaves the row at 7+
  buttons and splits "what am I drawing with" across two places; the single menu makes the active
  tool one glanceable icon.
* **Persist the eraser too** — rejected for the stranded-toddler launch case above.

## Consequences

* The pen is recovered with zero new rendering code — `renderOp()`'s fallback branch *is* the pen;
  the work was state, UI, and persistence.
* E2E specs and perf scripts that clicked `#eraserButton` / `#magicBrushButton` directly must open
  the Brush Menu first (`pickBrush` helper in `flows-harness.ts`); the entry ids are preserved.
* A future optional brush type needs one `BRUSH_OPTIONS` entry (icon + id + label), an availability
  setting, its engine mode, and matching first-paint handling in `web/src/app.html`. Layout still
  counts the adaptive control as at most one button.

## Amendment (2026-08): configurable optional brushes

Issue #881 added the per-tool availability settings and adaptive zero/one/many presentation above.
It does not change the four-way brush axis: availability and presentation wrap that axis rather than
introducing crossed tool state.
