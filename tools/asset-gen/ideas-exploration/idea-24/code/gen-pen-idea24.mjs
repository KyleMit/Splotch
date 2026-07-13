// TEMPORARY (idea #24 experiment) — author a missing-orientation PEN outline by
// conditioning Gemini on the page's existing sibling orientation. Deleted after use.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { COLORING_DIR, fail } from './lib/paths.mjs';
import { classifyGeminiResponse } from '../../web/src/lib/server/ai/geminiSafety.ts';

const MODEL = 'gemini-2.5-flash-image';
const OUT_DIR = process.env.IDEA_OUT || '/tmp/idea24-pen';

const [, , siblingRel, targetOrient, outName, tempArg, extraNote] = process.argv;
if (!siblingRel || !targetOrient || !outName) {
  fail(
    'usage: node gen-pen-idea24.mjs <sibling e.g. shapes/heart-tall> <wide|tall> <outName> [temp] [note]'
  );
}
if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is not set.');

const wide = targetOrient === 'wide';
const [W, H] = wide ? [1536, 1024] : [1024, 1536];
const aspect = wide ? '3:2' : '2:3';
const orientWord = wide ? 'LANDSCAPE (wider than tall)' : 'PORTRAIT (taller than wide)';

const PROMPT = `This image is one page of a toddler coloring book: clean black pen outlines on a pure white background, medium line weight, no shading, no grey, no color, no text.

Draw a NEW page of the SAME coloring book showing the SAME subject, recomposed for a ${orientWord} page (${aspect} aspect ratio).

RULES:
- Keep the identical drawing style: the same pen stroke weight, the same simple rounded shapes, the same level of detail (very simple — this is for a 2-year-old).
- Keep the same subject and supporting elements, rearranged naturally to fill the ${orientWord} composition with generous margins.
- Every shape must be a closed thin outline that can be colored in. NO solid black regions, no filled areas, no shading, no cross-hatching.
- Pure white background, pure black lines only. No text, letters, numbers, signature, or border frame.
${extraNote ? `- ${extraNote}` : ''}`;

const source = await readFile(join(COLORING_DIR, `${siblingRel}.outline.webp`));
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: MODEL,
  contents: [
    {
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/webp', data: Buffer.from(source).toString('base64') } },
        { text: PROMPT },
      ],
    },
  ],
  config: {
    abortSignal: AbortSignal.timeout(120_000),
    imageConfig: { aspectRatio: aspect },
    ...(tempArg ? { temperature: Number(tempArg) } : {}),
  },
});
const classified = classifyGeminiResponse(response);
if (classified.kind !== 'image') fail(`${classified.kind}: ${classified.reason}`);

const bytes = Buffer.from(classified.data, 'base64');
const meta = await sharp(bytes).metadata();
console.log(`model returned ${meta.width}x${meta.height} ${meta.format}`);

await mkdir(OUT_DIR, { recursive: true });
// Normalize to the pen contract: exact page dims, hard white paper / black ink.
const out = join(OUT_DIR, `${outName}.outline.webp`);
await sharp(bytes)
  .resize(W, H, { fit: 'fill' })
  .toColourspace('b-w')
  .normalise()
  .webp({ quality: 90 })
  .toFile(out);
console.log(`wrote ${out}`);
