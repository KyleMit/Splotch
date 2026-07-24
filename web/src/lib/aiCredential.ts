import { apiUrl } from '$lib/api';

const GEMINI_KEY_PREFIX = 'AIza';

// Gemini API keys are issued in the form "AIza…". Anything else is treated as a
// secret access code and checked against the managed allowlist instead.
export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(GEMINI_KEY_PREFIX);
}

export type CredentialKind = 'apiKey' | 'accessCode';

export interface VerifyCredentialResult {
  kind: CredentialKind;
  ok: boolean;
  accessCode?: string;
  error?: string;
}

type VerifyResponse = { ok?: boolean; error?: string; accessCode?: string };

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
  const data: VerifyResponse = await res.json().catch(() => ({}));

  return {
    kind,
    ok: res.ok && data.ok === true,
    accessCode: data.accessCode,
    error: data.error,
  };
}
