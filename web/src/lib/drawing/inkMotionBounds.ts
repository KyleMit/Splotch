import { AA_PAD_PX, opGeometricExtent, opPaddedUserBounds, paintOpShape } from './opGeometry';
import { isCrayonInkOp, type StrokeGroupCommand } from './strokeOps';

// Crayon ink is re-rasterized through the pass buffer on every replay, and
// magic ink paints nothing until its sheet has decoded, so both read their
// ghost from the live tiles. Plain pen ink replays in a couple of milliseconds
// and its replay is exact, so it keeps the cheaper path.
export function strokeGhostReadsTiles(command: StrokeGroupCommand) {
  return command.ops.some((op) => isCrayonInkOp(op) || ('magic' in op && op.magic === true));
}

// Lay down the command's ink footprint — every dot and path op at its padded
// width, in one opaque colour — so a `source-in` copy of the live tiles keeps
// only the pixels the command deposited. The pad is the same AA bleed the
// renderer's dirty rects carry, so the mask covers each op's antialiased edge.
export function paintStrokeFootprint(
  target: CanvasRenderingContext2D,
  command: StrokeGroupCommand
) {
  target.lineCap = 'round';
  target.lineJoin = 'round';
  for (const op of command.ops) {
    if ((op.kind !== 'dot' && op.kind !== 'path') || op.erase) continue;
    const { halfWidth } = opGeometricExtent(op);
    paintOpShape(target, op, '#000', halfWidth > 0 ? 1 + AA_PAD_PX / halfWidth : 1);
  }
}

export function strokeMotionBounds(command: StrokeGroupCommand, width: number, height: number) {
  if (
    command.magicRecode ||
    command.ops.some((op) => op.kind === 'clear' || ('erase' in op && op.erase))
  )
    return null;
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  for (const op of command.ops) {
    if (op.kind !== 'dot' && op.kind !== 'path') continue;
    const { x0, y0, x1, y1, pad } = opPaddedUserBounds(op);
    left = Math.min(left, x0 - pad);
    top = Math.min(top, y0 - pad);
    right = Math.max(right, x1 + pad);
    bottom = Math.max(bottom, y1 + pad);
  }
  left = Math.max(0, Math.floor(left));
  top = Math.max(0, Math.floor(top));
  right = Math.min(width, Math.ceil(right));
  bottom = Math.min(height, Math.ceil(bottom));
  return right > left && bottom > top
    ? { left, top, width: right - left, height: bottom - top }
    : null;
}
