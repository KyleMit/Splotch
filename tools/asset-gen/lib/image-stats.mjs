// Shared percentile/median selection for pixel-value arrays (lumas, deltas,
// stroke widths, channel samples). Sorts a copy so callers can pass arrays
// they still need untouched. The index convention is floor(f * (n - 1)); at
// f=0.5 an even-length array therefore selects the lower of its two middle
// values rather than averaging them.
export function quantile(vals, f) {
  const sorted = [...vals].sort((a, b) => a - b);
  return sorted[Math.floor(f * (sorted.length - 1))];
}

export function median(vals) {
  return quantile(vals, 0.5);
}

// Rec.601 luma used by the hand-scored RGB pipeline. Keep the arithmetic order
// stable because thresholds and committed golden scores are calibrated to it.
export function luma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
