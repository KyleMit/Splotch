import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { classifyGeminiResponse, isSafetyError } from './geminiSafety';
import type { AiImageProvider } from './provider';

// The Gemini implementation of the AiImageProvider seam (ADR-0047). This module
// (plus geminiSafety.ts) is the only place the app touches @google/genai — a
// model deprecation or vendor swap happens here, not in the routes.

const IMAGE_MODEL = 'gemini-2.5-flash-image';
// A cheap text model is enough to prove a key authenticates with Gemini — the
// image model used for generation lives on the same key, so a successful auth
// here means the key is good to go.
const KEY_CHECK_MODEL = 'gemini-2.5-flash';

// The audience is toddlers (2+), so the model must REFUSE unsafe drawings rather
// than do what it does by default — quietly "beautify" a gun into a gilded gun or
// anatomy into a tower. We tell it to decline in plain text instead of drawing;
// that text-only reply is classified as a safety refusal by geminiSafety.ts.
// See ADR-0023.
const SAFETY_SYSTEM_INSTRUCTION = `You turn a young child's drawing into a polished, whimsical illustration for Splotch, a drawing app for toddlers aged 2 and up. The result must be appropriate for a 2-year-old.

If the drawing depicts or implies ANY of the following, do NOT generate an image:
- a realistic weapon or one used to harm (a real-looking gun, a knife used as a weapon), real violence, blood, gore, or self-harm;
- nudity, genitalia, or sexual content;
- a hate symbol, extremist imagery, slurs, or offensive text;
- drugs, alcohol, or other adult or dangerous content.

Ordinary toddler pretend-play IS welcome — render it as cheerful, obviously make-believe cartoon art. A toy, foam, cartoon, knight's, or pirate's sword, a magic wand, a toy / water / bubble blaster, costume or superhero props, and friendly dragons or monsters are all fine.

When you must refuse, respond with a single short sentence declining, e.g. "I can't turn that drawing into a picture — let's draw something else!". Never sanitize, beautify, or partially transform genuinely unsafe content into a "nicer" version — refuse it entirely. When a drawing is clearly playful and non-graphic, generate the image.`;

// Tighten every configurable harm category to its most aggressive setting. These
// only affect the configurable categories — the always-on child-safety filter is
// separate — but lowering them increases refusals of borderline drawings. The
// SDK also exports `HARM_CATEGORY_IMAGE_*` enums, but the gemini-2.5-flash-image
// v1beta endpoint rejects them with a 400, so only the standard categories here.
const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_HARASSMENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE }));

export const geminiProvider: AiImageProvider = {
  async generateImage({ apiKey, image, prompt }) {
    const ai = new GoogleGenAI({ apiKey });
    let response;
    try {
      response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: image.mimeType, data: image.base64 } },
              { text: prompt },
            ],
          },
        ],
        config: {
          abortSignal: AbortSignal.timeout(120_000),
          systemInstruction: SAFETY_SYSTEM_INSTRUCTION,
          safetySettings: SAFETY_SETTINGS,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = (err as { status?: number }).status;
      console.error(`Gemini call failed (${status ?? 'unknown'}): ${msg.split('\n')[0]}`);
      // The SDK can throw on blocked content — route that to the refusal path too.
      if (isSafetyError(err)) return { kind: 'refusal', reason: msg.split('\n')[0] };
      return { kind: 'error', reason: `Gemini request failed: ${msg}` };
    }

    const classified = classifyGeminiResponse(response);
    if (classified.kind === 'safety') return { kind: 'refusal', reason: classified.reason };
    if (classified.kind === 'empty')
      return { kind: 'error', reason: `Model did not return an image: ${classified.reason}` };
    return classified;
  },

  async verifyKey(apiKey) {
    const ai = new GoogleGenAI({ apiKey });
    try {
      await ai.models.generateContent({
        model: KEY_CHECK_MODEL,
        contents: 'ping',
        // Keep the probe as small as possible — no thinking, one output token.
        config: { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 1 },
      });
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
    return { ok: true };
  },
};
