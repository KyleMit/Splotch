// THROWAWAY SPIKE — two-pass "draft then refine" on the FAST flash model.
//
// Pass 1: ask flash for a rough, composition-first DRAFT (timed).
// We downscale that draft to 256px wide (preserving aspect ratio) — both as the
// thing we'd show the user immediately, and as a small anchor fed back in.
// Pass 2: feed [labeled original] + [labeled draft] + a refine prompt, so the
// final stays anchored to the draft's composition (timed).
//
// Goal: measure time-to-first-pixel (end of pass 1) and total (end of pass 2),
// and eyeball whether pass 2 preserves the draft so a draft->final sharpen reads
// as one continuous image rather than two unrelated generations.
//
// Usage:
//   node --env-file=.env scripts/spike-two-pass.mjs
//   INPUT=static/coloring/bluey/chili.webp node --env-file=.env scripts/spike-two-pass.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';

const MODEL = process.env.MODEL || 'gemini-2.5-flash-image';
const INPUT = process.env.INPUT || 'static/coloring/animals/dog.webp';
const OUT_DIR = 'scripts/spike-out';
const DRAFT_W = 256;

const DRAFT_PROMPT =
  'Create a rough, fast draft of this drawing reimagined as a magical illustration. ' +
  'Prioritize overall composition, subject placement, and large color shapes over fine detail. ' +
  'A soft, loose, painterly look is fine — do not worry about texture or sharpness.';

const REFINE_PROMPT =
  'The first image is the ORIGINAL drawing. The second image is a rough DRAFT illustration of it. ' +
  'Produce the final polished illustration, preserving the draft’s composition, subject placement, ' +
  'pose, framing, lighting direction and color palette exactly. Only increase detail, texture, ' +
  'sharpness and rendering quality. Keep the original characters and shapes intact.';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('Missing GEMINI_API_KEY (run with --env-file=.env)'); process.exit(1); }

const mimeFor = (p) => (p.endsWith('.png') ? 'image/png' : p.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
const firstImage = (res) => (res?.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);

await mkdir(OUT_DIR, { recursive: true });
const ai = new GoogleGenAI({ apiKey });

const origBuf = await readFile(INPUT);
const origMeta = await sharp(origBuf).metadata();
const origBase64 = origBuf.toString('base64');
const origMime = mimeFor(INPUT);
console.log(`input: ${INPUT} ${origMeta.width}x${origMeta.height}\nmodel: ${MODEL}\n`);

// ---- PASS 1: rough draft -------------------------------------------------
const tStart = performance.now();
const draftRes = await ai.models.generateContent({
  model: MODEL,
  contents: [{ role: 'user', parts: [{ inlineData: { mimeType: origMime, data: origBase64 } }, { text: DRAFT_PROMPT }] }]
});
const pass1s = (performance.now() - tStart) / 1000;
const draftPart = firstImage(draftRes);
if (!draftPart) { console.error('PASS 1 returned no image'); process.exit(1); }
const draftFullBuf = Buffer.from(draftPart.inlineData.data, 'base64');
await writeFile(`${OUT_DIR}/pass1-draft-full.png`, draftFullBuf);

// downscale to 256w preserving aspect ratio (the preview + the anchor we feed back)
const draftSmallBuf = await sharp(draftFullBuf).resize({ width: DRAFT_W }).png().toBuffer();
const draftSmallMeta = await sharp(draftSmallBuf).metadata();
await writeFile(`${OUT_DIR}/pass1-draft-256.png`, draftSmallBuf);
console.log(`PASS 1 (draft): ${pass1s.toFixed(1)}s  full ${(draftFullBuf.length / 1024).toFixed(0)}K`);
console.log(`  -> draft downscaled to ${draftSmallMeta.width}x${draftSmallMeta.height} (${(draftSmallBuf.length / 1024).toFixed(0)}K)`);
console.log(`  >>> TIME TO FIRST PIXEL the user could see: ${pass1s.toFixed(1)}s\n`);

// ---- PASS 2: refine, anchored to draft -----------------------------------
const tPass2 = performance.now();
const finalRes = await ai.models.generateContent({
  model: MODEL,
  contents: [{
    role: 'user',
    parts: [
      { text: 'ORIGINAL source drawing:' },
      { inlineData: { mimeType: origMime, data: origBase64 } },
      { text: 'Rough generated DRAFT to refine:' },
      { inlineData: { mimeType: 'image/png', data: draftSmallBuf.toString('base64') } },
      { text: REFINE_PROMPT }
    ]
  }]
});
const pass2s = (performance.now() - tPass2) / 1000;
const finalPart = firstImage(finalRes);
if (!finalPart) { console.error('PASS 2 returned no image'); process.exit(1); }
const finalBuf = Buffer.from(finalPart.inlineData.data, 'base64');
await writeFile(`${OUT_DIR}/pass2-final.png`, finalBuf);
const totalS = (performance.now() - tStart) / 1000;

console.log(`PASS 2 (refine): ${pass2s.toFixed(1)}s  ${(finalBuf.length / 1024).toFixed(0)}K`);
console.log(`\n--- TIMING SUMMARY ---`);
console.log(`  pass 1 (draft, shown to user):  ${pass1s.toFixed(1)}s`);
console.log(`  pass 2 (refine to final):       ${pass2s.toFixed(1)}s`);
console.log(`  TOTAL to final:                 ${totalS.toFixed(1)}s`);
console.log(`\nCompare in ${OUT_DIR}/: pass1-draft-256.png  vs  pass2-final.png`);
console.log('Key question: does the final preserve the draft composition (continuous sharpen)?');
