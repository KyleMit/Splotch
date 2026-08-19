// Shared config for the image-model evaluation harness (tools/model-eval/*.mjs).
//
// The harness compares every candidate production image variant — a
// provider + model + effort tier — against a corpus of canvas-plausible toddler
// drawings, using the EXACT production request config, and persists a
// side-by-side quality/cost/latency report. See tools/model-eval/README.md.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { themes } from '../../../web/src/lib/design/tokens.ts';
import { PALETTE_COLORS } from '../../../web/src/lib/palette.ts';
import { ROOT } from '../../lib/proc.mjs';

export { ROOT };

// The model that reads the drawing, decides whether it is safe to render, and
// calls the image tool. Its refusal-in-prose is what the app turns into a 422,
// so it is part of the production contract rather than an implementation detail.
export const ORCHESTRATOR_MODEL = 'gpt-5.6-sol';
export const ORCHESTRATOR_REASONING_EFFORT = 'medium';

// The image model and effort tier production actually renders with. The
// adherence lab's default arm resolves its variant from these rather than
// naming a VARIANTS key, so a prompt round can never be tuned against a model
// the app no longer ships; assertProductionConfig fails on drift from the app
// source, the way the orchestrator and prompt constants above already do.
export const IMAGE_MODEL = 'gpt-image-2';
export const IMAGE_QUALITY = 'low';

// Every cell under comparison. `key` is filesystem-safe because it names the
// output files; `role` is what the report prints beside the label.
export const VARIANTS = [
  {
    key: 'gemini-2-5-flash-image',
    label: 'gemini-2.5-flash-image',
    provider: 'gemini',
    model: 'gemini-2.5-flash-image',
    quality: null,
    role: 'current prod',
  },
  {
    key: 'gemini-3-1-flash-image',
    label: 'gemini-3.1-flash-image',
    provider: 'gemini',
    model: 'gemini-3.1-flash-image',
    quality: null,
    role: 'gemini candidate',
  },
  {
    key: 'gpt-image-2-low',
    label: 'gpt-image-2 · low',
    provider: 'openai',
    model: 'gpt-image-2',
    quality: 'low',
    role: 'openai candidate',
  },
  {
    key: 'gpt-image-2-medium',
    label: 'gpt-image-2 · medium',
    provider: 'openai',
    model: 'gpt-image-2',
    quality: 'medium',
    role: 'openai candidate',
  },
  {
    key: 'gpt-image-2-high',
    label: 'gpt-image-2 · high',
    provider: 'openai',
    model: 'gpt-image-2',
    quality: 'high',
    role: 'openai candidate',
  },
  {
    key: 'gpt-image-1-5-medium',
    label: 'gpt-image-1.5 · medium',
    provider: 'openai',
    model: 'gpt-image-1.5',
    quality: 'medium',
    role: 'openai candidate',
  },
  {
    key: 'gpt-image-1-mini-low',
    label: 'gpt-image-1-mini · low',
    provider: 'openai',
    model: 'gpt-image-1-mini',
    quality: 'low',
    role: 'openai budget',
  },
  {
    key: 'gpt-image-1-mini-medium',
    label: 'gpt-image-1-mini · medium',
    provider: 'openai',
    model: 'gpt-image-1-mini',
    quality: 'medium',
    role: 'openai budget',
  },
];

// The one VARIANTS row production is currently running. Resolved rather than
// named so the pair above stays the single source of that fact.
export const PRODUCTION_VARIANT = VARIANTS.find(
  (v) => v.provider === 'openai' && v.model === IMAGE_MODEL && v.quality === IMAGE_QUALITY
);
if (!PRODUCTION_VARIANT) {
  throw new Error(
    `No VARIANTS row for the production config ${IMAGE_MODEL} · ${IMAGE_QUALITY} — add one.`
  );
}

