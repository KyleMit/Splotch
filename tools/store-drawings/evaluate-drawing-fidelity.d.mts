export interface RgbaPlane {
  height: number;
  rgba: Uint8Array;
  width: number;
}

export interface SoftColorMetrics {
  iou: number;
  precision: number;
  recall: number;
}

export function softColorMetrics(reference: RgbaPlane, actual: RgbaPlane): SoftColorMetrics;
