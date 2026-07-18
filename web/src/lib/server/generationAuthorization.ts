import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { throttled } from './http';
import { peekRateLimit, rateLimit } from './rateLimit';
import { isAllowedToken } from './tokens';

const GENERATE_LIMIT = 15;
const GENERATE_WINDOW_MS = 60_000;
const BYOK_LIMIT = 30;

export type GenerationAuthorization =
  | { usingByok: true; effectiveKey: string; managedToken: null }
  | { usingByok: false; effectiveKey: string | undefined; managedToken: string };

export async function authorizeGenerationRequest(input: {
  apiKey: string | null;
  token: string | null;
  clientAddress: string;
}): Promise<GenerationAuthorization | Response> {
  const userKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  const usingByok = userKey.length > 0;

  // Invalid managed tokens are the same oracle as /api/verify-access-code.
  // Peek before the allowlist read, then charge only failures to its shared
  // per-IP budget so valid families behind one NAT never consume it.
  if (!usingByok) {
    const guessKey = `verify-access-code:${input.clientAddress}`;
    const guess = peekRateLimit(guessKey);
    if (guess.limited) return throttled(guess.retryAfter);
    if (typeof input.token !== 'string' || !(await isAllowedToken(input.token))) {
      rateLimit(guessKey);
      throw error(403, 'Invalid access token');
    }

    // Valid managed traffic is keyed per token to contain a leaked credential.
    const generation = rateLimit(`generate-image:${input.token}`, {
      limit: GENERATE_LIMIT,
      windowMs: GENERATE_WINDOW_MS,
    });
    if (generation.limited) return throttled(generation.retryAfter);
    return {
      usingByok: false,
      effectiveKey: env.GEMINI_API_KEY,
      managedToken: input.token,
    };
  }

  // BYOK is keyed per IP because the provider result is still a key-validity
  // oracle, even though successful calls spend the parent's own quota.
  const generation = rateLimit(`generate-image-byok:${input.clientAddress}`, {
    limit: BYOK_LIMIT,
    windowMs: GENERATE_WINDOW_MS,
  });
  if (generation.limited) return throttled(generation.retryAfter);
  return { usingByok: true, effectiveKey: userKey, managedToken: null };
}

export function requireEffectiveGenerationKey(authorization: GenerationAuthorization): string {
  if (!authorization.effectiveKey) {
    throw error(500, 'Server is missing GEMINI_API_KEY');
  }
  return authorization.effectiveKey;
}