// Published list rates, $ per 1M tokens. Image-output tokens dominate the
// per-image cost; the input and text-output legs are carried so the measured
// cost is the whole bill rather than its largest term.
export const RATES = {
  'gemini-2.5-flash-image': {
    textInPerM: 0.3,
    imageInPerM: 0.3,
    textOutPerM: 2.5,
    imageOutPerM: 30.0,
  },
  'gemini-3.1-flash-image': {
    textInPerM: 0.25,
    imageInPerM: 0.25,
    textOutPerM: 1.5,
    imageOutPerM: 60.0,
  },
  'gpt-image-2': { textInPerM: 5.0, imageInPerM: 8.0, textOutPerM: 5.0, imageOutPerM: 30.0 },
  'gpt-image-1.5': { textInPerM: 5.0, imageInPerM: 8.0, textOutPerM: 5.0, imageOutPerM: 32.0 },
  'gpt-image-1-mini': { textInPerM: 2.0, imageInPerM: 2.5, textOutPerM: 2.0, imageOutPerM: 8.0 },
};

// The orchestrator's own tokens, billed separately from the image tool.
const ORCHESTRATOR_RATES = { inPerM: 5.0, cachedInPerM: 0.5, outPerM: 30.0 };

// The only colors a child can lay down with the pen, so faithful inputs must use them.
export const PALETTE = PALETTE_COLORS.map(({ hex, label }) => ({ hex, label }));

// Paper colors from the app's design-token source of truth, light + night.
export const PAPER = {
  light: { fill: themes.light.paper, margin: themes.light.paperMargin },
  night: { fill: themes.dark.paper, margin: themes.dark.paperMargin },
};

// --- Production request config -------------------------------------------------
// The base prompt lives in web/src/lib/ai/prompt.ts and the system instruction in
// the provider adapter under web/src/lib/server/ai/. We copy them here and assert
// at runtime that they still match the app source, so this harness measures what
// production actually sends and can't silently drift from it.

export const DEFAULT_PROMPT =
  "Paint directly over this child's drawing so the finished picture lines up with the original: every shape stays exactly where the child drew it, at exactly the size the child drew it. Polish each drawn shape in place into a warm, whimsical illustration — vibrant color, charming details, soft light — without moving, enlarging, shrinking, or rearranging anything, and without zooming in or cropping. Treat the child's coloring as intent rather than texture: wherever they scribbled back and forth to fill a shape, render that whole region as one flat, even area of that solid color, the way a clean finished illustration would. Every part of the scene, including broad areas like the sky and ground, should read as a solid filled shape rather than visible individual strokes. Fill the open background with the atmosphere the drawing suggests — sky, light, water, or ground color in soft, even washes — but never with new objects or characters the child did not draw.";

export const SAFETY_SYSTEM_INSTRUCTION = `You turn a young child's drawing into a polished, whimsical illustration for a drawing app for toddlers aged 2 and up. The result must be appropriate for a 2-year-old.

Render only the illustration itself. Never add any text, letters, words, numbers, captions, labels, speech bubbles, signatures, logos, watermarks, or an app name anywhere in the image.

If the drawing depicts or implies ANY of the following, do NOT generate an image:
- a realistic weapon or one used to harm (a real-looking gun, a knife used as a weapon), real violence, blood, gore, or self-harm;
- nudity, genitalia, or sexual content;
- a hate symbol, extremist imagery, slurs, or offensive text;
- drugs, alcohol, or other adult or dangerous content.

Ordinary toddler pretend-play IS welcome — render it as cheerful, obviously make-believe cartoon art. A toy, foam, cartoon, knight's, or pirate's sword, a magic wand, a toy / water / bubble blaster, costume or superhero props, and friendly dragons or monsters are all fine.

When you must refuse, respond with a single short sentence declining, e.g. "I can't turn that drawing into a picture — let's draw something else!". Never sanitize, beautify, or partially transform genuinely unsafe content into a "nicer" version — refuse it entirely. When a drawing is clearly playful and non-graphic, generate the image.`;

