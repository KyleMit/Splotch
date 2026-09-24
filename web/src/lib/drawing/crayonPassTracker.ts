// Where a crayon gesture's live polyline must start a new deposition pass.
//
// A single continuous gesture is NOT one pass forever: real wax doesn't care
// whether the crayon lifted before re-covering a spot. CrayonPassTracker
// watches the live polyline for the tip re-covering its own laid strip — a
// sharp reversal, or re-entering within a stroke width of paper it already
// painted — and the engine starts a new pass there by bumping to a fresh seed
// (see crayonBrush.ts) for the ops that follow.

import type { Point } from './strokeMath';

// Ported from the swept-passes experiment (PR 429), where these thresholds were
// tuned so toddler scribbles split where the crayon really re-covers its paper
// while ordinary corners and hand jitter never do. Split triggers, all relative
// to the stroke width so thick and thin crayons feel the same:
//  • direction is measured between anchors at least DIR_STEP apart, so pixel
//    jitter while holding still can neither split nor rotate the direction;
//  • a turn sharper than SPLIT_TURN_COS is a reversal — the tip is heading
//    back over wax it just laid, so the pass splits immediately;
//  • re-entry: the tip landing within PROXIMITY_FRACTION of the width of a
//    point laid at least EXCLUDE_ARC_FRACTION widths of arc ago means the path
//    looped or hairpinned back onto its own strip without a sharp corner.
//    The trailing arc is excluded because the tip is always near the strip it
//    just painted.
const SPLIT_TURN_COS = Math.cos((100 * Math.PI) / 180);
const DIR_STEP_FRACTION = 0.35;
const PROXIMITY_FRACTION = 0.45;
const EXCLUDE_ARC_FRACTION = 2.5;
const ANCHOR_SPACING_FRACTION = 0.25;

// At thin line widths these floors, not the fractions above, are what governs
// pass splitting: a sub-pixel direction step would let rasterized hand jitter
// rotate the measured direction, and a sub-pixel proximity or anchor spacing
// would put re-entry below the resolution the anchors are sampled at. The
// exclude-arc floor is counted in dir-steps rather than pixels because its job
// is to keep the trailing exclusion longer than the window direction is
// measured over, so the tip cannot re-enter on the strip it is still laying.
const MIN_DIR_STEP_PX = 3;
const MIN_PROXIMITY_PX = 2;
const MIN_ANCHOR_SPACING_PX = 2;
const MIN_EXCLUDE_ARC_DIR_STEPS = 3;

export type CrayonPoint = Point;

// Decides where a crayon gesture's polyline must start a new deposition pass
// (here: a fresh seed phase, so the new pass fills tooth the current one left
// bare). Pure geometry — one instance per pass, fed points in order; on
// 'split' the caller bumps the seed and re-seeds a tracker at the previous
// point. Anchor state resets per pass (a fresh tracker is constructed on
// split), so the re-entry scan is bounded by pass length, not stroke length —
// it grows unboundedly within one very long never-splitting pass (O(n^2)
// over that pass), which is cheap at today's anchor spacing and stroke
// lengths.
export class CrayonPassTracker {
  private readonly dirStep: number;
  private readonly proximity: number;
  private readonly excludeArc: number;
  private readonly anchorSpacing: number;

  private anchors: { x: number; y: number; arc: number }[] = [];
  private arc = 0;
  private lastX: number;
  private lastY: number;
  private dirX = 0;
  private dirY = 0;
  private hasDir = false;
  private dirOriginX: number;
  private dirOriginY: number;

  constructor(startX: number, startY: number, lineWidth: number) {
    this.dirStep = Math.max(MIN_DIR_STEP_PX, lineWidth * DIR_STEP_FRACTION);
    this.proximity = Math.max(MIN_PROXIMITY_PX, lineWidth * PROXIMITY_FRACTION);
    this.excludeArc = Math.max(
      this.dirStep * MIN_EXCLUDE_ARC_DIR_STEPS,
      lineWidth * EXCLUDE_ARC_FRACTION
    );
    this.anchorSpacing = Math.max(MIN_ANCHOR_SPACING_PX, lineWidth * ANCHOR_SPACING_FRACTION);
    this.lastX = startX;
    this.lastY = startY;
    this.dirOriginX = startX;
    this.dirOriginY = startY;
    this.anchors.push({ x: startX, y: startY, arc: 0 });
  }

  // Advance the tip to p. Returns 'split' when a new pass must start at the
  // PREVIOUS point (the caller re-seeds a tracker there for the new pass);
  // 'extend' otherwise, with p consumed.
  advance(p: CrayonPoint): 'extend' | 'split' {
    if (this.reversalAt(p) || this.reentryAt(p)) return 'split';
    this.consume(p);
    return 'extend';
  }

  private reversalAt(p: CrayonPoint): boolean {
    const dx = p.x - this.dirOriginX;
    const dy = p.y - this.dirOriginY;
    const len = Math.hypot(dx, dy);
    if (len < this.dirStep) return false;
    if (!this.hasDir) return false;
    const dot = (dx / len) * this.dirX + (dy / len) * this.dirY;
    return dot < SPLIT_TURN_COS;
  }

  private reentryAt(p: CrayonPoint): boolean {
    const stepArc = Math.hypot(p.x - this.lastX, p.y - this.lastY);
    const tipArc = this.arc + stepArc;
    for (const a of this.anchors) {
      if (tipArc - a.arc <= this.excludeArc) break;
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      if (dx * dx + dy * dy <= this.proximity * this.proximity) return true;
    }
    return false;
  }

  private consume(p: CrayonPoint) {
    this.arc += Math.hypot(p.x - this.lastX, p.y - this.lastY);
    this.lastX = p.x;
    this.lastY = p.y;

    const dx = p.x - this.dirOriginX;
    const dy = p.y - this.dirOriginY;
    const len = Math.hypot(dx, dy);
    if (len >= this.dirStep) {
      this.dirX = dx / len;
      this.dirY = dy / len;
      this.hasDir = true;
      this.dirOriginX = p.x;
      this.dirOriginY = p.y;
    }

    const lastAnchor = this.anchors[this.anchors.length - 1];
    const ax = p.x - lastAnchor.x;
    const ay = p.y - lastAnchor.y;
    if (ax * ax + ay * ay >= this.anchorSpacing * this.anchorSpacing) {
      this.anchors.push({ x: p.x, y: p.y, arc: this.arc });
    }
  }
}
