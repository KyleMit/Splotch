// Compute a selection-ring color for a swatch: ~10% darker than the swatch so
// the ring reads as a contrasting outline — but for very dark swatches (e.g.
// black) darkening is invisible, so we lighten instead. Pure function, kept out
// of the .svelte component so it can be unit-tested directly.
export function getRingColor(color) {
  let hex = color.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const shift = luminance < 0.2
    ? (v) => Math.min(255, Math.round(v + 38))
    : (v) => Math.max(0, Math.round(v * 0.9));

  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(shift(r))}${toHex(shift(g))}${toHex(shift(b))}`;
}
