// WHEN a crayon deposition pass ends, and what the next one is seeded with.
//
// Distinct from crayonPassBuffer.ts, which owns what a pass DOES with its ink.
// This module owns only the boundaries: the checkpoint that bounds a long
// stroke, the split when a gesture re-covers its own strip, the flush before a
// foreign op, and the monotonic seed each new pass takes.
//
// A factory rather than module state so a test gets a fresh counter, and so the
// engine's `renderTiledOp`/`recordCurrentOp` arrive as dependencies instead of
// this module reaching back into the facade.

import { CrayonPassTracker } from './crayonBrush';
import type { StrokeOp } from './strokeOps';

// Bound live crayon memory without making ordinary short strokes pay a
// checkpoint. Counted in POINTERMOVES, not in ops: ADR-0085 specifies one
// increment per recorded path op, which was the same thing when an op was
// exactly one pointermove. Rasterizing once per frame merges every move in a
// frame into a single op, so counting ops would stretch the pass to twice the
// wax before a checkpoint — ADR-0085 trial 23's failure, measured as
// physical-iPad crayon going from 1.57% to 2.11% of in-contact frame time lost.
export const CRAYON_CHECKPOINT_OPS = 64;

// The subset of a pointer's state a pass boundary reads and rewrites.
export interface CrayonPassCarrier {
  x: number;
  y: number;
  lineWidth: number;
  crayon: boolean;
  erase: boolean;
  seed: number;
  passTracker: CrayonPassTracker | null;
}

export interface CrayonPassBoundaryDeps {
  // Both halves of recording a flush: render it, and retain it in the command
  // kept for history and export. Separate on purpose — the engine sequences
  // them differently for other ops.
  renderOp: (op: StrokeOp) => void;
  recordOp: (op: StrokeOp) => void;
}

export function createCrayonPassBoundaries({ renderOp, recordOp }: CrayonPassBoundaryDeps) {
  // A per-pass seed stamped onto every crayon op, so the paper-tooth pattern is
  // phase-shifted per deposition pass (the source of wax buildup — ADR-0065).
  // Monotonic, so consecutive passes differ even when drawn over the same spot;
  // the value is stored on the op, so repaints reproduce the live pixels
  // regardless of where the counter has reached.
  let seedCounter = 1;
  let movesSinceFlush = 0;

  // Close the current pass: the tiles already hold the deposited pixels, so
  // this resets pass state and records the flush in the retained command.
  function recordFlush() {
    const flush: StrokeOp = { kind: 'crayonFlush' };
    renderOp(flush);
    recordOp(flush);
    movesSinceFlush = 0;
  }

  // Close the open pass and open the next one at `at`, on a fresh seed. The
  // three sites that need this — the move checkpoint, a scribble split, and a
  // resumed stroke — were the same three lines written out three times, and a
  // seed bumped without its tracker replaced silently keeps the old pass's
  // geometry.
  function rollToNextPass(ps: CrayonPassCarrier, at: { x: number; y: number }) {
    recordFlush();
    ps.seed = seedCounter++;
    ps.passTracker = new CrayonPassTracker(at.x, at.y, ps.lineWidth);
    return ps.passTracker;
  }

  return {
    /**
     * The seed and tracker a stroke opens its first pass with.
     *
     * `seeded` and `tracked` are separate on purpose, and the asymmetry is
     * load-bearing: every crayon-mode op carries a seed so a replay reproduces
     * its pattern phase, but only a stroke that actually deposits wax gets a
     * pass tracker — an eraser or magic stroke in crayon mode has no pass to
     * split. Collapsing them to one flag silently stops seeding those ops.
     */
    openStroke({
      seeded,
      tracked,
      at,
      lineWidth,
    }: {
      seeded: boolean;
      tracked: boolean;
      at: { x: number; y: number };
      lineWidth: number;
    }) {
      return {
        seed: seeded ? seedCounter++ : 0,
        passTracker: tracked ? new CrayonPassTracker(at.x, at.y, lineWidth) : null,
      };
    },

    recordFlush,
    rollToNextPass,

    /** Whether a pass is open — a flush is only owed when moves have landed. */
    hasOpenPass() {
      return movesSinceFlush > 0;
    },

    /**
     * Credit a frame's moves to the open pass, and checkpoint once the pass has
     * taken enough wax. Returns whether a checkpoint fired.
     */
    creditMoves(ps: CrayonPassCarrier, moveCount: number) {
      if (!ps.crayon || ps.erase) return false;
      movesSinceFlush += moveCount;
      if (movesSinceFlush < CRAYON_CHECKPOINT_OPS) return false;
      rollToNextPass(ps, ps);
      return true;
    },

    /**
     * A mid-gesture brush switch can interleave a non-crayon op into a group
     * whose crayon pass is open. Flush at that boundary so tile compositing
     * preserves the operation order; continued crayon ops open a fresh pass.
     */
    closeBeforeForeignOp(ps: CrayonPassCarrier) {
      if (!(ps.crayon && !ps.erase) && movesSinceFlush > 0) recordFlush();
    },

    /** Pass state is meaningless once the paper is cleared or replaced. */
    reset() {
      movesSinceFlush = 0;
    },
  };
}

export type CrayonPassBoundaries = ReturnType<typeof createCrayonPassBoundaries>;
