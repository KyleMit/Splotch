// Retouch a coloring-page's BASE LINE ART with Gemini image editing, for a
// "particularly hard section" that the color generators can't rescue downstream.
// The motivating case (ADR-0052 / night twins): eyes drawn as SOLID-BLACK filled
// ovals invert to solid white in dark mode, so they blow out no matter how the
// twin is colored — the fix has to change the line art itself (open the eyes into
// outlined coloring-book eyes so a twin can fill a dark pupil that survives).
//
// Writes candidates to the gitignored .coloring-samples-dark/retouch/ for review;
// it does NOT touch shipped assets. Once a retouched line art is approved, copy it
// over web/static/coloring/<cat>/<page>-<orient>.webp and regenerate the whole
// related suite from it (light .color.webp via gen-coloring-fills, night twin via
// gen-coloring-fills-dark, thumbnail via gen-coloring-thumbs), then re-review in the
// contact sheet's Combined view in BOTH light and dark. See scripts/night-twins.md.
//
//   node --experimental-strip-types --disable-warning=ExperimentalWarning \
//     scripts/retouch-line-art.mjs <cat/page-orient...> [--instruction "..."] [--samples N] [-t F]
//
//   creatures/mermaid-tall creatures/mermaid-wide   two pages
//   --samples 3                                       3 candidates each (pick the best)
//   --instruction "..."                               override the default (eye) edit
import { parseArgs } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { ROOT, fail } from './lib/utils.mjs';
import { classifyGeminiResponse } from '../web/src/lib/server/ai/geminiSafety.ts';

const MODEL = 'gemini-2.5-flash-image';
const WEBP_QUALITY = 92;
const COLORING_DIR = join(ROOT, 'web', 'static', 'coloring');
const OUT_DIR = join(ROOT, '.coloring-samples-dark', 'retouch');

// Default edit: open solid-black eyes into outlined coloring-book eyes. Written to
// change ONLY the eyes and keep the rest of the line art the same style/composition.
const DEFAULT_INSTRUCTION = `This is a black-and-white children's COLORING PAGE — clean black outlines on a pure white background, meant to be colored in.

Redraw ONLY the main character's EYES. Right now each eye is a SOLID BLACK filled oval, which is wrong for a coloring page. Change each eye into an OPEN, OUTLINED coloring-book eye that a child can color:
- a clean thin BLACK outline around the whole eye shape,
- a WHITE (empty) sclera inside,
- a round IRIS drawn as a thin black outline (not filled),
- a small solid black PUPIL in the centre,
- a tiny white catchlight dot on the pupil.
Keep the eyes the same size, position, spacing, and cute expression as now — just open and outline them instead of filling them solid black.

Do NOT change anything else: every other line, shape, character, and the whole composition and framing must stay the same, in the exact same clean black-line-on-white style. Output only clean black line art on a pure white background — no colour, no grey shading, no fills anywhere except the small pupils.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    instruction: { type: 'string' },
    samples: { type: 'string', short: 'n' },
    temperature: { type: 'string', short: 't' },
  },
});
if (!positionals.length) fail('give one or more pages, e.g. "creatures/mermaid-tall"');
if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is not set.');
const instruction = values.instruction ?? DEFAULT_INSTRUCTION;
const samples = values.samples === undefined ? 1 : Number(values.samples);
if (!(Number.isInteger(samples) && samples >= 1)) fail('--samples must be a positive integer');
const baseTemp = values.temperature === undefined ? 0.4 : Number(values.temperature);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function editLineArt(imageBytes, temperature) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/webp',
              data: Buffer.from(imageBytes).toString('base64'),
            },
          },
          { text: instruction },
        ],
      },
    ],
    config: {
      abortSignal: AbortSignal.timeout(120_000),
      ...(temperature === undefined ? {} : { temperature }),
    },
  });
  const classified = classifyGeminiResponse(response);
  if (classified.kind !== 'image') throw new Error(`${classified.kind}: ${classified.reason}`);
  return Buffer.from(classified.data, 'base64');
}

// Normalize the model output back to a clean black-on-white coloring page at the
// source resolution: grayscale, gentle contrast to whiten a faintly-grey ground
// and deepen the lines, keep antialiasing (no hard threshold — that jaggies the
// lines and would fail the twin generators' alignment).
async function normalize(buf, width, height) {
  return sharp(buf)
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .linear(1.25, -18)
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

for (const arg of positionals) {
  const src = join(COLORING_DIR, `${arg}.webp`);
  if (!existsSync(src)) {
    console.warn(`(skip) no line art at ${src}`);
    continue;
  }
  const source = await readFile(src);
  const { width, height } = await sharp(source).metadata();
  for (let i = 0; i < samples; i++) {
    process.stdout.write(`${arg}${samples > 1 ? `  ${i + 1}/${samples}` : ''} ... `);
    try {
      const temperature = Math.min(1.5, baseTemp + i * 0.15);
      const edited = await editLineArt(source, temperature);
      const out = await normalize(edited, width, height);
      const dest = join(OUT_DIR, samples > 1 ? `${arg}.sample-${i + 1}.webp` : `${arg}.webp`);
      await mkdir(dirname(dest), { recursive: true });
      await sharp(out).toFile(dest);
      console.log(`ok -> ${dest}`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }
}
console.log('Done. Review in .coloring-samples-dark/retouch/ before copying over web/static.');
