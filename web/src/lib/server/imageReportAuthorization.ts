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
import { verifyReportToken } from './reportToken';

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
  reportToken: string | null;
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

  // The free tier proves itself with the report token generate-image minted for
  // this installation, not with the installation id alone: that id is a
  // locally-mintable 64-hex string, and the bucket below is a throttle rather
  // than an authorization boundary (ADR-0014 resets it on cold start and shares
  // nothing across instances). Charged before verification so forged tokens
  // still spend the budget.
  const attempt = rateLimit(
    reportImageFreeBucket(input.clientAddress),
    rateLimitPolicy.reportImageFree
  );
  if (attempt.limited) return { authorized: false, response: throttled(attempt.retryAfter) };
  if (!isInstallationId(input.installationId)) {
    return { authorized: false, response: fail(400, 'Installation grant unavailable') };
  }

  switch (verifyReportToken(input.reportToken, input.installationId)) {
    case 'valid':
      return { authorized: true };
    case 'expired':
      return { authorized: false, response: fail(403, 'That picture can no longer be reported.') };
    case 'unconfigured':
      // A deploy without the signing secret can still report on the other two
      // credentials, so this fails the free path alone — loudly, because the
      // symptom is otherwise a silent 503 on the child-safety path.
      console.error('[report-image] REPORT_TOKEN_SECRET is unset; free-tier reporting is closed');
      return {
        authorized: false,
        response: fail(
          503,
          'Picture reporting is not available right now. Please try again later.'
        ),
      };
    default:
      return { authorized: false, response: fail(403, 'Invalid access token') };
  }
}
