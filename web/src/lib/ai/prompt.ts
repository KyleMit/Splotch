// Prompt assembly for AI image generation, shared by the /api/generate-image
// endpoint and scripts/gen-style-covers.mjs (which imports it via
// --experimental-strip-types, so keep this module dependency-free).
export const DEFAULT_PROMPT =
  "Reimagine this child's drawing as a polished, magical illustration. Keep the original characters, shapes, and composition intact, but bring them to life with vibrant color, charming details, and a warm, whimsical feel.";

export function buildPromptForStyle(
  style: unknown,
  suffixes: Record<string, string>,
  defaultPrompt: string = DEFAULT_PROMPT
): string {
  const suffix = typeof style === 'string' && Object.hasOwn(suffixes, style) ? suffixes[style] : '';
  return suffix ? defaultPrompt + ' ' + suffix : defaultPrompt;
}
