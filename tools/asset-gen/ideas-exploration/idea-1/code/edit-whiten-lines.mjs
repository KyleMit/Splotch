// Idea-1 approach (b): Gemini IMAGE-EDIT on the committed good night raw —
// "make every outline bright white, change nothing else" — instead of fresh
// generation. Evaluates each take offline: lineW (median max-3x3 luma over
// chalk ink), fill identity (mean |luma delta| vs the original raw outside a
// 3px chalk collar), then punches with the standard chalk mask, composites,
// and writes full + crop evidence.
//
// Run from the repo root:
//   node --experimental-strip-types --disable-warning=ExperimentalWarning \
//     <this file> <book/page-orient> <attempts>
import { join } from 'node:path';
import { GoogleGenAI } from '/home/user/Splotch/node_modules/@google/genai/dist/node/index.mjs';
import { classifyGeminiResponse } from '/home/user/Splotch/web/src/lib/server/ai/geminiSafety.ts';
import { alignToSource } from '/home/user/Splotch/tools/asset-gen/lib/align-to-source.mjs';
import { dilateMask } from '/home/user/Splotch/tools/asset-gen/lib/morphology.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import {
  sharp,
  loadRgb,
  chalkMask,
  punchWithMask,
  compositePunched,
  lumaOf,
  saveRgb,
  saveCrop,
} from './rim-lib.mjs';

const REPO = '/home/user/Splotch';
const IDEA_DIR =
  '/tmp/claude-0/-home-user-Splotch/68ded56b-e7dd-5cff-b995-afd9f1565152/scratchpad/ideas/idea-1';
const MODEL = 'gemini-2.5-flash-image';

const PROMPT = `This is a finished night-time coloring-page illustration. The line work (outlines) should be BRIGHT WHITE chalk lines, but some outlines are currently drawn in DARK ink — especially around the subject's dark or shaded parts.

YOUR ONLY TASK: repaint every outline stroke BRIGHT WHITE (a clean, bright chalk white), including the ones that are currently dark.

CHANGE NOTHING ELSE ANYWHERE:
- Keep every fill color EXACTLY as it is — same colors, same shapes, same shading.
- Keep every line EXACTLY where it is — same position, same thickness. Do not redraw, move, add, or remove anything.
- Do not brighten or darken the background or any fill.

The result must be the IDENTICAL image, except every outline is bright white.`;

const CROPS = {
  'vehicles/train-wide': [
    { left: 855, top: 540, width: 140, height: 130, name: 'mouth' },
    { left: 908, top: 460, width: 130, height: 130, name: 'eye' },
  ],
  'farm/cat-wide': [{ left: 176, top: 432, width: 160, height: 160, name: 'bale' }],
};

async function lineW(fillBuf, chalkPath) {
  const s = await sharp(await readFile(chalkPath))
    .resize(512, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const t = await sharp(fillBuf)
    .resize(512, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = s.info.width;
  const h = s.info.height;
  const maxes = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (s.data[y * w + x] >= 110) continue;
      let mx = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const v = t.data[yy * w + xx];
          if (v > mx) mx = v;
        }
      maxes.push(mx);
    }
  maxes.sort((a, b) => a - b);
  return maxes.length ? maxes[maxes.length >> 1] : 255;
}

const [page, attemptsArg] = process.argv.slice(2);
const attempts = Number(attemptsArg ?? 1);
const slug = page.replace('/', '-');
const rawPath = join(REPO, 'tools/asset-gen/fill-src', `${page}.night.raw.webp`);
const chalkPath = join(REPO, 'web/static/coloring', `${page}.chalk.webp`);
const rawBuf = await readFile(rawPath);
const { rgb: origRgb, width: W, height: H } = await loadRgb(rawPath);
const mask = await chalkMask(chalkPath, W, H);
const farFromInk = dilateMask(mask, W, H, 3);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

for (let i = 0; i < attempts; i++) {
  console.log(`\n--- ${page} attempt ${i + 1} (t=0.2) ---`);
  let bytes;
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/webp',
                data: rawBuf.toString('base64'),
              },
            },
            { text: PROMPT },
          ],
        },
      ],
      config: { abortSignal: AbortSignal.timeout(120_000), temperature: 0.2 },
    });
    const classified = classifyGeminiResponse(response);
    if (classified.kind !== 'image') throw new Error(`${classified.kind}: ${classified.reason}`);
    bytes = Buffer.from(classified.data, 'base64');
  } catch (e) {
    console.log(`  FAILED: ${e.message}`);
    continue;
  }
  const resized = await sharp(bytes).resize(W, H, { fit: 'fill' }).removeAlpha().toBuffer();
  const {
    buffer: aligned,
    dx,
    dy,
  } = await alignToSource(
    await sharp(resized).webp({ quality: 95 }).toBuffer(),
    await readFile(chalkPath),
    W,
    H
  );
  const editPath = join(IDEA_DIR, `${slug}.b-edit${i + 1}.raw.webp`);
  await writeFile(editPath, await sharp(aligned).webp({ quality: 90 }).toBuffer());
  const { rgb: editRgb } = await loadRgb(editPath);

  let sum = 0;
  let big = 0;
  let n = 0;
  for (let p = 0; p < W * H; p++) {
    if (farFromInk[p]) continue;
    const d = Math.abs(lumaOf(editRgb, p) - lumaOf(origRgb, p));
    sum += d;
    if (d > 40) big++;
    n++;
  }
  const lw = await lineW(aligned, chalkPath);
  console.log(
    `  nudge (${dx},${dy})  lineW ${lw}  fill-identity meanΔ=${(sum / n).toFixed(2)} px(Δ>40)=${((big / n) * 100).toFixed(2)}%`
  );

  const punched = punchWithMask(editRgb, mask, W, H);
  const { rgb: comp } = await compositePunched(punched, chalkPath, W, H);
  await saveRgb(comp, W, H, join(IDEA_DIR, `${slug}.b-edit${i + 1}.full.webp`), 560);
  for (const box of CROPS[page] ?? [])
    await saveCrop(comp, W, H, box, join(IDEA_DIR, `${slug}.b-edit${i + 1}.${box.name}.webp`), 560);
}
