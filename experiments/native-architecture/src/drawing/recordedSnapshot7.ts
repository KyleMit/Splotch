import type { Command7, Op7, Style7 } from './recordedTypes7';

export type RecorderSnapshot7 = Readonly<{ styles: readonly Style7[]; ops: readonly Op7[] }>;

export function freezeOp7(op: Op7): Op7 {
  if (op.kind === 'dot' || op.kind === 'crayonDot') Object.freeze(op.at);
  if (op.kind === 'path' || op.kind === 'crayonPath') {
    Object.freeze(op.start);
    for (const segment of op.segments) Object.freeze(segment);
    Object.freeze(op.segments);
  }
  return Object.freeze(op);
}

export function freezeCommand7(command: Command7): Command7 {
  for (const style of command.styles) Object.freeze(style);
  for (const input of command.moves) {
    if (input.kind !== 'drain') {
      for (const point of input.samples) Object.freeze(point);
      Object.freeze(input.samples);
    }
    Object.freeze(input);
  }
  for (const op of command.ops) freezeOp7(op);
  Object.freeze(command.styles);
  Object.freeze(command.moves);
  Object.freeze(command.ops);
  return Object.freeze(command);
}
