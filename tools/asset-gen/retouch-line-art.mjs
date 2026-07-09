// Retouch a coloring-page's BASE LINE ART with Gemini image editing, for a
// "particularly hard section" that the color generators can't rescue downstream.
// The motivating case (ADR-0052 / night twins): in dark mode the line art is
// inverted and the eye's pupil is punched out of the reveal, so the eye is drawn
// by the outline, not the twin — a badly-shaped eye blows out (white blob) or
// sockets (dark hole) no matter how it's colored. The fix is to normalize the eye
// in the LINE ART to the canonical form that inverts cleanly: a solid pupil + one
// clear glare + no iris (invert maps pupil→white eyeball, glare→pupil).
//
// Writes candidates to the gitignored .coloring-samples-dark/retouch/ for review;
// it does NOT touch shipped assets. Once a retouched line art is approved, copy it
// over web/static/coloring/<cat>/<page>-<orient>.webp and regenerate the whole
// related suite from it (light .color.webp via gen-coloring-fills, night twin via
// gen-coloring-fills-dark, thumbnail via gen-coloring-thumbs), then re-review in the
// contact sheet's Combined view in BOTH light and dark. See tools/asset-gen/night-twins.md.
//
//   node --experimental-strip-types --disable-warning=ExperimentalWarning \
//     tools/asset-gen/retouch-line-art.mjs <cat/page-orient...> [--instruction "..."] [--samples N] [-t F]
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
import { COLORING_DIR, SAMPLES_DARK_DIR, fail } from './lib/paths.mjs';
import { classifyGeminiResponse } from '../../web/src/lib/server/ai/geminiSafety.ts';

const MODEL = 'gemini-2.5-flash-image';
const WEBP_QUALITY = 92;
const OUT_DIR = join(SAMPLES_DARK_DIR, 'retouch');

// Default edit: normalize eyes to the canonical "solid pupil + one clear glare,
// no iris" form. This is the eye shape that survives the dark-mode line-art invert
// (ADR-0052): the solid pupil inverts to a white eyeball and the single glare
// inverts to the pupil, so the eye reads correctly with NO reliance on the twin
// (the pupil region is punched out of the reveal). The load-bearing element is the
// GLARE — it becomes the pupil, so it must be present, single, and big enough; a
// too-small glare gives a featureless white blob in dark mode (the mermaid bug).
// See tools/asset-gen/night-twins.md ("Eyes" recipe). Written to touch ONLY the eyes.
const DEFAULT_INSTRUCTION = `This is a black-and-white children's COLORING PAGE — clean black outlines on a pure white background.

Fix ONLY the main character's EYES so each reads as a simple, cute cartoon eye in this exact canonical form:
- a bold SOLID BLACK pupil that fills most of the eye,
- a thin white sclera around it,
- NO separate iris ring or extra circles inside the eye,
- exactly ONE clear, MEDIUM-SIZED white CATCHLIGHT/GLARE highlight in the upper part of each pupil.
If an eye currently has a tiny or missing catchlight, ENLARGE or add a single clear one. If an eye is drawn "open"/outlined or has an iris ring, SIMPLIFY it back to a solid pupil with one glare. Both eyes must match, with the glare in the same spot on each.

Keep the eyes the same size, position, spacing, and happy expression. Change NOTHING else in the image — every other line, shape, character, and the whole composition and framing stay identical, in the exact same clean black-line-on-white style. Output only clean black line art on a pure white background — no colour, no grey shading.`;

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
