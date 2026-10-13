// The shipping Slider.svelte's value rules: a relative drag that moves the value by the distance
// travelled, a magnetic detent while dragging, and the APG slider keys.
// rsd-native-slider.test.mjs reads these constants against the Svelte source.

// Half-width of the snap band, in value units: ~4.5% of the track, so the detent feels the same
// size on any range (0–100 volume or 70–130 size).
export const SNAP_BAND_FRACTION = 0.045;
export const KEY_STEP = 1;
export const PAGE_STEP = 10;

export type SliderRange = { readonly min: number; readonly max: number };

export function clampToRange(value: number, { min, max }: SliderRange) {
  return Math.round(Math.min(max, Math.max(min, value)));
}

// `|| 1` so a degenerate range (min === max) yields 0% instead of NaN.
export function rangePercent(value: number, { min, max }: SliderRange) {
  return ((value - min) / (max - min || 1)) * 100;
}

// The unclamped value a drag of `distance` across a track `width` wide reaches from `start`. The
// detent applies only here: keyboard stepping must never stick at the snap point.
export function draggedValue(
  start: number,
  distance: number,
  width: number,
  range: SliderRange,
  snap: number | undefined
) {
  const span = range.max - range.min;
  const next = start + (distance / (width || 1)) * span;
  return snap !== undefined && Math.abs(next - snap) <= span * SNAP_BAND_FRACTION ? snap : next;
}

// The unclamped value a slider key reaches, or null for a key the slider does not handle.
export function keyedValue(key: string, value: number, { min, max }: SliderRange) {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return value - KEY_STEP;
    case 'ArrowRight':
    case 'ArrowUp':
      return value + KEY_STEP;
    case 'PageDown':
      return value - PAGE_STEP;
    case 'PageUp':
      return value + PAGE_STEP;
    case 'Home':
      return min;
    case 'End':
      return max;
    default:
      return null;
  }
}
