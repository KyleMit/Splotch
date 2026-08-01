export interface TiledPngInput {
  sourceWidth: number;
  sourceHeight: number;
  sourceScale: number;
  exportScale: number;
  tiles: Array<{ bitmap: ImageBitmap; x: number; y: number }>;
  texture: ImageBitmap | null;
  overlay: ImageBitmap | null;
  paperColor: string;
}

interface EncodeCanvasPngPayload {
  kind: 'canvas';
  bitmap: ImageBitmap;
}

interface EncodeTiledPngPayload extends TiledPngInput {
  kind: 'tiles';
}

export type EncodePngPayload = EncodeCanvasPngPayload | EncodeTiledPngPayload;
export type EncodePngRequest = EncodePngPayload & { id: number };
export type EncodePngResponse = { id: number; blob: Blob } | { id: number; error: string };
