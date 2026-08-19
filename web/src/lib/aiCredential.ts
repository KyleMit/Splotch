import { apiUrl } from '$lib/api';
import {
  KEY_CHECK_UNAVAILABLE_CODE,
  looksLikeApiKey,
  looksLikeRetiredGeminiKey,
} from '$lib/ai/keyFormat';
import type { VerifyAccessCodeResponse } from '../routes/api/verify-access-code/+server';
import type { VerifyKeyResponse } from '../routes/api/verify-key/+server';

export { looksLikeApiKey };

// A value that isn't an API key is treated as a secret access code and checked
// against the managed allowlist instead — except a Google key, which is neither.
// It would fail the allowlist and be reported as an invalid access code, which
// is true but useless; naming it is what lets a parent who set one up before the
// provider migration (ADR-0113) understand what to do.
export type CredentialKind =
  | 'apiKey'
  | 'accessCode'
  | 'retiredGeminiKey'
  /** The check never reached OpenAI — nothing was learned about the key. */
  | 'checkUnavailable';

type VerifyResponse = VerifyAccessCodeResponse | VerifyKeyResponse;
type VerifyError = Extract<VerifyResponse, { ok: false }>['error'];
type VerifiedAccessCode = Extract<VerifyAccessCodeResponse, { ok: true }>['accessCode'];

export interface VerifyCredentialResult {
  kind: CredentialKind;
  ok: boolean;
  accessCode?: VerifiedAccessCode;
  error?: VerifyError;
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
  const raw: unknown = await res.json().catch(() => null);
  const data = (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}) as
    | VerifyResponse
    | Record<string, never>;

  if ('code' in data && data.code === KEY_CHECK_UNAVAILABLE_CODE) {
    return {
      kind: 'checkUnavailable',
      ok: false,
      error: 'error' in data ? data.error : undefined,
    };
  }

  return {
    kind,
    ok: res.ok && data.ok === true,
    accessCode: 'accessCode' in data ? data.accessCode : undefined,
    error: 'error' in data ? data.error : undefined,
  };
}
