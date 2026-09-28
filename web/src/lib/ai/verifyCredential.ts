import { apiUrl } from '$lib/api';
import {
  KEY_CHECK_UNAVAILABLE_CODE,
  looksLikeApiKey,
  looksLikeRetiredGeminiKey,
} from '$lib/ai/keyFormat';
import type { VerifyAccessCodeResponse } from '../../routes/api/verify-access-code/+server';
import type { VerifyKeyResponse } from '../../routes/api/verify-key/+server';

/** A credential that can pass verification, and so the only kinds a parent can hold. */
export type VerifiedCredentialKind = 'apiKey' | 'accessCode';

// A value that isn't an API key is treated as a secret access code and checked
// against the managed allowlist instead — except a Google key, which is neither.
// It would fail the allowlist and be reported as an invalid access code, which
// is true but useless; naming it is what lets a parent who set one up before the
// provider migration (ADR-0113) understand what to do.
export type CredentialKind =
  | VerifiedCredentialKind
  | 'retiredGeminiKey'
  /** The check never reached OpenAI — nothing was learned about the key. */
  | 'checkUnavailable';

export type VerifyCredentialResult =
  | { ok: true; kind: 'apiKey' }
  | { ok: true; kind: 'accessCode'; accessCode: string }
  | { ok: false; kind: CredentialKind; error?: string };

type VerifyResponse = VerifyAccessCodeResponse | VerifyKeyResponse;
type FieldOf<T> = T extends unknown ? keyof T : never;
// Every field either endpoint's response can carry, each still unchecked: the
// body crosses the wire untyped, so each field is narrowed before it is used.
type UncheckedVerifyResponse = Partial<Record<FieldOf<VerifyResponse>, unknown>>;

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
  if (looksLikeRetiredGeminiKey(value)) return { ok: false, kind: 'retiredGeminiKey' };

  const kind: VerifiedCredentialKind = looksLikeApiKey(value) ? 'apiKey' : 'accessCode';
  const endpoint = kind === 'apiKey' ? '/api/verify-key' : '/api/verify-access-code';
  const body = kind === 'apiKey' ? { apiKey: value } : { code: value };

  const res = await fetch(apiUrl(endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const raw: unknown = await res.json().catch(() => null);
  const data: UncheckedVerifyResponse = typeof raw === 'object' && raw !== null ? raw : {};
  const error = typeof data.error === 'string' ? data.error : undefined;

  if (data.code === KEY_CHECK_UNAVAILABLE_CODE) {
    return { ok: false, kind: 'checkUnavailable', error };
  }
  if (!res.ok || data.ok !== true) return { ok: false, kind, error };
  if (kind === 'apiKey') return { ok: true, kind };
  // The server's access code is what gets stored. A success without one breaks
  // the endpoint's contract, so it fails rather than storing the typed value.
  return typeof data.accessCode === 'string' && data.accessCode !== ''
    ? { ok: true, kind, accessCode: data.accessCode }
    : { ok: false, kind, error };
}
