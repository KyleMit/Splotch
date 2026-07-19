// Generate real-crayon REFERENCE images via Gemini (area:crayon), the north star
// the rendered crayon is judged against. Three scenes mirroring render-scenes.mjs:
// a single stroke, two overlapping same-colour strokes (buildup), and a scribble
// fill. Macro, on white toothy paper. Writes to scripts/crayon/references/.
//
//   GEMINI_API_KEY=... node scripts/crayon/gen-references.mjs

import { GoogleGenAI } from '@google/genai';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const outDir = join(HERE, 'references');
mkdirSync(outDir, { recursive: true });

const MODEL = 'gemini-2.5-flash-image';
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('GEMINI_API_KEY not set');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: key });

const BASE =
  'Extreme macro photograph of a blue wax crayon drawing on white toothed sketch paper. ' +
  'The wax sits on the raised tooth of the paper and the tiny valleys stay white, giving a ' +
  'characteristic fine broken grain. Rich cobalt-blue wax, matte-waxy sheen, crisp but ragged ' +
  'stroke edges. Flat top-down studio lighting, no shadows, plain white background. ' +
  'Photorealistic, sharp focus.';

const scenes = [
  {
    name: 'single',
    prompt: `${BASE} A SINGLE horizontal crayon stroke about 3cm wide across the frame.`,
  },
  {
    name: 'double',
    prompt:
      `${BASE} TWO passes of the SAME blue crayon over the SAME horizontal stroke: the ` +
      'overlap is denser and more saturated (the wax has filled more of the paper tooth) but the ' +
      'HUE is unchanged — same blue, just more filled-in, not darker.',
  },
  {
    name: 'scribble',
    prompt: `${BASE} A back-and-forth SCRIBBLE fill covering a rectangular patch.`,
  },
];

async function genOne(scene) {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: scene.prompt }] }],
  });
  const parts = res?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) {
    console.error(`no image for ${scene.name}:`, JSON.stringify(parts).slice(0, 200));
    return false;
  }
  writeFileSync(join(outDir, `${scene.name}.png`), Buffer.from(img.inlineData.data, 'base64'));
  console.log(`reference ${scene.name} written`);
  return true;
}

for (const scene of scenes) {
  try {
    await genOne(scene);
  } catch (e) {
    console.error(`${scene.name} failed:`, e?.message || e);
  }
}
console.log(`\nReferences: ${outDir}`);
