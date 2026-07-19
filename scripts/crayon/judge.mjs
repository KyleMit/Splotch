// Automated visual judge: shows Gemini a real-crayon REFERENCE and MY render of
// the same scene, and asks for per-axis scores + one concrete next change. Used
// as a REGRESSION SIGNAL across tuning rounds — a harsh vision judge is often
// wrong on a single axis, so the final call is by eye against the references.
//
//   node scripts/crayon/judge.mjs waxy
import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const variant = process.argv[2] || 'waxy';
const DIR = process.env.CRAYON_OUT || join(tmpdir(), 'splotch-crayon');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash';

const inline = (path) => ({
  inlineData: { mimeType: 'image/png', data: readFileSync(path).toString('base64') },
});

const RUBRIC = `You are grading how convincingly a DIGITAL crayon brush imitates a REAL wax crayon on textured paper. You are given, for each scene, the REAL reference photo first, then MY digital render second.

Score each axis 1-10 (10 = indistinguishable from the real crayon reference):
- waxiness: dense waxy body, not a flat marker fill and not a thin wash.
- tooth: FINE paper-tooth grain — paper showing through in tiny flecks. Penalize harsh/uniform DIGITAL grit or noise; penalize a flat fill with no grain.
- edge: broken but CRISP wax edge. Penalize a clean smooth marker/pen edge; penalize a blurry/soft edge.
- containment: grain stays INSIDE the stroke — nothing sprays/speckles past where a finger drew. (My render should be well contained; the real photo may spray — that's fine, judge MY render on its own for this axis.)
- buildup (overlap/scribble scenes only, else null): where strokes overlap, does it get DENSER while the HUE stays the same (no darkening/muddying)?

Return ONLY strict JSON:
{"waxiness":n,"tooth":n,"edge":n,"containment":n,"buildup":n|null,"verdict":"one sentence","nextChange":"one concrete change to the brush to close the biggest gap"}`;

async function judge(scene, hasBuildup) {
  const ref = join(DIR, 'refs', `${scene}.png`);
  const mine = join(DIR, `mine-${variant}-${scene === 'overlap' ? 'buildup' : scene}.png`);
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: `SCENE: ${scene}. REAL reference:` },
          inline(ref),
          { text: 'MY digital render:' },
          inline(mine),
          { text: RUBRIC },
        ],
      },
    ],
    config: { responseMimeType: 'application/json' },
  });
  let obj;
  try {
    obj = JSON.parse(res.text);
  } catch {
    obj = { raw: res.text };
  }
  return { scene, hasBuildup, ...obj };
}

const scenes = [
  ['single', false],
  ['overlap', true],
  ['scribble', true],
];
const out = [];
for (const [s, b] of scenes)
  out.push(await judge(s, b).catch((e) => ({ scene: s, error: e.message })));
writeFileSync(join(DIR, `judge-${variant}.json`), JSON.stringify(out, null, 2));
for (const r of out) {
  console.log(`\n== ${r.scene} ==`);
  console.log(JSON.stringify(r, null, 2));
}
