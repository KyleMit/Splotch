// Shared percentile/median selection for pixel-value arrays (lumas, deltas,
// stroke widths, channel samples). Sorts a copy so callers can pass arrays
// they still need untouched.
export function quantile(vals, f) {
  const sorted = [...vals].sort((a, b) => a - b);
  return sorted[Math.floor(f * (sorted.length - 1))];
}

export function median(vals) {
  return quantile(vals, 0.5);
}
