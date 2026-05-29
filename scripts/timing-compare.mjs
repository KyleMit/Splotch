// THROWAWAY — baseline wall-clock timing for the FINAL rendered image across
// candidate models, so we can weigh the progressive-reveal upgrade against any
// latency cost. Runs each model RUNS times and reports per-run + average.
//
// Usage:
//   node --env-file=.env scripts/timing-compare.mjs
//   RUNS=5 node --env-file=.env scripts/timing-compare.mjs
//   MODELS=gemini-2.5-flash-image,gemini-3.1-flash-image node --env-file=.env scripts/timing-compare.mjs
//   INPUT=static/coloring/bluey/chili.webp node --env-file=.env scripts/timing-compare.mjs
import { readFile } from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';

const MODELS = (process.env.MODELS || 'gemini-2.5-flash-image,gemini-3.1-flash-image,gemini-3-pro-image')
  .split(',').map((m) => m.trim()).filter(Boolean);
const RUNS = Number(process.env.RUNS || 3);
const INPUT = process.env.INPUT || 'static/coloring/animals/dog.webp';

const PROMPT =
  "Reimagine this child's drawing as a polished, magical illustration. Keep the " +
  'original characters, shapes, and composition intact, but bring them to life with ' +
  'vibrant color, charming details, and a warm, whimsical feel.';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('Missing GEMINI_API_KEY (run with --env-file=.env)'); process.exit(1); }

const mimeFor = (p) => (p.endsWith('.png') ? 'image/png' : p.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
const inputBytes = await readFile(INPUT);
const inputBase64 = inputBytes.toString('base64');
const ai = new GoogleGenAI({ apiKey });

const contents = [
  {
    role: 'user',
    parts: [
      { inlineData: { mimeType: mimeFor(INPUT), data: inputBase64 } },
      { text: PROMPT }
    ]
  }
];

async function timeOne(model) {
  const t0 = performance.now();
  const res = await ai.models.generateContent({ model, contents, config: { responseModalities: ['IMAGE'] } });
  const secs = (performance.now() - t0) / 1000;
  const parts = res?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  const kb = img ? Buffer.from(img.inlineData.data, 'base64').length / 1024 : 0;
  return { secs, kb, ok: !!img };
}

console.log(`input: ${INPUT}   runs: ${RUNS}   models: ${MODELS.join(', ')}\n`);

for (const model of MODELS) {
  const times = [];
  process.stdout.write(`${model}\n`);
  for (let i = 0; i < RUNS; i++) {
    try {
      const { secs, kb, ok } = await timeOne(model);
      times.push(secs);
      console.log(`  run ${i + 1}: ${secs.toFixed(1)}s  ${ok ? `(${kb.toFixed(0)}K image)` : '(NO IMAGE)'}`);
    } catch (err) {
      console.log(`  run ${i + 1}: FAILED  ${err?.message ?? err}`);
    }
  }
  if (times.length) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times), max = Math.max(...times);
    console.log(`  avg ${avg.toFixed(1)}s  (min ${min.toFixed(1)}s / max ${max.toFixed(1)}s)\n`);
  } else {
    console.log('  no successful runs\n');
  }
}
