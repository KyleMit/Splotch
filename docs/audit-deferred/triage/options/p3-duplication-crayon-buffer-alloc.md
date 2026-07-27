# Crayon-buffer allocate-or-resize logic is written three times

**Priority/category:** P3[duplication] · **Cluster:** C01 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/drawing/strokeOps.ts:229-252, 299-322`;
`web/src/lib/drawing/engine.ts:428-437` — pinned at SHA f934d43 **Draft patch:** none

## Verdict

**OPTIONS — real tradeoffs.** Lean: extract only the allocation helper (`newRoundCanvasCtx`); leave
the three resize policies inline, because they differ deliberately and the difference is
load-bearing.

## Original finding (condensed)

The pattern "create a canvas at WxH with `lineCap/lineJoin = 'round'`; on later calls reassign
width/height, re-arm caps, reset `dirty`/`bounds`" appears in `livePaperBufferFor` and
`crayonBufferFor`, with the cap-arming half repeated again in the engine's overlay resize loop.
Proposed `ensureBufferSize(buf, w, h)` plus a `newRoundCanvasCtx(w, h)` allocation helper also
covering `undoHistory.ensurePaperCovers`, `adoptPaperAsSnapshot`, and `engine.snapshotStrokes`.

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md — the burndown likely lacked a verifier for this
finding, so there is no implementation attempt or reviewer objection on file.

## Current state of the code

All sites survive at HEAD, at shifted lines — but "written three times" overstates how identical
they are. The three resize sites use **three different policies**, each deliberate:

* `livePaperBufferFor` (`strokeOps.ts:239-262`): **grow-only** (`<` comparison) — shrinking the
  paper-space accumulation would drop off-viewport ink.
* `crayonBufferFor` (`strokeOps.ts:309-332`): **exact-match** (`!==`) — the buffer must share the
  target's backing dimensions so the flush's blits are 1:1 device-space rect copies.
* Engine overlay resize loop (`engine.ts:432-441`): **unconditional** — resizing the visible canvas
  already wiped everything; the overlays follow it. No `dirty`/`bounds` to reset here (the overlays
  are raw canvases; the `CrayonPassBuffer` wrapping them is reset via the replay path).

Only the 4-line body (assign w/h, re-arm caps) is genuinely shared. The **allocation** pattern, by
contrast, is verbatim in ~6 places: `livePaperBufferFor`, `crayonBufferFor`, `ensurePaperCovers`
(fresh + grow paths, `undoHistory.ts:160-186`), `adoptPaperAsSnapshot` (`undoHistory.ts:435-457`),
and `snapshotStrokes` (`engine.ts:1448-1461`).

## Options considered

1. **Allocation helper only** (lean): `newRoundCanvasCtx(w, h): CanvasRenderingContext2D | null` in
   `strokeOps.ts` (already imported by both `undoHistory.ts` and `engine.ts` — no cycle), replacing
   the ~6 verbatim create-canvas-set-caps blocks. Pros: real dedup of the identical part; nullable
   return matches every site's existing null handling (`snapshotStrokes` keeps its `!`). Cons: small
   win; a few call sites get one line wordier.
2. **Also extract `ensureBufferSize(buf, w, h)`**: would need a grow-only vs exact-match policy flag
   for its two call sites, hiding the `<` vs `!==` distinction that is the correctness- relevant
   content of those branches — and the engine loop still can't use it (no `CrayonPassBuffer`,
   existing elements). A parameterized two-caller helper that obscures a deliberate difference is a
   net readability loss. Rejected.
3. **Drop entirely**: defensible — each site's comment explains its policy, and the duplication is
   ~4-6 lines per site. But the allocation blocks carry no policy content at all, so Option 1's
   dedup is pure win at near-zero risk.

## Recommendation

Option 1. Sketch:

```ts
export function newRoundCanvasCtx(w: number, h: number): CanvasRenderingContext2D | null {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  return g;
}
```

Do **not** unify the resize predicates; if anything, the grow-only vs exact-match contrast deserves
its existing inline visibility. The overlay resize loop stays as-is (finding 4's struct tidies its
iteration instead).

Verification: `npm run test -- strokeOps undoHistory crayonBrush`, the resize/rotation E2E, and
`npm run check`.

## Suggested next step

Re-stage in `docs/AUDIT.md` scoped down to the `newRoundCanvasCtx` extraction; implement together
with the C01 glaze-stamp fix (same strokeOps touch, one PR).
