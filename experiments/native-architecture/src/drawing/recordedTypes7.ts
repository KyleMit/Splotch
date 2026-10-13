import type { DrawingPaper } from './paperSpace';
import type { PaintColor } from './palette';
import type { PageId } from './pages';
import type { STROKE_WIDTH_PX, StrokeWidth } from './strokeWidth';

export type Point7 = Readonly<{ x: number; y: number }>;
export type InkWidth7 = (typeof STROKE_WIDTH_PX)['pen'][StrokeWidth];
export type EraserWidth7 = (typeof STROKE_WIDTH_PX)['eraser'][StrokeWidth];
export type Style7 =
  | Readonly<{ brush: 'pen'; color: PaintColor; width: InkWidth7 }>
  | Readonly<{ brush: 'crayon'; color: PaintColor; width: InkWidth7 }>
  | Readonly<{ brush: 'magic'; rainbow: number; width: InkWidth7 }>
  | Readonly<{ brush: 'eraser'; width: EraserWidth7 }>;
export type Segment7 = Readonly<{ cx: number; cy: number; x: number; y: number }>;
export type Input7 =
  | Readonly<{ kind: 'start' | 'move' | 'end'; contact: number; samples: readonly Point7[] }>
  | Readonly<{ kind: 'drain' }>;
export type Op7 =
  | Readonly<{ kind: 'dot'; contact: number; at: Point7 }>
  | Readonly<{ kind: 'path'; contact: number; start: Point7; segments: readonly Segment7[] }>
  | Readonly<{ kind: 'crayonDot'; contact: number; seed: number; at: Point7 }>
  | Readonly<{
      kind: 'crayonPath';
      contact: number;
      seed: number;
      start: Point7;
      segments: readonly Segment7[];
    }>
  | Readonly<{ kind: 'crayonFlush' }>;
export type Granularity7 = 'per-move' | 'per-frame';
export type Command7 = Readonly<{
  firstSeed: number;
  granularity: Granularity7;
  styles: readonly Style7[];
  moves: readonly Input7[];
  ops: readonly Op7[];
}>;
export type Drawing7 = Readonly<{
  version: 7;
  paper: DrawingPaper;
  pageId: PageId;
  rainbow: number;
  seedCursor: number;
  commands: readonly Command7[];
}>;
export const MAX_CONTACTS_7 = 1000;
export const MAX_GEOMETRY_7 = 100_000;
export const MAX_RETAINED_OPS_7 = MAX_GEOMETRY_7 * 2;
export const MAX_SAVED_BYTES_7 = 8 * 1024 * 1024;
export const CHECKPOINT_MOVES_7 = 64;
export const MERGED_MOVES_7 = 8;
