// An astral character (most emoji) is a surrogate pair: two UTF-16 code units,
// high half first. A cut that keeps only the high half leaves a lone surrogate,
// which GitHub renders as `?` and a strict consumer may reject outright.
const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= HIGH_SURROGATE_MIN && codeUnit <= HIGH_SURROGATE_MAX;
}

/**
 * The longest prefix of `text` at most `maxCodeUnits` UTF-16 code units long
 * that does not end in the high half of a surrogate pair. The budget is
 * measured in code units, exactly as `String.prototype.slice` and `.length`
 * measure it, so a caller's existing length cap still holds; a cut that would
 * split a pair drops the whole character and comes back one unit short.
 */
export function truncateCodeUnits(text: string, maxCodeUnits: number): string {
  if (text.length <= maxCodeUnits) return text;
  if (maxCodeUnits <= 0) return '';
  const end = isHighSurrogate(text.charCodeAt(maxCodeUnits - 1)) ? maxCodeUnits - 1 : maxCodeUnits;
  return text.slice(0, end);
}
