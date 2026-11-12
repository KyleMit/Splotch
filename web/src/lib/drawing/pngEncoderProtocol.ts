import type { CanvasContextRecoveryErrorCode } from './canvasContextRecovery';
import type { CrayonOptions } from './crayonBrush';
import type { CrayonDepositionMode } from './crayonPassBuffer';
import type { MagicSheetSnapshot } from './magicBrush';
import type { StrokeOp } from './strokeOps';

export interface TiledPngInput {
  sourceWidth: number;
  sourceHeight: number;
  sourceScale: number;
  exportScale: number;
  tiles: Array<{ bitmap: ImageBitmap; x: number; y: number }>;
  texture: ImageBitmap | null;
  overlay: ImageBitmap | null;
  paperColor: string;
  previewWidth?: number;
}

// A recorded op as it crosses to the replay worker: a Magic op names its colour sheet by index into
// the request's `sheets`, because the sheet's canvas cannot be cloned.
type WireOp<T> = T extends { magicSheet?: MagicSheetSnapshot }
  ? Omit<T, 'magicSheet'> & { sheet?: number }
  : T;
export type ReplayOp = WireOp<StrokeOp>;

interface ReplaySheet {
  bitmap: ImageBitmap;
  originX: number;
  originY: number;
  sourceUrl: string | null;
}

export interface ReplayCrayonConfig {
  options: CrayonOptions;
  deposition: CrayonDepositionMode;
}

// The export replays the retained stroke history at export scale in the replay worker, on CPU
// surfaces, so stroke edges keep their export-scale vectors without a full-page surface ever
// rastering on the page's GPU thread (ADR-0088).
export interface ReplayPngInput {
  width: number;
  height: number;
  replayScale: number;
  exportScale: number;
  paper: { width: number; height: number } | null;
  base: Array<{ bitmap: ImageBitmap; x: number; y: number }>;
  commands: ReplayOp[][];
  sheets: ReplaySheet[];
  crayon: ReplayCrayonConfig;
  texture: ImageBitmap | null;
  overlay: ImageBitmap | null;
  paperColor: string;
  preview: ReplayPreviewInput | null;
}

// The polaroid is painted from the settled live tiles at its own size before the replay starts, with
// the replay's own paper, texture and overlay.
interface ReplayPreviewInput {
  width: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceScale: number;
  tiles: Array<{ bitmap: ImageBitmap; x: number; y: number }>;
}

interface EncodeCanvasPngPayload {
  kind: 'canvas';
  bitmap: ImageBitmap;
}

interface EncodeTiledPngPayload extends TiledPngInput {
  kind: 'tiles';
}

interface EncodeReplayPngPayload extends ReplayPngInput {
  kind: 'replay';
}

export type EncodePngPayload = EncodeCanvasPngPayload | EncodeTiledPngPayload;
export type EncodePngRequest = EncodePngPayload & { id: number };
export type EncodeReplayPngRequest = EncodeReplayPngPayload & { id: number };
export type EncodePngResponse =
  | { id: number; blob: Blob }
  | { id: number; preview: ImageBitmap }
  | { id: number; error: string; code?: CanvasContextRecoveryErrorCode };

export function replayPngTransfer(input: ReplayPngInput): ImageBitmap[] {
  return [
    ...input.base.map((tile) => tile.bitmap),
    ...input.sheets.map((sheet) => sheet.bitmap),
    ...(input.texture ? [input.texture] : []),
    ...(input.overlay ? [input.overlay] : []),
    ...(input.preview?.tiles.map((tile) => tile.bitmap) ?? []),
  ];
}

export function closeReplayPngInput(input: ReplayPngInput) {
  for (const bitmap of replayPngTransfer(input)) bitmap.close();
}
