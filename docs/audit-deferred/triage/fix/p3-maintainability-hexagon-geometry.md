# Hexagon geometry constants are scattered and coupled to a JS comment

**Priority/category:** P3[maintainability] · **Cluster:** C10 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/ColorPicker.svelte:372-377` (CSS) and `:53-58` (JS
comment) — pinned at SHA f934d43 **Draft patch:** none

## Verdict

**FIX — clear winner.** The finding's headline hazard — resizing the hexagon in CSS with no failing
check — was already closed by the trim-geometry work that landed after the pin. What remains is one
narrow residue: `HEX_SNAP_RADIUS = 40` is still an independent literal whose derivation lives only
in prose. Derive it from the already-test-pinned `HEX_GRID_GEOMETRY` module.

## Original finding (condensed)

The hexagon is `width: 60px; height: 69px; /* height = width * 1.15 */`, and the snap logic's
comment asserts "a hexagon's farthest edge point is ~35px from its center" to justify
`HEX_SNAP_RADIUS = 40`. The JS numbers depend on the CSS numbers, but the coupling is only prose —
resizing the hexagon in CSS silently makes the snap radius wrong with no failing check. Proposed CSS
custom properties (`--hex-w`/`--hex-h`) plus deriving the snap radius from them.

## Why it was deferred

Implementation failed (no further detail recorded). Plausibly the attempt took the original
proposal's heavier path — CSS custom properties read back from JS — which has SSR/prerender and
runtime-read complications and is now redundant anyway (see below).

## Current state of the code

Substantially resolved by drift since f934d43 (commits 7381a6c, 4288672, dae9fcb):

* `web/src/lib/design/trimGeometry.ts:139-146` — `HEX_GRID_GEOMETRY` centralizes the honeycomb
  geometry: `firstRowPx: 69` *is* the hexagon height and `columnPitchPx: 60` *is* its width.
* `web/src/lib/design/trimGeometry.test.ts:189-190` — the test parses the `.hexagon` block's
  `width`/`height` back out of `ColorPicker.svelte`'s `<style>` and asserts they equal the module's
  values. Bumping `width: 60px` in CSS now fails a unit test — the exact "no failing check" gap the
  finding described is gone.

The residue: `web/src/lib/components/ColorPicker.svelte:56-64` still hard-codes
`const HEX_SNAP_RADIUS = 40` beneath the "~35px from its center" prose (the farthest point of a
60×69 hexagon is its top/bottom vertex, height/2 = 34.5px; 40 = that plus ~5.5px of gap slop). A
future resize would fail `trimGeometry.test.ts` and force an update of `HEX_GRID_GEOMETRY`, but
nothing points the fixer at the snap radius two screens up — it would stay 40 silently.

## Options considered

1. **Derive `HEX_SNAP_RADIUS` from `HEX_GRID_GEOMETRY` (winner).** Zero runtime cost, one source of
   truth, and it rides the test-pinning machinery the repo already built for exactly this geometry.
   Beats the runner-up because the constant stays static and inspectable.
2. **Measure at runtime in `snapshotHexCenters`** (radius = measured `rect.height / 2` + slop).
   Self-adjusting even for per-breakpoint size changes — but the hexagon size never varies at
   runtime today, so this adds a dynamic value and a subtle drag-time dependency for no observed
   need.
3. **CSS custom properties read via `getComputedStyle`** (the original proposal). Runtime read,
   SSR/prerender awkwardness, and now redundant: the test pinning already provides the failing check
   the custom properties were meant to enable.

## Recommendation

Import the module constant and make the derivation executable, keeping the value exactly 40:

```ts
import { HEX_GRID_GEOMETRY } from '$lib/design/trimGeometry';

// Farthest hexagon point from its center is the top/bottom vertex, half the
// height; the slop covers the clip-path gaps between hexagons.
const HEX_GAP_SLOP_PX = 5.5;
const HEX_SNAP_RADIUS = HEX_GRID_GEOMETRY.firstRowPx / 2 + HEX_GAP_SLOP_PX;
```

Trim the "~35px" prose to reference the derivation instead of restating the number. Do not resurrect
the `--hex-w`/`--hex-h` custom-property half of the original proposal — `trimGeometry.test.ts`
already guards the CSS side, and the module is the established home for these numbers.

Verification: the constant still evaluates to 40 (behavior unchanged), the picker gap-drag E2E still
passes, and `trimGeometry.test.ts` needs no changes.

## Suggested next step

Re-stage in `docs/AUDIT.md` narrowed to the snap-radius derivation above (the rest of the original
finding is already done).
