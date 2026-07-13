// EXPERIMENT (idea #9) — light-fill generation conditioned on the SIBLING
// orientation's shipped punched light fill, so the same subject keeps the same
// palette in tall and wide. Copy of gen-coloring-fills.mjs's core loop with a
// second inline image (the palette reference) and an appended prompt block.
// Writes candidates to an --out dir (NOT fill-src). Standard gates unchanged.
//
//   node --experimental-strip-types tools/asset-gen/gen-coloring-fills-cond.mjs \
//     creatures/dragon-wide --ref creatures/dragon-tall --out <dir> [--max-attempts 4] [-t 0.4]
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { COLORING_DIR, fail } from './lib/paths.mjs';
import { outlineMatch, KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from './lib/outline-match.mjs';
import { alignToSource } from './lib/align-to-source.mjs';
import { scoreEyeFill, judgeLightEyes } from './lib/eye-fill.mjs';
import { classifyGeminiResponse } from '../../web/src/lib/server/ai/geminiSafety.ts';

const MODEL = 'gemini-2.5-flash-image';

// The proven single-image edit prompt from gen-coloring-fills.mjs, verbatim.
const TEXT_PALETTE_PROMPT = `You are given a black-and-white coloring-book page for a toddler. Color it in neatly, exactly like a completed page in a coloring book.

ABSOLUTE RULES — the colored image must line up perfectly on top of the original:
- Keep every black outline exactly where it is. Do not move, redraw, thicken, thin, smooth, or erase a single line. The black line art must be pixel-for-pixel identical to the original.
- Do not add any new lines, outlines, details, decorations, patterns, textures, letters, or objects. Only add color to the empty white areas that are already there.
- Do not crop, zoom, rotate, shift, or resize the picture. Keep the exact same composition, framing, and margins.

COLORING STYLE:
- Fill each region with one solid, flat, even color. No gradients, no shading, no highlights, no shadows, no extra outlines around the fills, no crayon or paint texture.
- Choose simple, cheerful, natural colors that suit each part of the picture.
- EYES: fill each outlined pupil solid BLACK, leave the small catchlight circle inside it pure white, and keep the surrounding eyeball white or a very pale tint — a classic lively cartoon eye.
- Stay inside the lines; every fill should butt right up against the black outline without covering it.

FILL EVERYTHING — no blank white:
- Every enclosed region must be filled with a color, including the whole background and sky. No area may be left as plain white paper, because a blank area would look uncolored.
- Things that are normally white must still get a soft tint instead of pure white: color clouds, snow, the moon, teeth, white fur or white clothing a pale cream or very light pastel; color a plain background a light color (for example a soft sky blue behind an outdoor scene, or a gentle cream/pastel behind a single object).
- The ONLY places allowed to stay pure white are tiny highlights, such as a small glint in an eye or a little shine dot.

The result must look like the identical line drawing, fully colored in with clean flat colors and no blank white gaps.`;
const WEBP_QUALITY = 90;

const FILL_PROMPT = `You are given TWO images.

IMAGE 1 is a black-and-white coloring-book page for a toddler. Color IT in neatly, exactly like a completed page in a coloring book.

IMAGE 2 is a SMALL THUMBNAIL used only as a PALETTE REFERENCE: the very same character/subject, already colored, in a DIFFERENT drawing (different pose and framing). It is NOT the page to produce — never reproduce IMAGE 2, its pose, its framing, or its aspect ratio. Use it ONLY to choose colors:
- Give every part of the subject the SAME color it has in IMAGE 2 (same body color, same belly, same horns/spots/accessories).
- Background and scenery colors should also stay in the same families as IMAGE 2 where the same things appear.
- Do NOT copy IMAGE 2's composition, pose, framing, or line work. The drawing must be IMAGE 1's drawing, only colored.

ABSOLUTE RULES — the colored image must line up perfectly on top of IMAGE 1:
- Keep every black outline of IMAGE 1 exactly where it is. Do not move, redraw, thicken, thin, smooth, or erase a single line. The black line art must be pixel-for-pixel identical to IMAGE 1.
- Do not add any new lines, outlines, details, decorations, patterns, textures, letters, or objects. Only add color to the empty white areas that are already there.
- Do not crop, zoom, rotate, shift, or resize the picture. Keep IMAGE 1's exact composition, framing, and margins.

COLORING STYLE:
- Fill each region with one solid, flat, even color. No gradients, no shading, no highlights, no shadows, no extra outlines around the fills, no crayon or paint texture.
- EYES: fill each outlined pupil solid BLACK, leave the small catchlight circle inside it pure white, and keep the surrounding eyeball white or a very pale tint — a classic lively cartoon eye.
- Stay inside the lines; every fill should butt right up against the black outline without covering it.

FILL EVERYTHING — no blank white:
- Every enclosed region must be filled with a color, including the whole background and sky. No area may be left as plain white paper.
- Things that are normally white must still get a soft tint instead of pure white.
- The ONLY places allowed to stay pure white are tiny highlights, such as a small glint in an eye.

The output image must have IMAGE 1's exact aspect ratio, framing, and line art. It must look like IMAGE 1's identical line drawing, fully colored in with clean flat colors, wearing IMAGE 2's palette. Producing IMAGE 2's drawing is a failure.`;

async function generateConditioned(ai, { imageBytes, refBytes, temperature, paletteText }) {
  const parts = paletteText
    ? [
        { inlineData: { mimeType: 'image/webp', data: Buffer.from(imageBytes).toString('base64') } },
        { text: TEXT_PALETTE_PROMPT + '\n\nCOLOR PLAN — this exact character appears in a sibling page already; match its palette so the character looks the same:\n' + paletteText },
      ]
    : [
        { inlineData: { mimeType: 'image/webp', data: Buffer.from(imageBytes).toString('base64') } },
        { inlineData: { mimeType: 'image/webp', data: Buffer.from(refBytes).toString('base64') } },
        { text: FILL_PROMPT },
      ];
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts }],
    config: { abortSignal: AbortSignal.timeout(120_000), ...(temperature === undefined ? {} : { temperature }) },
  });
  const classified = classifyGeminiResponse(response);
  if (classified.kind !== 'image') throw new Error(`${classified.kind}: ${classified.reason}`);
  return Buffer.from(classified.data, 'base64');
}

