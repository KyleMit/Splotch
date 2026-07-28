// Regenerates the AI style cover thumbnails in web/static/styles/ by running
// the source drawing (web/static/styles/source.svg) through Gemini once per
// style in STYLE_SUFFIXES, using the same prompt assembly as /api/generate-image.
// Requires GEMINI_API_KEY in the environment. Run via npm so the TypeScript
// imports resolve (node --experimental-strip-types):
//   npm run gen:style-covers                                  all styles
//   npm run gen:style-covers -- --style Crayon                one style
//   npm run gen:style-covers -- --style Crayon --temperature 1.4
// Bump --temperature (model default is 1) for different takes on a re-run when
// a style's first render isn't the look you want.
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { STYLES_DIR } from '../lib/paths.mjs';
import { fail, parseTemperature } from '../lib/cli.mjs';
import { generateImage, makeClient } from '../lib/gemini.mjs';
import { STYLE_SUFFIXES, STYLE_NAMES } from '../../../web/src/lib/ai/styles.ts';
import { buildPromptForStyle } from '../../../web/src/lib/ai/prompt.ts';

const SOURCE_SVG = join(STYLES_DIR, 'source.svg');
const THUMB_SIZE = 448;
const WEBP_QUALITY = 75;

// Generate one styled render of a drawing. Returns raw image bytes + mime type,
// or throws with the refusal/empty reason.
async function generateStyledImage(ai, { imageBytes, mimeType, style, temperature }) {
  const prompt = buildPromptForStyle(style, STYLE_SUFFIXES);
  return generateImage(ai, { imageBytes, mimeType, prompt, temperature });
}

function resolveStyle(name) {
  const match = STYLE_NAMES.find((s) => s.toLowerCase() === name.toLowerCase());
  if (!match) fail(`Unknown style "${name}". Available: ${STYLE_NAMES.join(', ')}`);
  return match;
}

const { values } = parseArgs({
  options: {
    style: { type: 'string', short: 's', multiple: true },
    temperature: { type: 'string', short: 't' },
  },
});

const styles = values.style?.length ? values.style.map(resolveStyle) : STYLE_NAMES;
const temperature = parseTemperature(values.temperature, '--temperature', undefined);
const ai = makeClient();

const sourcePng = await sharp(await readFile(SOURCE_SVG))
  .png()
  .toBuffer();

let failures = 0;
for (const style of styles) {
  const out = join(STYLES_DIR, `${style.toLowerCase()}.webp`);
  process.stdout.write(`${style} ... `);
  try {
    const { bytes } = await generateStyledImage(ai, {
      imageBytes: sourcePng,
      mimeType: 'image/png',
      style,
      temperature,
    });
    await sharp(bytes)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
      .webp({ quality: WEBP_QUALITY })
      .toFile(out);
    console.log(`saved ${out}`);
  } catch (err) {
    failures++;
    console.log(`FAILED (${err instanceof Error ? err.message : err})`);
  }
}

if (failures) fail(`${failures} style(s) failed.`);
console.log('Done.');
