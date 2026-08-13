// Prompt assembly for AI image generation, shared by the /api/generate-image
// endpoint and tools/asset-gen/style-covers/gen-style-covers.mjs (which imports it via
// --experimental-strip-types, so keep this module free of RUNTIME dependencies —
// the type-only import below is erased and costs nothing).
import type { ResolvedTheme } from '../theme';
import type { StyleName } from './styles';

const DEFAULT_PROMPT =
  "Reimagine this child's drawing as a polished, magical illustration. Keep the original characters, shapes, and composition intact, but bring them to life with vibrant color, charming details, and a warm, whimsical feel. Treat the child's coloring as intent rather than texture: wherever they scribbled back and forth to fill a shape, render that whole region as one flat, even area of that solid color, the way a clean finished illustration would. Every part of the scene, including broad areas like the sky and ground, should read as a solid filled shape rather than visible individual strokes. Pay special attention to the ground: render it as one solidly filled area of even color.";

// The dark-theme counterpart of DEFAULT_PROMPT, appended after the style suffix
// so it has the last word on palette. Modelled on the coloring pipeline's
// darkFillPrompt (tools/asset-gen/lib/prompts.mjs): night by color and light
// alone, living things darkened rather than drained, nothing invented. The
// explicit "hearts" in the do-not-add list is not arbitrary — an early Crayon
// roll grew one.
const DARK_SCENE_PROMPT =
  'This drawing was made on dark paper at night, so render the scene as a cozy night-time version of itself, softly lit by moonlight. The background and every large open area, the sky and ground included, must be a deep evening tone — midnight blue, deep indigo, dark twilight purple, or deep navy — never a bright daytime or pale color. Faces, skin, and animal bodies keep their natural living color, only darkened for night, never grey or ghostly, and every color the child chose must stay recognizably itself rather than sinking into mud. Convey the night with color and light alone: do not add a moon, stars, fireflies, lamps, hearts, or any other shape the child did not draw.';

// `style` is deliberately unvalidated boundary input (the raw ?style= query
// param): an unknown style means "no suffix", never an error. The hasOwn check
// is that runtime validation, licensing the cast into the closed key union.
export function buildPromptForStyle(
  style: string | null,
  suffixes: Readonly<Record<StyleName, string>>,
  theme: ResolvedTheme
): string {
  const suffix =
    style !== null && Object.hasOwn(suffixes, style) ? suffixes[style as StyleName] : '';
  return [DEFAULT_PROMPT, suffix, theme === 'dark' ? DARK_SCENE_PROMPT : '']
    .filter(Boolean)
    .join(' ');
}
