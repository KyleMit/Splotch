# ADR-0125: Canonical Icon viewBox with Baked Coordinates

**Status:** Active **Date:** 2026-08

## Context

The icon corpus in `web/src/lib/icons/` accumulated a dozen coordinate grids from its sources:
Material exports on `0 -960 960 960` and `0 0 24 24`, bespoke spot illustrations on `0 0 1254 1254`,
`-86.5 0 959 959`, `2 2 56 56`, and so on. That variety hid two classes of defect found in the
2026-08 alignment audit (the toolbar contact sheet in `docs/scratchpad/icon-toolbar-alignment/`):
icons whose artwork sat visibly off-center or off-keyline in its box, and non-obvious frames like
`viewBox="0 -53 1015 1015"` whose numbers carry no meaning a reviewer can check.

Two ways to standardize were considered:

* **Re-framed windows** — keep each file's coordinate data and shift/scale its `viewBox` until the
  content sits where it should. This is a one-line diff per icon, but the asset stays original
  artwork viewed through an offset window: the frame's fractional origin encodes the fix, every
  future measurement must reason about window-vs-content, and nothing stops the next import from
  adding a thirteenth grid.
* **Native rebasing** — bake the uniform scale + translate into the coordinate data itself and give
  every icon one canonical square frame. Costs a real transform tool (path commands, arcs,
  rotate-positioned elements, `<use>` stamps, user-space strokes), but each file becomes a
  self-evidently framed asset on one shared grid, and the grid is enforceable by a trivial test.

## Decision

Every `<Icon>` asset carries the canonical `viewBox="0 0 1000 1000"`, with alignment baked into the
coordinates. `tools/icons/rebase-icon-viewbox.mjs` (`npm run gen:icon-viewbox`) performs the rebase:
it folds the frame transform into path data (first-`m`-pair-is-absolute included), scales arc radii,
recomposes `rotate(a cx cy)`-positioned elements about their mapped centers, folds
`translate(…)scale(…)` transforms algebraically, offsets `<use>` stamps and `userSpaceOnUse`
gradient vectors, and scales user-space `stroke-width`/`stroke-dasharray` (screen-space
`non-scaling-stroke` excepted). A non-square source rect is centered in the square box — exactly
where `xMidYMid` letterboxing already painted it — so rendering is unchanged; the tool
pixel-verifies every write against the original at 512px and refuses to write past antialiasing
rounding.

`web/src/lib/icons/iconViewBox.test.ts` enforces the grid (and that no root `width`/`height`
overrides it), so a freshly imported Material icon fails the unit tier until rebased. The workflow
lives in the icon step of `.claude/rules/svelte.md` and `tools/icons/README.md`.

`splotchy.svg` is exempt: the mascot renders through a Vite URL import (`SplotchyIcon.svelte`) where
the file's own frame is the source of truth, not the icon-box keyline.

Two invariants worth knowing:

* The rebase is placement-preserving by definition — it re-expresses the same rendering on a new
  grid. Fixing an icon's alignment is a separate, deliberate act (adjust the frame first, then
  rebase), never something the tool does on its own.
* Icons rendered in square boxes are unaffected by squaring a non-square frame, and every `<Icon>`
  container in the app is square (or width-driven by the wide axis); a future non-square icon in a
  non-square container would change size under this rule and would need the audit repeated.

## Consequences

\+ One grid across 73 icons: any icon dropped into a square box scales identically, padding and
centroid keylines are directly comparable, and a frame like `0 0 1000 1000` is checkable at a
glance.

\+ The convention is enforced, not aspirational — a foreign-grid import fails `iconViewBox.test.ts`
with the repair command in the failure text.

\+ Every rebase is pixel-verified, so the canonicalization cannot silently change what ships.

− Imported icons need one extra step (`npm run gen:icon-viewbox && npm run optimize:svg-assets`)
before they pass CI.

− Rebased Material glyphs no longer diff cleanly against their upstream 960-grid sources; comparing
against a fresh Material export means rebasing the export first.

− The transform tool handles the SVG features this corpus uses, not all of SVG; an icon using an
unhandled construct (e.g. a rotate transform on a `<g>`) fails the rebase loudly and the tool must
be extended before that icon can land.
