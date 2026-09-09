import { opPaddedUserBounds } from './opGeometry';
import type { StrokeGroupCommand } from './strokeOps';

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
