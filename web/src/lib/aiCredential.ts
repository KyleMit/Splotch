import { apiUrl } from '$lib/api';
import { looksLikeApiKey, looksLikeRetiredGeminiKey } from '$lib/ai/keyFormat';

export { looksLikeApiKey };

// A value that isn't an API key is treated as a secret access code and checked
// against the managed allowlist instead — except a Google key, which is neither.
// It would fail the allowlist and be reported as an invalid access code, which
// is true but useless; naming it is what lets a parent who set one up before the
// provider migration (ADR-0113) understand what to do.
export type CredentialKind = 'apiKey' | 'accessCode' | 'retiredGeminiKey';

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
  // Recognised locally and never sent: a key for a provider the app no longer
  // calls cannot pass either endpoint, and putting a credential on the wire to
  // learn that is both pointless and worse for the parent's key.
  if (looksLikeRetiredGeminiKey(value)) return { kind: 'retiredGeminiKey', ok: false };

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
