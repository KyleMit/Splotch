export const MIN_TEXT_ZOOM = 1;
export const MAX_TEXT_ZOOM = 3;

export function clampTextZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_TEXT_ZOOM;
  return Math.min(MAX_TEXT_ZOOM, Math.max(MIN_TEXT_ZOOM, zoom));
}

// Given the zoom in force when the second finger landed (`baseZoom`), the finger
// spread at that instant (`baseSpread`), and the current spread, return the new
// clamped zoom. Widening the fingers (spread grows) enlarges; pinching shrinks.
export function nextTextZoom(baseZoom: number, baseSpread: number, spread: number): number {
  if (baseSpread <= 0) return clampTextZoom(baseZoom);
  return clampTextZoom(baseZoom * (spread / baseSpread));
}
