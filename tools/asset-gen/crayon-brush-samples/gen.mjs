// Text-to-image driver that generates crayon-stroke REFERENCE samples with
// Gemini, to serve as acceptance criteria for the new crayon brush mode.
// Not part of the shipping pipeline — a scratch generator for reference art.
//
//   GEMINI_API_KEY=… node --experimental-strip-types --disable-warning=ExperimentalWarning gen.mjs [idPrefix...]
//
// With no args it generates every spec; pass one or more id prefixes to
// generate just a subset (e.g. `gen.mjs 1- 2-` for stages 1 and 2).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { classifyGeminiResponse } from '../../../web/src/lib/server/ai/geminiSafety.ts';
import { SAMPLES } from './samples.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../../../artifacts/crayon-brush-samples');
const MODEL = 'gemini-3.1-flash-image';

if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not set.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function draw(prompt) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { abortSignal: AbortSignal.timeout(120_000) },
  });
  const classified = classifyGeminiResponse(response);
  if (classified.kind !== 'image') {
    throw new Error(`${classified.kind}: ${classified.reason}`);
  }
  return { data: Buffer.from(classified.data, 'base64'), mimeType: classified.mimeType };
}

const ext = (mime) => (mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg');

async function withRetry(fn, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const wait = 2000 * 2 ** i;
      console.warn(`  retry ${i + 1}/${tries} after error: ${err.message} (waiting ${wait}ms)`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

const filters = process.argv.slice(2);
const selected = filters.length
  ? SAMPLES.filter((s) => filters.some((f) => s.id.startsWith(f)))
  : SAMPLES;

await mkdir(OUT, { recursive: true });
console.log(`Generating ${selected.length} crayon-stroke reference samples -> ${OUT}\n`);

let ok = 0;
let failed = 0;
for (const spec of selected) {
  process.stdout.write(`• ${spec.id}  ${spec.label} … `);
  try {
    const { data, mimeType } = await withRetry(() => draw(spec.prompt));
    const file = join(OUT, `${spec.id}.${ext(mimeType)}`);
    await writeFile(file, data);
    console.log(`ok (${(data.length / 1024).toFixed(0)} KB)`);
    ok++;
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone. ${ok} ok, ${failed} failed.`);
