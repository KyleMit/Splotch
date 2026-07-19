// Automated vision judge for the crayon look (area:crayon). Sends the rendered
// scenes (and the real-crayon references) to Gemini and asks for 0-10 scores on
// the axes that matter: waxiness, grain fineness, containment, not-gritty, and
// whether an overlapping second/third pass visibly fills in tooth at constant
// hue. A REGRESSION SIGNAL, deliberately calibrated as harsh — the final call is
// by eye against the references (see the task notes). Prints a JSON scorecard.
//
//   GEMINI_API_KEY=... node scripts/crayon/judge.mjs <render-dir>
//   (render-dir defaults to the newest perf-profiles/*-crayon-* directory)

import { GoogleGenAI } from '@google/genai';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../lib/utils.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const refDir = join(HERE, 'references');

function newestRenderDir() {
  const base = join(ROOT, 'perf-profiles');
  const dirs = readdirSync(base)
    .filter((d) => d.includes('-crayon-'))
    .sort();
  return dirs.length ? join(base, dirs[dirs.length - 1]) : null;
}

const renderDir = process.argv[2] || newestRenderDir();
if (!renderDir || !existsSync(renderDir)) {
  console.error('no render dir found; pass one explicitly');
  process.exit(1);
}

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('GEMINI_API_KEY not set');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: key });
const MODEL = 'gemini-2.5-flash';

const png = (p) => ({
  inlineData: { mimeType: 'image/png', data: readFileSync(p).toString('base64') },
});

async function ask(parts) {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts }],
    config: { responseMimeType: 'application/json' },
  });
  const text = res?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function judgeLook(scene) {
  const rn = join(renderDir, `${scene}.png`);
  const rf = join(refDir, `${scene}.png`);
  if (!existsSync(rn)) return null;
  const parts = [
    {
      text:
        'You are grading a digital "crayon" brush against a real crayon photo. ' +
        'The FIRST image is the real crayon REFERENCE. The SECOND image is the DIGITAL render. ' +
        'Score the DIGITAL render 0-10 on each axis (10 = indistinguishable from real crayon):\n' +
        '- waxiness: reads as waxy crayon laid on paper tooth (not flat marker fill)\n' +
        '- grainFineness: the paper-tooth grain is fine and organic (not big blobs)\n' +
        '- notGritty: NOT harsh digital speckle/static noise (10 = smooth organic tooth)\n' +
        '- containment: grain stays inside the stroke, nothing sprays/speckles outside it\n' +
        '- crispEdge: the stroke edge is broken but crisp, not blurry/soft\n' +
        'Return ONLY JSON: {"waxiness":n,"grainFineness":n,"notGritty":n,"containment":n,"crispEdge":n,"note":"one short sentence"}.',
    },
    { text: 'REAL crayon reference:' },
    png(rf),
    { text: 'DIGITAL render to grade:' },
    png(rn),
  ];
  return { scene, ...(await ask(parts)) };
}

async function judgeBuildup() {
  const single = join(renderDir, 'single.png');
  const dbl = join(renderDir, 'double.png');
  const tpl = join(renderDir, 'triple.png');
  if (!existsSync(single) || !existsSync(dbl)) return null;
  const parts = [
    {
      text:
        'These are 1, 2, and 3 passes of the SAME digital crayon color over the SAME stroke. ' +
        'Grade the wax BUILDUP 0-10:\n' +
        '- densifies: each extra pass visibly fills in more paper tooth / gets denser (10 = clearly)\n' +
        '- hueConstant: the color stays the SAME hue — it does NOT darken or muddy (10 = identical hue)\n' +
        'Return ONLY JSON: {"densifies":n,"hueConstant":n,"note":"one short sentence"}.',
    },
    { text: '1 pass:' },
    png(single),
    { text: '2 passes:' },
    png(dbl),
    ...(existsSync(tpl) ? [{ text: '3 passes:' }, png(tpl)] : []),
  ];
  return await ask(parts);
}

const scorecard = { renderDir };
for (const scene of ['single', 'scribble']) {
  scorecard[scene] = await judgeLook(scene);
}
scorecard.buildup = await judgeBuildup();
console.log(JSON.stringify(scorecard, null, 2));
