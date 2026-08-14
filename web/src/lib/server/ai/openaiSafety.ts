import type { Response as OpenAiResponse } from 'openai/resources/responses/responses';

// Classifies an OpenAI image-generation response so the adapter (openai.ts) can
// tell a *safety refusal* (the child should draw something else) apart from a
// genuine upstream/empty failure (try again). See ADR-0023.
//
// The shape this reads is why the app calls the Responses API rather than
// /v1/images/edits: the model is given the child-safety rules as a real system
// instruction and answers an unsafe drawing with a sentence instead of a picture,
// so a refusal arrives as prose the app can classify. /v1/images/edits cannot
// express that distinction: it either returns an image or throws an HTTP 400, and
// on this repo's red-team corpus it returned a finished image for a drawn gun.

export type SafetyClassification =
  | { kind: 'image'; data: string; mimeType: string }
  | { kind: 'safety'; reason: string }
  | { kind: 'empty'; reason: string };

// Every format the image tool can be asked to emit. The adapter never asks for
// anything else, so anything else on the wire is a response we don't understand.
const IMAGE_OUTPUT_FORMATS = ['png', 'jpeg', 'webp'] as const;
type ImageOutputFormat = (typeof IMAGE_OUTPUT_FORMATS)[number];

/**
 * The format the tool actually encoded. The SDK's `ImageGenerationCall` type does
 * not declare `output_format` even though the API returns it, so this is a
 * genuine untyped-boundary read — validated against the closed set above rather
 * than trusted, and defaulted to the tool's own default when absent.
 */
function outputFormatOf(call: object): ImageOutputFormat {
  const format = (call as { output_format?: unknown }).output_format;
  return IMAGE_OUTPUT_FORMATS.includes(format as ImageOutputFormat)
    ? (format as ImageOutputFormat)
    : 'png';
}

/**
 * The image tool's own terminal states. `completed` without bytes and any other
 * status are upstream failures, not policy decisions — the model's policy
 * decision is to not call the tool at all.
 */
export function classifyOpenAiResponse(response: OpenAiResponse): SafetyClassification {
  const output = response?.output ?? [];

  const call = output.find((item) => item.type === 'image_generation_call');
  if (call?.result) {
    return { kind: 'image', data: call.result, mimeType: `image/${outputFormatOf(call)}` };
  }

  // No picture, but the model said something. For an image-generation request
  // that means it declined to draw — a `refusal` content part is the SDK's typed
  // decline and a plain `text` part is the model following the system
  // instruction's "reply with one short sentence" — so treat either as a safety
  // refusal and guide the child to a different drawing rather than a "try again"
  // that can never succeed.
  const message = output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .map((part) => ('refusal' in part ? part.refusal : 'text' in part ? part.text : ''))
    .join(' ')
    .trim();
  if (message) return { kind: 'safety', reason: message };

  // Nothing usable at all — a genuine empty/upstream failure (retryable). Name
  // the output items that did arrive: an image call that stopped short reads
  // very differently from an empty output list, and the status alone says
  // neither.
  const shape = output
    .map((item) => `${item.type}${'status' in item && item.status ? `:${item.status}` : ''}`)
    .join(', ');
  return {
    kind: 'empty',
    reason:
      response?.error?.message ??
      `no image and no text (status ${response?.status ?? 'unknown'}; output: ${shape || 'none'})`,
  };
}

// A thrown OpenAI error usually means a real API failure (auth, quota, 5xx), but
// the platform's own moderation can also reject the request outright, before the
// model ever sees it. Treat that as a safety refusal so the UI guides the child
// to a different drawing rather than "try again".
export function isSafetyError(err: unknown): boolean {
  return (err as { code?: string })?.code === 'moderation_blocked';
}

// A key that authenticates but whose organization has not completed OpenAI's
// identity verification is rejected only when it tries to generate — the model
// is visible to it either way. That is a distinct, actionable failure for a
// parent using their own key, so it must not be reported as a generic outage.
const VERIFICATION_PATTERN = /organization must be verified|verify.{0,20}organization/i;

export function isVerificationError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err);
  return status === 403 && VERIFICATION_PATTERN.test(message);
}
