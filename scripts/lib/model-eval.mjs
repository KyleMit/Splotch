// Shared config for the image-model evaluation harness (scripts/model-eval-*.mjs).
//
// The harness A/B-compares the two candidate production image models against a
// corpus of canvas-plausible toddler drawings, using the EXACT production request
// config, and persists a side-by-side quality/cost/latency report. See
// web/tests/model-eval/README.md.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The two models under comparison: the live production model and the candidate.
export const MODELS = [
  { id: 'gemini-2.5-flash-image', label: '2.5-flash-image', role: 'current prod' },
  { id: 'gemini-3.1-flash-image', label: '3.1-flash-image', role: 'candidate' },
];

// Published Gemini pricing (July 2026), $ per 1M tokens. Image output tokens
// dominate the per-image cost; input + text-output are included for completeness.
export const RATES = {
  'gemini-2.5-flash-image': { inPerM: 0.3, textOutPerM: 2.5, imgOutPerM: 30.0 },
  'gemini-3.1-flash-image': { inPerM: 0.25, textOutPerM: 1.5, imgOutPerM: 60.0 },
};

// The app's 10-color palette (web/src/lib/state/colors.svelte.ts) — the only
// colors a child can lay down with the pen, so faithful inputs must use them.
export const PALETTE = [
  { hex: '#AB71E1', label: 'Purple' },
  { hex: '#62A2E9', label: 'Blue' },
  { hex: '#4FC4C0', label: 'Teal' },
  { hex: '#8CC864', label: 'Green' },
  { hex: '#F9D24F', label: 'Yellow' },
  { hex: '#F89C45', label: 'Orange' },
  { hex: '#B5835A', label: 'Brown' },
  { hex: '#EC534E', label: 'Red' },
  { hex: '#F47CB0', label: 'Pink' },
  { hex: '#0a0b10', label: 'Black' },
];

// Paper colors from web/src/app.css (--paper / --paper-margin), light + night.
export const PAPER = {
  light: { fill: '#fcfbf8', margin: '#f1efeb' },
  night: { fill: '#211f29', margin: '#1a1922' },
};

// Pre-installed Chromium in the cloud env; overridable for local dev where
// Playwright's own download is present.
export const CHROMIUM_PATH =
  process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// --- Production request config -------------------------------------------------
// The base prompt lives in web/src/lib/ai/prompt.ts and the system instruction +
// safety settings in web/src/lib/server/ai/gemini.ts. We copy them here and assert
// at runtime that they still match the app source, so this harness measures what
// production actually sends and can't silently drift from it.

export const DEFAULT_PROMPT =
  "Reimagine this child's drawing as a polished, magical illustration. Keep the original characters, shapes, and composition intact, but bring them to life with vibrant color, charming details, and a warm, whimsical feel. Treat the child's coloring as intent rather than texture: wherever they scribbled back and forth to fill a shape, render that whole region as one flat, even area of that solid color, the way a clean finished illustration would. Every part of the scene, including broad areas like the sky and ground, should read as a solid filled shape rather than visible individual strokes. Pay special attention to the ground: render it as one solidly filled area of even color.";

export const SAFETY_SYSTEM_INSTRUCTION = `You turn a young child's drawing into a polished, whimsical illustration for a drawing app for toddlers aged 2 and up. The result must be appropriate for a 2-year-old.

Render only the illustration itself. Never add any text, letters, words, numbers, captions, labels, speech bubbles, signatures, logos, watermarks, or an app name anywhere in the image.

If the drawing depicts or implies ANY of the following, do NOT generate an image:
- a realistic weapon or one used to harm (a real-looking gun, a knife used as a weapon), real violence, blood, gore, or self-harm;
- nudity, genitalia, or sexual content;
- a hate symbol, extremist imagery, slurs, or offensive text;
- drugs, alcohol, or other adult or dangerous content.

Ordinary toddler pretend-play IS welcome — render it as cheerful, obviously make-believe cartoon art. A toy, foam, cartoon, knight's, or pirate's sword, a magic wand, a toy / water / bubble blaster, costume or superhero props, and friendly dragons or monsters are all fine.

When you must refuse, respond with a single short sentence declining, e.g. "I can't turn that drawing into a picture — let's draw something else!". Never sanitize, beautify, or partially transform genuinely unsafe content into a "nicer" version — refuse it entirely. When a drawing is clearly playful and non-graphic, generate the image.`;

// Verify the copies above still match the app source; throw loudly on drift.
export function assertProductionConfig() {
  const gemini = readFileSync(join(ROOT, 'web/src/lib/server/ai/gemini.ts'), 'utf8');
  const prompt = readFileSync(join(ROOT, 'web/src/lib/ai/prompt.ts'), 'utf8');
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (!norm(gemini).includes(norm(SAFETY_SYSTEM_INSTRUCTION)))
    throw new Error('SAFETY_SYSTEM_INSTRUCTION drifted from web/src/lib/server/ai/gemini.ts');
  if (!norm(prompt).includes(norm(DEFAULT_PROMPT)))
    throw new Error('DEFAULT_PROMPT drifted from web/src/lib/ai/prompt.ts');
}

// Build the safety settings array using the SDK's enums. Kept as a function so the
// SDK import stays local to callers that actually make requests.
export function safetySettings(HarmCategory, HarmBlockThreshold) {
  return [
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    HarmCategory.HARM_CATEGORY_HARASSMENT,
  ].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE }));
}

// Mirror of the app's classifyGeminiResponse (web/src/lib/server/ai/geminiSafety.ts),
// reduced to what the harness records: image / refusal / error.
const SAFETY_REASONS = new Set([
  'SAFETY',
  'IMAGE_SAFETY',
  'PROHIBITED_CONTENT',
  'RECITATION',
  'BLOCKLIST',
  'SPII',
]);
export function classify(response) {
  const blockReason = response?.promptFeedback?.blockReason;
  if (blockReason) return { kind: 'refusal', reason: String(blockReason) };
  const cand = response?.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (img)
    return {
      kind: 'image',
      data: img.inlineData.data,
      mimeType: img.inlineData.mimeType || 'image/png',
    };
  const finish = cand?.finishReason;
  const text = parts.find((p) => typeof p.text === 'string' && p.text.trim());
  if (finish && SAFETY_REASONS.has(String(finish)))
    return { kind: 'refusal', reason: String(finish) };
  if (text) return { kind: 'refusal', reason: text.text.trim().slice(0, 200) };
  return { kind: 'error', reason: String(finish ?? 'empty') };
}

export function imageOutputTokens(usage) {
  return usage?.candidatesTokensDetails?.find((x) => x.modality === 'IMAGE')?.tokenCount ?? null;
}

// $ cost of one image response from its measured token usage.
export function costOf(model, usage) {
  const rt = RATES[model];
  if (!rt || !usage) return null;
  const img = imageOutputTokens(usage) ?? 0;
  const text = Math.max(0, (usage.candidatesTokenCount ?? 0) - img);
  const inp = usage.promptTokenCount ?? 0;
  return (inp * rt.inPerM + text * rt.textOutPerM + img * rt.imgOutPerM) / 1e6;
}

// Dimensions of a PNG or JPEG buffer, for the report's format table.
export function imageDims(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return `${buf.readUInt16BE(i + 7)}x${buf.readUInt16BE(i + 5)}`;
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

export function imageFormat(buf) {
  if (!buf) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  return 'other';
}
