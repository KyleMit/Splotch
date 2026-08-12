import { aiProvider } from './ai/provider';
import { fail, throttled } from './http';
import { peekRateLimit, rateLimit } from './rateLimit';
import {
  reportImageByokBucket,
  reportImageFreeBucket,
  reportImageTokenBucket,
  verifyAccessCodeBucket,
} from './rateLimitKeys';
import { rateLimitPolicy } from './rateLimitPolicy';
import { isAllowedToken } from './tokens';
import { isInstallationId } from './freeGenerationGrants';

export type ImageReportAuthorizationResult =
  | { authorized: true }
  | { authorized: false; response: Response };

// Reporting accepts exactly the three credentials generation accepts, because a
// picture that could be made must be reportable — the report is the child-safety
// path for the very output the same credential produced.
export async function authorizeImageReport(input: {
  apiKey: string | null;
  token: string | null;
  installationId: string | null;
  clientAddress: string;
}): Promise<ImageReportAuthorizationResult> {
  const apiKey = input.apiKey?.trim() ?? '';
  if (apiKey) {
    const attempt = rateLimit(
      reportImageByokBucket(input.clientAddress),
      rateLimitPolicy.reportImageByok
    );
    if (attempt.limited) return { authorized: false, response: throttled(attempt.retryAfter) };
    const check = await aiProvider.verifyKey(apiKey);
    return check.ok
      ? { authorized: true }
      : { authorized: false, response: fail(403, 'Invalid API key') };
  }

  // Invalid managed tokens are the same oracle as /api/verify-access-code, so
  // failures charge its shared per-IP budget rather than this endpoint's.
  const managedToken = input.token?.trim() ?? '';
  if (managedToken) {
    const guessKey = verifyAccessCodeBucket(input.clientAddress);
    const guess = peekRateLimit(guessKey, rateLimitPolicy.verifyAccessCode);
    if (guess.limited) return { authorized: false, response: throttled(guess.retryAfter) };
    if (!(await isAllowedToken(managedToken))) {
      rateLimit(guessKey, rateLimitPolicy.verifyAccessCode);
      return { authorized: false, response: fail(403, 'Invalid access token') };
    }

    const attempt = rateLimit(
      reportImageTokenBucket(managedToken),
      rateLimitPolicy.reportImageToken
    );
    return attempt.limited
      ? { authorized: false, response: throttled(attempt.retryAfter) }
      : { authorized: true };
  }

  // The free credential is shape-only, as it is for generation: a grant record
  // proves nothing extra here, since any caller mints one with a single
  // generate-image call under the same per-IP budget. What bounds this path is
  // the bucket below plus the body-size cap and retention purge on the stored
  // evidence — not the credential. Charged before the shape check so malformed
  // free reports still spend the budget.
  const attempt = rateLimit(
    reportImageFreeBucket(input.clientAddress),
    rateLimitPolicy.reportImageFree
  );
  if (attempt.limited) return { authorized: false, response: throttled(attempt.retryAfter) };
  return isInstallationId(input.installationId)
    ? { authorized: true }
    : { authorized: false, response: fail(400, 'Installation grant unavailable') };
}
