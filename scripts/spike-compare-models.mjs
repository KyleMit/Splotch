// THROWAWAY SPIKE — 4-model bake-off on the real sample drawings in
// scripts/spike-in/. Runs each input through the same default prompt on:
//   1. fal Lightning SDXL img2img   (fast draft candidate)
//   2. Flux Kontext (fal)           (img edit, composition-preserving)
//   3. gemini-2.5-flash-image       (current production)
//   4. gemini-3-pro-image           (Nano Banana Pro)
//
// Outputs, per input, a side-by-side montage [original | each model] to
// scripts/spike-out/compare/, plus individual files, plus avg timing per model.
//
// Usage: node --env-file=.env scripts/spike-compare-models.mjs
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';
import { fal } from '@fal-ai/client';
import sharp from 'sharp';

const IN_DIR = 'scripts/spike-in';
const OUT_DIR = 'scripts/spike-out/compare';
const PROMPT =
  "Reimagine this child's drawing as a polished, magical illustration. Keep the original " +
  'characters, shapes, and composition intact, but bring them to life with vibrant color, ' +
  'charming details, and a warm, whimsical feel.';

if (!process.env.FAL_KEY) { console.error('Missing FAL_KEY'); process.exit(1); }
if (!process.env.GEMINI_API_KEY) { console.error('Missing GEMINI_API_KEY'); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const mimeFor = (p) => (p.endsWith('.png') ? 'image/png' : p.endsWith('.webp') ? 'image/webp'
  : /\.jpe?g$/i.test(p) ? 'image/jpeg' : 'application/octet-stream');
const dataUri = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;
const fromDataUri = (uri) => Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');

// fit input AR into a ~1024 box, rounded to /8 (SDXL-friendly custom size)
function sdxlSize(w, h) {
  const max = 1024;
  const scale = Math.min(max / w, max / h, 1);
  const round8 = (n) => Math.max(512, Math.round((n * scale) / 8) * 8);
  return { width: round8(w), height: round8(h) };
}

// ---- per-model runners: return { buf, secs } ----
async function runFalLightning(buf, mime, meta) {
  const t0 = performance.now();
  const r = await fal.subscribe('fal-ai/fast-lightning-sdxl/image-to-image', {
    input: {
      image_url: dataUri(buf, mime), prompt: PROMPT,
      num_inference_steps: '4', strength: 0.8, sync_mode: true,
      image_size: sdxlSize(meta.width, meta.height)
    }
  });
  return { buf: fromDataUri(r.data.images[0].url), secs: (performance.now() - t0) / 1000 };
}
async function runFluxKontext(buf, mime) {
  const t0 = performance.now();
  const r = await fal.subscribe('fal-ai/flux-pro/kontext', {
    input: { image_url: dataUri(buf, mime), prompt: PROMPT, sync_mode: true }
  });
  return { buf: fromDataUri(r.data.images[0].url), secs: (performance.now() - t0) / 1000 };
}
async function runGemini(model, buf, mime) {
  const t0 = performance.now();
  const res = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: buf.toString('base64') } }, { text: PROMPT }] }],
    config: { responseModalities: ['IMAGE'] }
  });
  const part = (res?.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
  if (!part) throw new Error('no image part');
  return { buf: Buffer.from(part.inlineData.data, 'base64'), secs: (performance.now() - t0) / 1000 };
}

const MODELS = [
  { key: 'lightning', label: 'fal Lightning', run: (b, m) => runFalLightning(b, m.mime, m.meta) },
  { key: 'kontext', label: 'Flux Kontext', run: (b, m) => runFluxKontext(b, m.mime) },
  { key: 'gflash', label: 'Gemini 2.5 Flash', run: (b, m) => runGemini('gemini-2.5-flash-image', b, m.mime) },
  { key: 'gpro', label: 'Gemini 3 Pro', run: (b, m) => runGemini('gemini-3-pro-image', b, m.mime) }
];

// ---- montage: [labeled cells] side by side at common height ----
const CELL_H = 460, LABEL_H = 34, GAP = 10;
async function labeledCell(buf, label) {
  const img = await sharp(buf).resize({ height: CELL_H }).toBuffer();
  const { width } = await sharp(img).metadata();
  const labelSvg = Buffer.from(
    `<svg width="${width}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#222"/>` +
    `<text x="50%" y="22" font-family="sans-serif" font-size="18" fill="#fff" text-anchor="middle">${label}</text></svg>`
  );
  return sharp({ create: { width, height: CELL_H + LABEL_H, channels: 3, background: '#222' } })
    .composite([{ input: labelSvg, top: 0, left: 0 }, { input: img, top: LABEL_H, left: 0 }])
    .png().toBuffer();
}
async function montage(cells) {
  const metas = await Promise.all(cells.map((c) => sharp(c).metadata()));
  const totalW = metas.reduce((a, m) => a + m.width, 0) + GAP * (cells.length - 1);
  const H = CELL_H + LABEL_H;
  let x = 0;
  const comps = [];
  for (let i = 0; i < cells.length; i++) { comps.push({ input: cells[i], top: 0, left: x }); x += metas[i].width + GAP; }
  return sharp({ create: { width: totalW, height: H, channels: 3, background: '#444' } }).composite(comps).jpeg({ quality: 88 }).toBuffer();
}

// ---- main ----
await mkdir(OUT_DIR, { recursive: true });
const files = (await readdir(IN_DIR)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
console.log(`inputs: ${files.length}   models: ${MODELS.map((m) => m.label).join(', ')}\n`);

const timings = Object.fromEntries(MODELS.map((m) => [m.key, []]));

for (const file of files) {
  const stem = file.replace(/\.[^.]+$/, '');
  const buf = await readFile(`${IN_DIR}/${file}`);
  const mime = mimeFor(file);
  const meta = await sharp(buf).metadata();
  console.log(`\n=== ${file} (${meta.width}x${meta.height}) ===`);

  const cells = [await labeledCell(buf, 'ORIGINAL')];
  for (const m of MODELS) {
    try {
      const { buf: out, secs } = await m.run(buf, { mime, meta });
      timings[m.key].push(secs);
      await writeFile(`${OUT_DIR}/${stem}__${m.key}.jpg`, out);
      cells.push(await labeledCell(out, `${m.label} (${secs.toFixed(1)}s)`));
      console.log(`  ${m.label.padEnd(18)} ${secs.toFixed(1)}s`);
    } catch (err) {
      console.log(`  ${m.label.padEnd(18)} FAILED  ${(err?.body?.detail ?? err?.message ?? err)}`.slice(0, 140));
      const ph = await sharp({ create: { width: 360, height: CELL_H, channels: 3, background: '#600' } }).png().toBuffer();
      cells.push(await labeledCell(ph, `${m.label} FAILED`));
    }
  }
  await writeFile(`${OUT_DIR}/${stem}__compare.jpg`, await montage(cells));
  console.log(`  -> ${OUT_DIR}/${stem}__compare.jpg`);
}

console.log(`\n====== AVERAGE TIMING ======`);
for (const m of MODELS) {
  const t = timings[m.key];
  if (t.length) {
    const avg = t.reduce((a, b) => a + b, 0) / t.length;
    console.log(`  ${m.label.padEnd(18)} avg ${avg.toFixed(1)}s  (min ${Math.min(...t).toFixed(1)} / max ${Math.max(...t).toFixed(1)}, n=${t.length})`);
  } else {
    console.log(`  ${m.label.padEnd(18)} no successful runs`);
  }
}
console.log(`\nOpen ${OUT_DIR}/*__compare.jpg to compare all 4 models per drawing.`);
