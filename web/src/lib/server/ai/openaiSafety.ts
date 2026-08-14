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

// Machine-readable policy signals, in the two places the API reports one. These
// are checked before any prose, because the alternative — inferring policy from
// whether the model happened to say something — gets both directions wrong: an
// upstream failure that arrives with an apology becomes a 422 telling the child
// to draw something different, and a policy block that arrives silently becomes
// a 502 inviting a retry that can never succeed.
const POLICY_ERROR_CODES = new Set([
  'moderation_blocked',
  'content_policy_violation',
  'image_content_policy_violation',
]);
const POLICY_INCOMPLETE_REASONS = new Set(['content_filter']);

function policySignal(response: OpenAiResponse): string | null {
  const code = response?.error?.code;
  if (code && POLICY_ERROR_CODES.has(code)) return response.error?.message || code;
  const reason = response?.incomplete_details?.reason;
  if (reason && POLICY_INCOMPLETE_REASONS.has(reason)) return reason;
  return null;
}

/** The prose the model answered with, across every message part. */
function messageText(response: OpenAiResponse): string {
  return (response?.output ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .map((part) => ('refusal' in part ? part.refusal : 'text' in part ? part.text : ''))
    .join(' ')
    .trim();
}

/**
 * The image tool's own terminal states. A tool call that ran and failed is an
 * upstream failure, not a policy decision — the model's policy decision is to
 * not call the tool at all.
 */
export function classifyOpenAiResponse(response: OpenAiResponse): SafetyClassification {
  const output = response?.output ?? [];

  const call = output.find((item) => item.type === 'image_generation_call');
  if (call?.result) {
    return { kind: 'image', data: call.result, mimeType: `image/${outputFormatOf(call)}` };
  }

  const policy = policySignal(response);
  if (policy) return { kind: 'safety', reason: policy };

  // The tool was called and did not produce bytes. Whatever the model said
  // alongside that, the drawing was not declined — something broke mid-render,
  // and the child should be offered the same drawing again rather than told to
  // draw a different one.
  const shape = output
    .map((item) => `${item.type}${'status' in item && item.status ? `:${item.status}` : ''}`)
    .join(', ');
  const describeFailure = () =>
    response?.error?.message ??
    `no image (status ${response?.status ?? 'unknown'}; output: ${shape || 'none'})`;
  if (call) return { kind: 'empty', reason: describeFailure() };

  // No tool call at all, but the model said something: it read the drawing and
  // chose not to draw it. A `refusal` content part is the SDK's typed decline
  // and a plain `text` part is the model following the system instruction's
  // "reply with one short sentence" — either way, guide the child to a different
  // drawing rather than a "try again" that can never succeed.
  const message = messageText(response);
  if (message) return { kind: 'safety', reason: message };

  // Nothing usable at all — a genuine empty/upstream failure (retryable).
  return { kind: 'empty', reason: describeFailure() };
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
