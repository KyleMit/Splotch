// The pure rectangle geometry behind ADR-0069's dirty-rect undo snapshots:
// given the commands a commit is about to fold, which paper regions will that
// fold mutate. No canvas, no history state — just boxes.

import { AA_PAD_PX, opGeometricExtent } from './opGeometry';
import { getCrayonPasses } from './crayonBrush';
import type { StrokeGroupCommand, StrokeOp } from './strokeOps';

// A whole-pixel paper region (so blits are exact 1:1 copies, never resampled).
export interface PaperRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Padded float bounding boxes, merged toward disjointness before they round
// to patch rects.
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// An op's padded geometric bounds in paper space (pre-clamp floats). A path's
// quadratic control points bound the curve's hull, so start + segs' points
// padded by the stroke half-width cover the ink; a 'crayonPassRaster' stamps
// exactly its canvas at its paper position, so its bounds are the raster's
// rect; a 'crayonFlush' has no geometry of its own (its stamp is bounded by
// the pass's crayon ops, already unioned) — null. 'clear' is the callers'
// short-circuit, never passed here.
function opPaddedBounds(op: StrokeOp, crayonScale: number): Box | null {
  if (op.kind === 'clear' || op.kind === 'crayonFlush') return null;
  if (op.kind === 'crayonPassRaster') {
    return {
      x0: op.x - AA_PAD_PX,
      y0: op.y - AA_PAD_PX,
      x1: op.x + op.canvas.width + AA_PAD_PX,
      y1: op.y + op.canvas.height + AA_PAD_PX,
    };
  }
  // Magic and erase render at base width (renderOp routes them before the
  // crayon branch); only a crayon ink op picks up the pass scale.
  const scale = op.crayon && !op.erase && !op.magic ? crayonScale : 1;
  const { x0, y0, x1, y1, halfWidth } = opGeometricExtent(op);
  const pad = halfWidth * scale + AA_PAD_PX;
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

function mergeInto(target: Box, b: Box) {
  target.x0 = Math.min(target.x0, b.x0);
  target.y0 = Math.min(target.y0, b.y0);
  target.x1 = Math.max(target.x1, b.x1);
  target.y1 = Math.max(target.y1, b.y1);
}

function boxesIntersect(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

// More clusters than this and the capture degenerates to one union rect: the
// per-patch bookkeeping (copies, encodes, restore blits) stops paying for
// itself, and no real gesture produces more (five fingers → five clusters).
const PATCH_CLUSTER_CAP = 8;

// More RAW clusters than this and the capture skips the merge fixpoint
// entirely and takes the union up front: the scan is O(n³) worst case on the
// commit hot path, and only a magic-unready backlog folding under one commit
// can push the count this high — a fold that large unions to ~the whole paper
// after merging anyway, so nothing real is lost by not trying.
const MERGE_INPUT_CAP = PATCH_CLUSTER_CAP * 8;

function unionBoxes(boxes: Box[]): Box {
  const union = boxes[0];
  for (let i = 1; i < boxes.length; i++) mergeInto(union, boxes[i]);
  return union;
}

// The disjoint paper regions folding `commands` will mutate, clamped to the
// paper. Ops cluster per stroke (a path op's command index + pointer id;
// dots and pass rasters seed their own cluster) and intersecting clusters
// merge to a fixpoint, so a spread multi-finger gesture yields one band-sized
// rect per finger instead of a near-full-paper union — the union bbox is the
// worst case, never exceeded (ADR-0069's containment invariant holds per
// cluster: every op's padded bounds sit inside its cluster's rect). A 'clear'
// wipes everything, so it short-circuits to the full paper and reports
// `wipesPaper` — the fold's result never reads the pre-fold paper, which is
// what licenses pushCommand's swap capture. Rects are empty when nothing would
// touch the paper — no foldable commands, or ink wholly outside the paper
// square (margin ink is clipped at fold, ADR-0050).
export function foldRegionsForCommands(
  commands: StrokeGroupCommand[],
  paperW: number,
  paperH: number
): { rects: PaperRect[]; wipesPaper: boolean } {
  // Crayon density passes stroke at op.lineWidth × widthScale (dot radius ×
  // widthScale). The shipped passes never exceed 1, but the dev harness's
  // setCrayonParams accepts arbitrary passes — a widthScale > 1 experiment
  // would fold ink outside the base-width pad and undo would leave its fringe
  // behind. Scale crayon ink pads by the widest pass so the containment
  // invariant (ADR-0069) holds mid-experiment too.
  let crayonScale = 1;
  for (const p of getCrayonPasses()) crayonScale = Math.max(crayonScale, p.widthScale);
  const clusters = new Map<string, Box>();
  let solo = 0;
  for (let c = 0; c < commands.length; c++) {
    for (const op of commands[c].ops) {
      if (op.kind === 'clear') {
        return { rects: [{ x: 0, y: 0, w: paperW, h: paperH }], wipesPaper: true };
      }
      const box = opPaddedBounds(op, crayonScale);
      if (!box) continue;
      const key = op.kind === 'path' ? `${c}:${op.pid}` : `solo:${solo++}`;
      const cluster = clusters.get(key);
      if (cluster) mergeInto(cluster, box);
      else clusters.set(key, box);
    }
  }
  let boxes = [...clusters.values()];
  if (boxes.length > MERGE_INPUT_CAP) {
    boxes = [unionBoxes(boxes)];
  } else {
    // Merge intersecting clusters to a fixpoint, so the returned rects are
    // disjoint (a finger's start dot merges into its stroke; crossing fingers
    // merge with each other).
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < boxes.length && !merged; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (boxesIntersect(boxes[i], boxes[j])) {
            mergeInto(boxes[i], boxes[j]);
            boxes.splice(j, 1);
            merged = true;
            break;
          }
        }
      }
    }
    if (boxes.length > PATCH_CLUSTER_CAP) boxes = [unionBoxes(boxes)];
  }
  const rects: PaperRect[] = [];
  for (const b of boxes) {
    const x = Math.max(0, Math.floor(b.x0));
    const y = Math.max(0, Math.floor(b.y0));
    const w = Math.min(paperW, Math.ceil(b.x1)) - x;
    const h = Math.min(paperH, Math.ceil(b.y1)) - y;
    if (w > 0 && h > 0) rects.push({ x, y, w, h });
  }
  return { rects, wipesPaper: false };
}
