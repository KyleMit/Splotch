// THROWAWAY SPIKE — PoC: call fal.ai from Node, transform a child's drawing with
// a FAST few-step SDXL img2img model, and find out (empirically) two things:
//
//   WIN A (speed):   how long until the FINAL image — does it beat our ~10s
//                    gemini-flash baseline?
//   WIN B (frames):  does fal stream genuine INTERIM diffusion frames during
//                    generation, or just progress logs + a final image?
//
// Honest caveat we're testing: fal's per-step image-preview streaming is
// documented mainly for CUSTOM-deployed apps (TinyVAE callback). Stock endpoints
// like fast-lightning-sdxl may just be *fast* and return progress + final only.
// This spike proves which is true before we build anything real.
//
// Setup: see the account walkthrough — needs FAL_KEY in .env, then:
//   node --env-file=.env scripts/spike-fal-stream.mjs
//   STEPS=8 STRENGTH=0.6 node --env-file=.env scripts/spike-fal-stream.mjs
//   INPUT=static/coloring/bluey/chili.webp node --env-file=.env scripts/spike-fal-stream.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fal } from '@fal-ai/client';

const ENDPOINT = process.env.ENDPOINT || 'fal-ai/fast-lightning-sdxl/image-to-image';
const INPUT = process.env.INPUT || 'static/coloring/animals/dog.webp';
const STEPS = process.env.STEPS || '4'; // enum: "1" | "2" | "4" | "8"
const STRENGTH = Number(process.env.STRENGTH || 0.7); // lower = keep more of the original drawing
const OUT_DIR = 'scripts/spike-out';
const BASELINE = 10; // our best-case gemini-flash time-to-final, seconds

const PROMPT =
  "a polished, magical children's storybook illustration, vibrant color, charming whimsical " +
  'details, warm soft lighting, keep the original composition and characters';

if (!process.env.FAL_KEY) {
  console.error('Missing FAL_KEY. Add it to .env (see setup steps) and run with --env-file=.env');
  process.exit(1);
}

const mimeFor = (p) => (p.endsWith('.png') ? 'image/png' : p.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
await mkdir(OUT_DIR, { recursive: true });

const buf = await readFile(INPUT);
const dataUri = `data:${mimeFor(INPUT)};base64,${buf.toString('base64')}`;
const input = {
  image_url: dataUri,
  prompt: PROMPT,
  num_inference_steps: STEPS,
  strength: STRENGTH,
  sync_mode: true // return images as data URIs so we can save without a second fetch
};

console.log(`endpoint: ${ENDPOINT}`);
console.log(`input:    ${INPUT}   steps=${STEPS}   strength=${STRENGTH}`);
console.log(`baseline: ~${BASELINE}s (gemini-flash time-to-final)\n`);

// pull any image data URIs / urls out of an event or result, regardless of shape
const imagesFrom = (obj) => {
  if (!obj) return [];
  if (Array.isArray(obj.images)) return obj.images.map((i) => i?.url).filter(Boolean);
  if (obj.image?.url) return [obj.image.url];
  return [];
};
const saveImage = async (url, name) => {
  if (url.startsWith('data:')) {
    const b64 = url.slice(url.indexOf(',') + 1);
    await writeFile(`${OUT_DIR}/${name}.jpg`, Buffer.from(b64, 'base64'));
  } else {
    const r = await fetch(url);
    await writeFile(`${OUT_DIR}/${name}.jpg`, Buffer.from(await r.arrayBuffer()));
  }
};

// Stock fast-lightning-sdxl/image-to-image is NOT streamable (the /stream path
// 404s), so Win B (interim frames) isn't available here — it would need a custom
// fal app. We measure WIN A (raw speed) with fal.subscribe over a few runs.
const RUNS = Number(process.env.RUNS || 3);
console.log(`--- fal.subscribe x${RUNS} (measuring raw speed; run 1 may be a cold start) ---`);

const times = [];
for (let i = 1; i <= RUNS; i++) {
  const t0 = performance.now();
  let firstUpdateAt = null;
  try {
    const result = await fal.subscribe(ENDPOINT, {
      input,
      logs: false,
      onQueueUpdate: () => { if (firstUpdateAt === null) firstUpdateAt = (performance.now() - t0) / 1000; }
    });
    const secs = (performance.now() - t0) / 1000;
    times.push(secs);
    const imgs = imagesFrom(result?.data ?? result);
    if (i === RUNS && imgs.length) await saveImage(imgs[0], 'fal-final');
    const verdict = secs < BASELINE ? `${(BASELINE / secs).toFixed(1)}x FASTER` : `${(secs / BASELINE).toFixed(1)}x slower`;
    console.log(`  run ${i}: ${secs.toFixed(2)}s  (vs ~${BASELINE}s baseline: ${verdict})${i === 1 ? '  <- may be cold' : ''}`);
  } catch (err) {
    console.log(`  run ${i}: FAILED  ${err?.status ?? ''} ${err?.body?.detail ?? err?.message ?? err}`);
  }
}

if (times.length) {
  const warm = times.slice(1).length ? times.slice(1) : times; // drop cold run 1 if we have others
  const avg = warm.reduce((a, b) => a + b, 0) / warm.length;
  console.log(`\n--- RESULTS ---`);
  console.log(`  warm avg time-to-final: ${avg.toFixed(2)}s  (baseline ~${BASELINE}s)`);
  console.log(`  => ${avg < BASELINE ? `WIN A CONFIRMED: ${(BASELINE / avg).toFixed(1)}x faster than gemini-flash.` : 'Not faster than baseline.'}`);
  console.log(`  Final image saved to ${OUT_DIR}/fal-final.jpg — eyeball the style/quality vs Gemini.`);
  console.log(`  NOTE: stock endpoint isn't streamable (no interim frames). At this speed you likely don't need them.`);
}
