export function softColorMetrics(reference, actual) {
  if (reference.width !== actual.width || reference.height !== actual.height) {
    throw new Error('Compared images have different dimensions');
  }
  let intersection = 0;
  let union = 0;
  let referenceMass = 0;
  let actualMass = 0;
  for (let index = 0; index < reference.rgba.length; index += 4) {
    const expectedAlpha = reference.rgba[index + 3] / 255;
    const observedAlpha = actual.rgba[index + 3] / 255;
    const overlap = Math.min(expectedAlpha, observedAlpha);
    const largestChannelDifference = Math.max(
      Math.abs(reference.rgba[index] - actual.rgba[index]),
      Math.abs(reference.rgba[index + 1] - actual.rgba[index + 1]),
      Math.abs(reference.rgba[index + 2] - actual.rgba[index + 2])
    );
    const colorSimilarity = 1 - largestChannelDifference / 255;
    intersection += overlap * colorSimilarity;
    union += Math.max(expectedAlpha, observedAlpha);
    referenceMass += expectedAlpha;
    actualMass += observedAlpha;
  }
  return {
    iou: union === 0 ? 1 : intersection / union,
    recall: referenceMass === 0 ? 1 : intersection / referenceMass,
    precision: actualMass === 0 ? 1 : intersection / actualMass,
  };
}
