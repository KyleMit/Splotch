import type { GenerateContentResponse } from '@google/genai';

// Classifies a Gemini image-generation response so /api/generate-image can tell
// a *safety refusal* (the child should draw something else) apart from a genuine
// upstream/empty failure (try again). See ADR-0023.

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
  'SPII'
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
      mimeType: imagePart.inlineData!.mimeType || 'image/png'
    };
  }

  // No image: a policy finishReason means it was refused on safety grounds.
  const finishReason = candidate?.finishReason;
  if (finishReason && SAFETY_REASONS.has(String(finishReason))) {
    return { kind: 'safety', reason: String(finishReason) };
  }

  const textPart = parts.find((p) => typeof p.text === 'string');
  return { kind: 'empty', reason: textPart?.text || String(finishReason ?? 'no image part returned') };
}

// A thrown Gemini error usually means a real API failure (auth, quota, 5xx), but
// the SDK can also throw on blocked content. Treat the latter as a safety refusal
// so the UI guides the child to a different drawing rather than "try again".
export function isSafetyError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const msg = (err instanceof Error ? err.message : String(err)).toUpperCase();
  if (status === 400 && /SAFET|PROHIBIT|BLOCK/.test(msg)) return true;
  return /PROHIBITED_CONTENT|IMAGE_SAFETY/.test(msg);
}
