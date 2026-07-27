# Group the four crayon-overlay module variables into one nullable struct

**Priority/category:** P4[maintainability] · **Cluster:** C01 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/drawing/engine.ts:141-145, 1194-1201, 428-437` — pinned at SHA
f934d43 **Draft patch:** none

## Verdict

**FIX — clear winner.** Fold the five variables into one nullable struct with non-null members — but
only as a rider on other C01 engine work; it does not justify a standalone PR.

## Original finding (condensed)

Five module-level variables (`crayonOverlay`, `crayonOverlayCtx`, `crayonOverlayTop`,
`crayonOverlayTopCtx`, `crayonOverlaysCreated`) represent one thing — the overlay pair — and are
always created together, resized together, and nulled together. Spread across the module they are
easy to update partially; a struct makes set/resize/teardown atomic.

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md — the burndown likely lacked a verifier for this
finding, so there is no implementation attempt or reviewer objection on file.

## Current state of the code

Still exactly as described, at shifted lines: declarations `engine.ts:145-149`, mix sync `151-155`,
resize loop `432-441`, teardown nulling `1187-1197`, creation/adoption in `setupCrayonOverlays`
`1229-1260`. Post-ADR-0072 the lifecycle got *more* paths (adopt from markup vs engine-create,
remount adoption), which is where partial-update bugs would come from. The touch-point count is
small (four sites, one file), so the risk today is low — this is a genuine P4 — but the fix is
mechanical, fully type-checked, and touches zero rendering math.

## Options considered

FIX verdict — the only real design choice is struct shape. Winner: non-null members inside one
nullable value, because it converts four independent `| null` types plus a boolean into a single
narrowing point:

* `syncCrayonOverlayMix` and the resize loop go from per-variable null guards
  (`if (!el || !g) continue`) to one `if (!crayonOverlays) return`.
* Teardown's four-line nulling becomes `crayonOverlays = null`, and the engine-created removal reads
  `if (crayonOverlays?.engineCreated) { ... }` — impossible to null one member and forget another.

The alternative (a struct of nullable members) preserves today's types and gains nothing; rejected.

## Recommendation

```ts
interface CrayonOverlays {
  bottom: HTMLCanvasElement;
  bottomCtx: CanvasRenderingContext2D;
  top: HTMLCanvasElement;
  topCtx: CanvasRenderingContext2D;
  engineCreated: boolean;
}
let crayonOverlays: CrayonOverlays | null = null;
```

`setupCrayonOverlays` builds the whole value once (both branches already produce all five pieces
before any is used); `resizeCanvas` iterates `[bottomCtx, topCtx]`; teardown removes-if-created then
assigns null. Coherence with the rest of C01: this change and the overlay-CSS fix (finding 3) edit
the same `setupCrayonOverlays` function and should land in one commit; neither interacts with the
strokeOps-side glaze/buffer extractions beyond sharing the PR.

Verification: `npm run check` (the compiler finds every touch point), plus the same manual pass as
finding 3 — crayon draw/resize/teardown-remount on `/` and `/dev/engine` behave identically.

## Suggested next step

Re-stage in `docs/AUDIT.md` bundled with the C01 overlay-CSS finding; implement both in the single
C01 cleanup PR, never as its own change.
