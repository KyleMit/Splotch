// THROWAWAY SPIKE — confirm whether Gemini 3.x image models return interim
// "thought images" we can use to drive a progressive, honest de-blur in the UI.
//
// It calls the model with includeThoughts:true and dumps EVERY image part it
// gets back (interim thoughts + final) to scripts/spike-out/, so we can eyeball
// how many interim frames arrive and how rough/useful they look.
//
// Usage:
//   node --env-file=.env scripts/spike-thought-images.mjs
//   MODEL=gemini-3.1-flash-image node --env-file=.env scripts/spike-thought-images.mjs
//   INPUT=static/coloring/bluey/chili.webp node --env-file=.env scripts/spike-thought-images.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';

const MODEL = process.env.MODEL || 'gemini-3-pro-image';
const INPUT = process.env.INPUT || 'static/coloring/animals/dog.webp';
const OUT_DIR = 'scripts/spike-out';

const PROMPT =
  "Reimagine this child's drawing as a polished, magical illustration. Keep the " +
  'original characters, shapes, and composition intact, but bring them to life with ' +
  'vibrant color, charming details, and a warm, whimsical feel.';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('Missing GEMINI_API_KEY (run with --env-file=.env)'); process.exit(1); }

const mimeFor = (p) => (p.endsWith('.png') ? 'image/png' : p.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
const ext = (m) => (m.includes('png') ? 'png' : m.includes('webp') ? 'webp' : 'jpg');

await mkdir(OUT_DIR, { recursive: true });
const inputBytes = await readFile(INPUT);
const inputBase64 = inputBytes.toString('base64');

const ai = new GoogleGenAI({ apiKey });

console.log(`model:  ${MODEL}`);
console.log(`input:  ${INPUT} (${(inputBytes.length / 1024).toFixed(0)}K)`);
console.log('STREAMING with thinkingConfig.includeThoughts = true ...\n');

const t0 = performance.now();
const stream = await ai.models.generateContentStream({
  model: MODEL,
  contents: [
    {
      role: 'user',
      parts: [
        { inlineData: { mimeType: mimeFor(INPUT), data: inputBase64 } },
        { text: PROMPT }
      ]
    }
  ],
  config: {
    // TEXT channel is required for the thinking process (and its interim images)
    // to surface; IMAGE-only suppresses thought images entirely.
    responseModalities: ['TEXT', 'IMAGE'],
    thinkingConfig: { includeThoughts: true, thinkingLevel: 'high' }
  }
});

const at = () => `${((performance.now() - t0) / 1000).toFixed(1)}s`;
let chunkN = 0;
let imgN = 0;
let thoughtImgs = 0;

for await (const chunk of stream) {
  chunkN++;
  const parts = chunk?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const isThought = part.thought === true;
    if (part.inlineData?.data) {
      imgN++;
      if (isThought) thoughtImgs++;
      const bytes = Buffer.from(part.inlineData.data, 'base64');
      const label = isThought ? `thought-${imgN}` : `img-${imgN}`;
      const file = `${OUT_DIR}/${label}.${ext(part.inlineData.mimeType || 'image/png')}`;
      await writeFile(file, bytes);
      console.log(`  [${at()}] chunk ${chunkN}  IMAGE  thought=${isThought}  ${(bytes.length / 1024).toFixed(0)}K -> ${file}`);
    } else if (typeof part.text === 'string') {
      console.log(`  [${at()}] chunk ${chunkN}  TEXT   thought=${isThought}  ${JSON.stringify(part.text.slice(0, 100))}`);
    }
  }
}

console.log(`\ndone in ${at()} — ${chunkN} chunks, ${imgN} image part(s), ${thoughtImgs} interim thought image(s).`);
console.log(
  thoughtImgs > 0
    ? `=> Progressive reveal IS viable on ${MODEL}: ${thoughtImgs} interim frame(s) + final. Open ${OUT_DIR}/ to compare detail levels.`
    : imgN > 1
      ? `=> ${MODEL} streamed ${imgN} images but none flagged thought=true. Inspect ${OUT_DIR}/ — they may still be progressive frames.`
      : `=> No interim images from ${MODEL} even when streaming. Progressive de-blur from real frames NOT viable here.`
);
