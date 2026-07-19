// Generate real-crayon REFERENCE images with Gemini so the judge (and my eyes)
// have a north star. Three scenes that mirror what the harness renders:
//   single   — one crayon stroke
//   overlap  — two same-colour strokes crossing (denser where they overlap)
//   scribble — a scribble fill (waxy buildup + paper tooth)
import { GoogleGenAI } from '@google/genai';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const OUT = process.env.CRAYON_OUT || join(tmpdir(), 'splotch-crayon');
mkdirSync(OUT, { recursive: true });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash-image';

const SCENES = {
  single:
    'Extreme macro photograph of ONE single stroke of a deep red-orange wax crayon drawn left-to-right across clean white cold-press textured drawing paper. The waxy pigment catches only on the raised tooth of the paper, leaving tiny white paper flecks showing through in the valleys. Dense waxy body, crisp but slightly broken edges, no blur. Flat even lighting, top-down, the whole frame is the paper. No hand, no crayon, no text.',
  overlap:
    'Extreme macro photograph of TWO overlapping strokes of the SAME deep red-orange wax crayon on clean white cold-press textured drawing paper, forming an X. Where the two strokes cross, the wax is visibly DENSER and fills in more of the paper tooth (fewer white flecks) but the HUE is exactly the same red-orange — not darker, not muddier, just more filled-in. Single-stroke areas show more white paper tooth. Flat even top-down lighting. No hand, no crayon, no text.',
  scribble:
    'Extreme macro photograph of a back-and-forth SCRIBBLE FILL of a deep red-orange wax crayon on clean white cold-press textured drawing paper, filling a rough rectangle. Visible waxy buildup where strokes overlap, fine white paper tooth showing through everywhere, crisp broken wax edges, not a flat solid fill. Flat even top-down lighting. No hand, no crayon, no text.',
};

async function gen(name, prompt) {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const parts = res?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData);
  if (!img) {
    console.error(
      `${name}: no image. text=`,
      parts
        .map((p) => p.text)
        .join(' ')
        .slice(0, 200)
    );
    return;
  }
  const buf = Buffer.from(img.inlineData.data, 'base64');
  writeFileSync(join(OUT, `${name}.png`), buf);
  console.log(`${name}: wrote ${buf.length} bytes`);
}

for (const [name, prompt] of Object.entries(SCENES)) {
  await gen(name, prompt).catch((e) => console.error(name, e.message));
}
console.log('refs at', OUT);