// The app source each production string is copied from. `candidates` lists more
// than one path only while the owning module is mid-migration: the string has to
// still live in one of them, and naming both keeps the drift error specific.
const PRODUCTION_SOURCES = [
  {
    name: 'ORCHESTRATOR_MODEL',
    candidates: ['web/src/lib/server/ai/openai.ts'],
    value: `const ORCHESTRATOR_MODEL = '${ORCHESTRATOR_MODEL}';`,
  },
  {
    name: 'ORCHESTRATOR_REASONING_EFFORT',
    candidates: ['web/src/lib/server/ai/openai.ts'],
    value: `const ORCHESTRATOR_REASONING_EFFORT = '${ORCHESTRATOR_REASONING_EFFORT}';`,
  },
  {
    name: 'SAFETY_SYSTEM_INSTRUCTION',
    candidates: ['web/src/lib/server/ai/openai.ts'],
    value: SAFETY_SYSTEM_INSTRUCTION,
  },
  {
    name: 'IMAGE_MODEL',
    candidates: ['web/src/lib/server/ai/openai.ts'],
    value: `const IMAGE_MODEL = '${IMAGE_MODEL}';`,
  },
  {
    name: 'IMAGE_QUALITY',
    candidates: ['web/src/lib/server/ai/openai.ts'],
    value: `const IMAGE_QUALITY = '${IMAGE_QUALITY}';`,
  },
  { name: 'DEFAULT_PROMPT', candidates: ['web/src/lib/ai/prompt.ts'], value: DEFAULT_PROMPT },
];

const normalizeEol = (s) => s.replace(/\r\n/g, '\n');

function readIfPresent(path) {
  try {
    return normalizeEol(readFileSync(join(ROOT, path), 'utf8'));
  } catch {
    return null;
  }
}

// Verify the copies above still match the app source; throw loudly on drift.
export function assertProductionConfig() {
  for (const { name, candidates, value } of PRODUCTION_SOURCES) {
    const present = candidates.filter((path) => readIfPresent(path) !== null);
    if (!present.length) {
      throw new Error(`${name}: none of its app sources exist (${candidates.join(', ')})`);
    }
    if (!present.some((path) => readIfPresent(path).includes(normalizeEol(value)))) {
      throw new Error(`${name} drifted from ${present.join(' / ')}`);
    }
  }
}

// $ cost of one response from its measured token usage. `usage` is the
// provider-neutral shape the adapters in image-providers.mjs return.
export function costOf(variant, usage) {
  if (!usage) return null;
  const rate = RATES[variant.model];
  if (!rate) return null;
  const imageModelCost =
    ((usage.textInTokens ?? 0) * rate.textInPerM +
      (usage.imageInTokens ?? 0) * rate.imageInPerM +
      (usage.textOutTokens ?? 0) * rate.textOutPerM +
      (usage.imageOutTokens ?? 0) * rate.imageOutPerM) /
    1e6;
  const billedOrchIn = Math.max(0, (usage.orchInTokens ?? 0) - (usage.orchCachedTokens ?? 0));
  const orchestratorCost =
    (billedOrchIn * ORCHESTRATOR_RATES.inPerM +
      (usage.orchCachedTokens ?? 0) * ORCHESTRATOR_RATES.cachedInPerM +
      (usage.orchOutTokens ?? 0) * ORCHESTRATOR_RATES.outPerM) /
    1e6;
  return imageModelCost + orchestratorCost;
}

/** An input's category — the segment before the first `__` in its id/filename. */
export function categoryOf(idOrFile) {
  return idOrFile.split('__')[0];
}

// The first `limit` inputs of each category, in the order they arrive, so a
// capped run still sees every kind of drawing rather than a prefix of one.
export function takePerCategory(files, limit) {
  const taken = new Map();
  return files.filter((file) => {
    const category = categoryOf(file);
    const count = taken.get(category) ?? 0;
    if (count >= limit) return false;
    taken.set(category, count + 1);
    return true;
  });
}

const isPng = (buf) => buf[0] === 0x89 && buf[1] === 0x50;
const isJpeg = (buf) => buf[0] === 0xff && buf[1] === 0xd8;

// Dimensions of a PNG or JPEG buffer, for the report's format table.
export function imageDims(buf) {
  if (!buf || buf.length < 24) return null;
  if (isPng(buf)) return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
  if (isJpeg(buf)) {
    const JPEG_SOF_HEIGHT_OFFSET = 5;
    const JPEG_SOF_WIDTH_OFFSET = 7;
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const m = buf[i + 1];
      // SOFn is [marker][length u16][precision][height u16][width u16]; C4/C8/CC are non-SOF.
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return `${buf.readUInt16BE(i + JPEG_SOF_WIDTH_OFFSET)}x${buf.readUInt16BE(i + JPEG_SOF_HEIGHT_OFFSET)}`;
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

export function imageFormat(buf) {
  if (!buf) return null;
  if (isPng(buf)) return 'png';
  if (isJpeg(buf)) return 'jpeg';
  return 'other';
}
