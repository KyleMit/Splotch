import { apiUrl } from '$lib/api';

// Gemini API keys are issued as classic "AIza…" Standard keys or the "AQ.…"
// Auth keys Google switched to in 2026. Anything else is treated as a secret
// access code and checked against the managed allowlist instead.
const GEMINI_KEY_PREFIXES = ['AIza', 'AQ.'] as const;

export function looksLikeApiKey(value: string): boolean {
  return GEMINI_KEY_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export type CredentialKind = 'apiKey' | 'accessCode';

type VerifyPayload = { ok?: boolean; error?: string; accessCode?: string };

export interface VerifyCredentialResult extends VerifyPayload {
  kind: CredentialKind;
  ok: boolean; // narrowed from optional to required — verifyCredential always sets it
}

// Classifies the entered value, calls the matching verify endpoint, and reports
// the outcome. Persisting the credential and the UI state machine stay with the
// caller; this owns only classification, endpoint routing, and the network call.
export async function verifyCredential(
  value: string,
  { signal }: { signal?: AbortSignal } = {}
): Promise<VerifyCredentialResult> {
  const kind: CredentialKind = looksLikeApiKey(value) ? 'apiKey' : 'accessCode';
  const endpoint = kind === 'apiKey' ? '/api/verify-key' : '/api/verify-access-code';
  const body = kind === 'apiKey' ? { apiKey: value } : { code: value };

  const res = await fetch(apiUrl(endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data: VerifyPayload = await res.json().catch(() => ({}));

  return {
    kind,
    ok: res.ok && data.ok === true,
    accessCode: data.accessCode,
    error: data.error,
  };
}
