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
import { GoogleGenAI } from '@google/genai';
import { STYLES_DIR, fail } from '../lib/paths.mjs';
import { STYLE_SUFFIXES, STYLE_NAMES } from '../../../web/src/lib/ai/styles.ts';
import { buildPromptForStyle } from '../../../web/src/lib/ai/prompt.ts';
import { classifyGeminiResponse } from '../../../web/src/lib/server/ai/geminiSafety.ts';

const MODEL = 'gemini-3.1-flash-image';
const SOURCE_SVG = join(STYLES_DIR, 'source.svg');
const THUMB_SIZE = 448;
const WEBP_QUALITY = 75;

// Generate one styled render of a drawing. Returns raw image bytes + mime type,
// or throws with the refusal/empty reason. Kept free of file/CLI concerns so it
// can migrate toward in-app use later.
export async function generateStyledImage(ai, { imageBytes, mimeType, style, temperature }) {
  const prompt = buildPromptForStyle(style, STYLE_SUFFIXES);
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: Buffer.from(imageBytes).toString('base64') } },
          { text: prompt },
        ],
      },
    ],
    config: {
      abortSignal: AbortSignal.timeout(120_000),
      ...(temperature === undefined ? {} : { temperature }),
    },
  });
  const classified = classifyGeminiResponse(response);
  if (classified.kind !== 'image') {
    throw new Error(`${classified.kind}: ${classified.reason}`);
  }
  return { bytes: Buffer.from(classified.data, 'base64'), mimeType: classified.mimeType };
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
const temperature = values.temperature === undefined ? undefined : Number(values.temperature);
if (temperature !== undefined && !(temperature >= 0 && temperature <= 2)) {
  fail(`--temperature must be a number between 0 and 2, got "${values.temperature}"`);
}
if (!process.env.GEMINI_API_KEY) {
  fail('GEMINI_API_KEY is not set.');
}

const sourcePng = await sharp(await readFile(SOURCE_SVG))
  .png()
  .toBuffer();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
