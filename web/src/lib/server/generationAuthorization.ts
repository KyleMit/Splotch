import { config } from './config';
import { fail, throttled } from './http';
import { peekRateLimit, rateLimit } from './rateLimit';
import {
  generateImageFreeBucket,
  generateImageBucket,
  generateImageByokBucket,
  verifyAccessCodeBucket,
} from './rateLimitKeys';
import { rateLimitPolicy } from './rateLimitPolicy';
import { checkAccessToken } from './tokens';
import { isInstallationId } from '$lib/installationId';

export type GenerationAuthorization =
  | { authorized: true; kind: 'byok'; effectiveKey: string }
  | { authorized: true; kind: 'managed'; effectiveKey: string; managedToken: string }
  | { authorized: true; kind: 'free'; effectiveKey: string; installationId: string };

export type GenerationAuthorizationResult =
  GenerationAuthorization | { authorized: false; response: Response };

// Stays generic because it reaches parent-facing error reports.
const AI_CREATIONS_UNAVAILABLE =
  'AI creations are not available right now. Please try again later.';

// A deploy without the project key is a server fault, answered like every other
// unconfigured condition: a 503 for the caller and a log line for the operator.
function projectKeyMissing(): { authorized: false; response: Response } {
  console.error('[generate-image] OPENAI_API_KEY is unset; managed and free generation is closed');
  return { authorized: false, response: fail(503, AI_CREATIONS_UNAVAILABLE) };
}

export async function authorizeGenerationRequest(input: {
  apiKey: string | null;
  token: string | null;
  installationId: string | null;
  clientAddress: string;
}): Promise<GenerationAuthorizationResult> {
  const userKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  const usingByok = userKey.length > 0;

  // Invalid managed tokens are the same oracle as /api/verify-access-code.
  // Peek before the allowlist read, then charge only failures to its shared
  // per-IP budget so valid families behind one NAT never consume it.
  const managedToken = typeof input.token === 'string' ? input.token.trim() : '';
  if (!usingByok && managedToken) {
    const guessKey = verifyAccessCodeBucket(input.clientAddress);
    const guess = peekRateLimit(guessKey, rateLimitPolicy.verifyAccessCode);
    if (guess.limited) return { authorized: false, response: throttled(guess.retryAfter) };
    const access = await checkAccessToken(managedToken);
    if (access.verdict !== 'allowed') {
      if (access.spendsGuess) rateLimit(guessKey, rateLimitPolicy.verifyAccessCode);
      // An unreadable allowlist is our fault, not a revoked code: retryable.
      const response =
        access.verdict === 'denied'
          ? fail(403, 'Invalid access token')
          : fail(503, AI_CREATIONS_UNAVAILABLE);
      return { authorized: false, response };
    }

    // Valid managed traffic is keyed per token to contain a leaked credential.
    const generation = rateLimit(generateImageBucket(managedToken), rateLimitPolicy.generateToken);
    if (generation.limited) {
      return { authorized: false, response: throttled(generation.retryAfter) };
    }
    const effectiveKey = config.openAiApiKey();
    if (!effectiveKey) return projectKeyMissing();
    return {
      authorized: true,
      kind: 'managed',
      effectiveKey,
      managedToken,
    };
  }

  if (!usingByok) {
    const generation = rateLimit(
      generateImageFreeBucket(input.clientAddress),
      rateLimitPolicy.generateFree
    );
    if (generation.limited) {
      return { authorized: false, response: throttled(generation.retryAfter) };
    }
    if (!isInstallationId(input.installationId)) {
      return { authorized: false, response: fail(400, 'Installation grant unavailable') };
    }
    const effectiveKey = config.openAiApiKey();
    if (!effectiveKey) return projectKeyMissing();
    return { authorized: true, kind: 'free', effectiveKey, installationId: input.installationId };
  }

  // BYOK is keyed per IP because the provider result is still a key-validity
  // oracle, even though successful calls spend the parent's own quota.
  const generation = rateLimit(
    generateImageByokBucket(input.clientAddress),
    rateLimitPolicy.generateByok
  );
  if (generation.limited) {
    return { authorized: false, response: throttled(generation.retryAfter) };
  }
  return { authorized: true, kind: 'byok', effectiveKey: userKey };
}