const WHITE_LEVEL = 248;
async function whiteFraction(buf) {
  const { data, info } = await sharp(buf).resize(360, 360, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let white = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i] >= WHITE_LEVEL && data[i + 1] >= WHITE_LEVEL && data[i + 2] >= WHITE_LEVEL) white++;
  }
  return white / (info.width * info.height);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    ref: { type: 'string' },
    out: { type: 'string' },
    temperature: { type: 'string', short: 't' },
    'max-attempts': { type: 'string' },
    'ref-size': { type: 'string' },
    'palette-text': { type: 'string' },
  },
});
if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is not set.');
const [page] = positionals;
if (!page || !values.out || (!values.ref && !values['palette-text'])) fail('need <page> --out <dir> and --ref or --palette-text');
const maxAttempts = values['max-attempts'] ? Number(values['max-attempts']) : 4;
const baseTemp = values.temperature === undefined ? 0.4 : Number(values.temperature);

const source = await readFile(join(COLORING_DIR, `${page}.outline.webp`));
let refBytes = values.ref ? await readFile(join(COLORING_DIR, `${values.ref}.light.webp`)) : null; // shipped PUNCHED fill
if (values['ref-size']) {
  refBytes = await sharp(refBytes).resize(Number(values['ref-size']), Number(values['ref-size']), { fit: 'inside' }).webp({ quality: 88 }).toBuffer();
}
const { width, height } = await sharp(source).metadata();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
await mkdir(values.out, { recursive: true });

const WHITE_THRESHOLD = 0.05;
const passes = (c) =>
  c.keep >= KEEP_THRESHOLD && c.localKeep >= LOCAL_KEEP_THRESHOLD && c.white <= WHITE_THRESHOLD && c.eyesOk;

let best = null;
for (let attempt = 0; attempt < maxAttempts; attempt++) {
  const temperature = Math.min(2, baseTemp + attempt * 0.15);
  process.stdout.write(`attempt ${attempt + 1}/${maxAttempts} (t=${temperature.toFixed(2)}) ... `);
  try {
    const bytes = await generateConditioned(ai, { imageBytes: source, refBytes, temperature, paletteText: values['palette-text'] });
    const resized = await sharp(bytes).resize(width, height, { fit: 'fill' }).png().toBuffer();
    const { buffer: aligned, dx, dy } = await alignToSource(resized, source, width, height);
    const colored = await sharp(aligned).webp({ quality: WEBP_QUALITY }).toBuffer();
    const [{ keep, localKeep }, white, eyeScore] = await Promise.all([
      outlineMatch(source, colored),
      whiteFraction(colored),
      scoreEyeFill(colored, source),
    ]);
    const cand = { colored, keep, localKeep, white, eyesOk: judgeLightEyes(eyeScore).passes, attempt };
    const file = join(values.out, `attempt-${attempt + 1}.webp`);
    await writeFile(file, colored);
    console.log(
      `keep ${(keep * 100).toFixed(1)}%  local ${(localKeep * 100).toFixed(1)}%  white ${(white * 100).toFixed(1)}%  eyes ${cand.eyesOk ? 'ok' : 'FLAT'}  shift ${dx},${dy}  ${passes(cand) ? 'PASS' : 'fail'}`
    );
    const rank = (c) => (passes(c) ? 1000 : 0) + c.localKeep * 200 + (c.eyesOk ? 150 : 0) + (1 - c.white) * 100 + c.keep;
    if (!best || rank(cand) > rank(best)) best = cand;
    if (passes(cand)) break;
  } catch (err) {
    console.log(`FAILED (${err instanceof Error ? err.message : err})`);
  }
}
if (best) {
  await writeFile(join(values.out, 'best.webp'), best.colored);
  console.log(`best = attempt ${best.attempt + 1}`);
} else {
  fail('no candidate produced');
}
