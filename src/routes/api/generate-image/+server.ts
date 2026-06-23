import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { STYLE_SUFFIXES } from '$lib/ai/styles';
import { isAllowedToken } from '$lib/server/tokens';
import { recordTokenUsage } from '$lib/server/usage';
import { rateLimit } from '$lib/server/rateLimit';
import { classifyGeminiResponse, isSafetyError } from '$lib/server/aiSafety';
import type { RequestHandler } from './$types';

// A safety refusal is the model declining the drawing on policy grounds — the
// child should try a *different* drawing, not retry the same one. We surface it
// as a distinct 422 (vs 502 for genuine upstream failures) so the client can
// show the right guidance. See ADR-0023.
const SAFETY_STATUS = 422;
function safetyRefusal(reason: string): never {
  throw error(SAFETY_STATUS, `Drawing was blocked for safety: ${reason}`);
}

const MODEL = 'gemini-2.5-flash-image';
// Burst guardrail for managed (non-BYOK) tokens, which spend *our* Gemini quota.
// A real generation takes several seconds, so back-to-back human use stays well
// under this; the cap only blunts a leaked token being hammered in a tight loop
// before we notice the usage tally and pull it. Per-instance like the verify
// limiters (resets on cold start) — a cost guardrail, not a hard boundary. BYOK
// requests bill the parent's own key and are intentionally not throttled.
const GENERATE_LIMIT = 15;
const GENERATE_WINDOW_MS = 60_000;
// A drawing screenshot is well under a megabyte; cap the upload so a valid-token
// holder can't push us into a memory/DoS situation by base64-ing a huge blob.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const DEFAULT_PROMPT =
  "Reimagine this child's drawing as a polished, magical illustration. Keep the original characters, shapes, and composition intact, but bring them to life with vibrant color, charming details, and a warm, whimsical feel.";

// The audience is toddlers (2+), so the model must REFUSE unsafe drawings rather
// than do what it does by default — quietly "beautify" a gun into a gilded gun or
// anatomy into a tower. We tell it to decline in plain text instead of drawing;
// that text-only reply is classified as a safety refusal (→ 422) by aiSafety.ts.
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
  HarmCategory.HARM_CATEGORY_HARASSMENT
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE }));

function buildPromptForStyle(
  style: FormDataEntryValue | null,
  defaultPrompt: string,
  suffixes: Record<string, string>
): string {
  const suffix = typeof style === 'string' && Object.hasOwn(suffixes, style) ? suffixes[style] : '';
  return suffix ? defaultPrompt + ' ' + suffix : defaultPrompt;
}

export const POST: RequestHandler = async ({ request, platform }) => {
  const form = await request.formData();
  const token = form.get('token');
  const apiKey = form.get('apiKey');
  const imageFile = form.get('image');
  const style = form.get('style');

  // Two ways in: the parent's own Gemini key (BYOK) bills their Google account
  // and skips the allowlist; otherwise a managed access token unlocks our key.
  const userKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const usingByok = userKey.length > 0;

  if (!usingByok && (typeof token !== 'string' || !(await isAllowedToken(token)))) {
    throw error(403, 'Invalid access token');
  }
  // Throttle valid managed tokens per token (so a leaked one can't be hammered
  // from many IPs to burn our quota). BYOK runs on the parent's own key, so skip.
  if (!usingByok) {
    const { limited, retryAfter } = rateLimit(`generate-image:${token}`, {
      limit: GENERATE_LIMIT,
      windowMs: GENERATE_WINDOW_MS
    });
    if (limited) {
      return new Response('Too many requests. Please wait a moment.', {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) }
      });
    }
  }
  if (!(imageFile instanceof Blob)) {
    throw error(400, 'Missing image');
  }
  if (imageFile.size > MAX_IMAGE_BYTES) {
    throw error(413, 'Image is too large');
  }
  // An empty type is fine (some Blobs arrive without one); only reject a type
  // that's present and not on the allowlist.
  if (imageFile.type && !ALLOWED_IMAGE_TYPES.includes(imageFile.type)) {
    throw error(415, 'Unsupported image type');
  }
  const effectiveKey = usingByok ? userKey : env.GEMINI_API_KEY;
  if (!effectiveKey) {
    throw error(500, 'Server is missing GEMINI_API_KEY');
  }

  const finalPrompt = buildPromptForStyle(style, DEFAULT_PROMPT, STYLE_SUFFIXES);

  // Only the managed tokens are worth a per-token tally (to spot one going
  // rogue). BYOK requests run on the parent's own quota, so just log them.
  if (usingByok) {
    console.log(`[ai-usage] byok style=${style || 'none'} at=${new Date().toISOString()}`);
  } else {
    // The synchronous audit log inside recordTokenUsage runs immediately; only
    // the Blobs write is async, and we don't make the image wait on it. waitUntil
    // keeps the function alive long enough to finish on Netlify; without it
    // (local dev) it's a fire-and-forget whose errors are caught internally.
    const usage = recordTokenUsage(token as string, {
      style: typeof style === 'string' ? style : null,
      prompt: finalPrompt
    });
    const ctx = (platform as { context?: { waitUntil?: (p: Promise<unknown>) => void } } | undefined)
      ?.context;
    if (ctx?.waitUntil) ctx.waitUntil(usage);
  }

  const inputBytes = new Uint8Array(await imageFile.arrayBuffer());
  const inputBase64 = Buffer.from(inputBytes).toString('base64');

  const ai = new GoogleGenAI({ apiKey: effectiveKey });
  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: imageFile.type || 'image/png', data: inputBase64 } },
            { text: finalPrompt }
          ]
        }
      ],
      config: {
        abortSignal: AbortSignal.timeout(120_000),
        systemInstruction: SAFETY_SYSTEM_INSTRUCTION,
        safetySettings: SAFETY_SETTINGS
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number }).status;
    console.error(`Gemini call failed (${status ?? 'unknown'}): ${msg.split('\n')[0]}`);
    // The SDK can throw on blocked content — route that to the safety path too.
    if (isSafetyError(err)) safetyRefusal(msg.split('\n')[0]);
    throw error(502, `Gemini request failed: ${msg}`);
  }

  const classified = classifyGeminiResponse(response);
  if (classified.kind === 'safety') safetyRefusal(classified.reason);
  if (classified.kind === 'empty') throw error(502, `Model did not return an image: ${classified.reason}`);

  const outBytes = Buffer.from(classified.data, 'base64');
  return new Response(outBytes, {
    headers: {
      'Content-Type': classified.mimeType,
      'Cache-Control': 'no-store'
    }
  });
}
