// Prompt assembly for AI image generation, shared by the /api/generate-image
// endpoint and tools/asset-gen/gen-style-covers.mjs (which imports it via
// --experimental-strip-types, so keep this module dependency-free).
export const DEFAULT_PROMPT =
  "Reimagine this child's drawing as a polished, magical illustration. Keep the original characters, shapes, and composition intact, but bring them to life with vibrant color, charming details, and a warm, whimsical feel. Treat the child's coloring as intent rather than texture: wherever they scribbled back and forth to fill a shape, render that whole region as one flat, even area of that solid color, the way a clean finished illustration would. Every part of the scene, including broad areas like the sky and ground, should read as a solid filled shape rather than visible individual strokes. Pay special attention to the ground: render it as one solidly filled area of even color.";

export function buildPromptForStyle(
  style: unknown,
  suffixes: Record<string, string>,
  defaultPrompt: string = DEFAULT_PROMPT
): string {
  const suffix = typeof style === 'string' && Object.hasOwn(suffixes, style) ? suffixes[style] : '';
  return suffix ? defaultPrompt + ' ' + suffix : defaultPrompt;
}
