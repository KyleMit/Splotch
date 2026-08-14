import type { GenerateContentResponse } from '@google/genai';

// Classifies a Gemini image-generation response so lib/gemini.mjs can tell a
// *safety refusal* apart from a genuine upstream/empty failure worth retrying.
//
// This lives here, in the capability that owns its only remaining callers,
// because the app no longer calls Gemini at all (ADR-0113) — the asset pipeline
// is the last thing in the repo that does. Kept dependency-free apart from the
// erased type import, because those callers are plain .mjs reaching it through
// --experimental-strip-types.
//
// `isSafetyError` came across with it and has no caller here: an asset run wants
// a thrown provider error to stay thrown and fail the run loudly, rather than be
// reclassified into a refusal a batch script would shrug off.

export type SafetyClassification =
  | { kind: 'image'; data: string; mimeType: string }
  | { kind: 'safety'; reason: string }
  | { kind: 'empty'; reason: string };

// finishReason / blockReason values that mean the model deliberately withheld
// content on policy grounds — distinct from a transport or server error.
const SAFETY_REASONS = new Set([
  'SAFETY',
  'IMAGE_SAFETY',
  'PROHIBITED_CONTENT',
  'RECITATION',
  'BLOCKLIST',
  'SPII',
]);

export function classifyGeminiResponse(response: GenerateContentResponse): SafetyClassification {
  // A prompt-level block: the request never reached generation.
  const blockReason = response?.promptFeedback?.blockReason;
  if (blockReason) return { kind: 'safety', reason: String(blockReason) };

  const candidate = response?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];

  const imagePart = parts.find((p) => p.inlineData?.data);
  if (imagePart) {
    return {
      kind: 'image',
      data: imagePart.inlineData!.data!,
      mimeType: imagePart.inlineData!.mimeType || 'image/png',
    };
  }

  // No image: a policy finishReason means it was refused on safety grounds.
  const finishReason = candidate?.finishReason;
  if (finishReason && SAFETY_REASONS.has(String(finishReason))) {
    return { kind: 'safety', reason: String(finishReason) };
  }

  // No image, but the model answered in prose. For an image-generation model
  // that means it declined to draw (often a content refusal like "I cannot
  // fulfill this request") rather than a transient failure — Gemini does not
  // always attach an IMAGE_SAFETY finishReason to such refusals. Treat it as a
  // safety refusal so the child is guided to a different drawing instead of a
  // "try again" that can never succeed.
  const textPart = parts.find((p) => typeof p.text === 'string' && p.text.trim());
  if (textPart) return { kind: 'safety', reason: textPart.text! };

  // Nothing usable at all — a genuine empty/upstream failure (retryable).
  return { kind: 'empty', reason: String(finishReason ?? 'no image part returned') };
}

// A thrown Gemini error usually means a real API failure (auth, quota, 5xx), but
// the SDK can also throw on blocked content. Treat the latter as a safety refusal
// so the UI guides the child to a different drawing rather than "try again".
export function isSafetyError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const msg = (err instanceof Error ? err.message : String(err)).toUpperCase();
  // A 400 INVALID_ARGUMENT is a *request* error (a bad field/value), not a content
  // refusal — don't let category names that appear in such a message (e.g.
  // "safety_settings", "HARM_CATEGORY_…") get mistaken for a safety block.
  if (/INVALID_ARGUMENT|INVALID VALUE AT/.test(msg)) return false;
  if (status === 400 && /BLOCKED|PROHIBIT|SAFETY POLICY/.test(msg)) return true;
  return /PROHIBITED_CONTENT|IMAGE_SAFETY/.test(msg);
}
