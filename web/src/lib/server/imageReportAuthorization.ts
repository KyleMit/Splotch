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
import { checkAccessToken } from './tokens';
import { isInstallationId } from '$lib/installationId';
import { verifyReportToken, type ReportTokenBinding, type ReportTokenContext } from './reportToken';
import { AI_REPORTING_UNAVAILABLE_MESSAGE } from './imageReportUnavailable';

export type ImageReportAuthorizationResult =
  | { authorized: true; reportContext: ReportTokenContext | null }
  | { authorized: false; response: Response };

function verifyReportContext(
  token: string | null,
  binding: ReportTokenBinding,
  required = false
): ImageReportAuthorizationResult {
  if (!token && !required) return { authorized: true, reportContext: null };

  const verdict = verifyReportToken(token, binding);
  switch (verdict.status) {
    case 'valid':
      return { authorized: true, reportContext: verdict.context };
    case 'expired':
      return {
        authorized: false,
        response: fail(403, 'That AI result can no longer be reported.'),
      };
    case 'unconfigured':
      console.error('[report-image] REPORT_TOKEN_SECRET is unset; signed reporting is closed');
      return { authorized: false, response: fail(503, AI_REPORTING_UNAVAILABLE_MESSAGE) };
    default:
      return { authorized: false, response: fail(403, 'Invalid access token') };
  }
}

// Reporting accepts exactly the three credentials generation accepts, because
// every result or refusal must be reportable through the same child-safety path.
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
    if (!check.ok) {
      // Only the provider can say a key is bad; a check that got no answer says
      // nothing about it, so it answers as /api/verify-key's 503 does.
      if (check.kind === 'unreachable') {
        console.warn(`[report-image] key check unreachable: ${check.reason}`);
        return { authorized: false, response: fail(503, AI_REPORTING_UNAVAILABLE_MESSAGE) };
      }
      return { authorized: false, response: fail(403, 'Invalid API key') };
    }
    return verifyReportContext(input.reportToken, { kind: 'byok', credential: apiKey });
  }

  // Invalid managed tokens are the same oracle as /api/verify-access-code, so
  // failures charge its shared per-IP budget rather than this endpoint's.
  const managedToken = input.token?.trim() ?? '';
  if (managedToken) {
    const guessKey = verifyAccessCodeBucket(input.clientAddress);
    const guess = peekRateLimit(guessKey, rateLimitPolicy.verifyAccessCode);
    if (guess.limited) return { authorized: false, response: throttled(guess.retryAfter) };
    const access = await checkAccessToken(managedToken);
    if (access.verdict !== 'allowed') {
      if (access.spendsGuess) rateLimit(guessKey, rateLimitPolicy.verifyAccessCode);
      // As with the key check above: an unreadable allowlist says nothing
      // about the code, so it answers 503 rather than calling the code invalid.
      const response =
        access.verdict === 'denied'
          ? fail(403, 'Invalid access token')
          : fail(503, AI_REPORTING_UNAVAILABLE_MESSAGE);
      return { authorized: false, response };
    }

    const attempt = rateLimit(
      reportImageTokenBucket(managedToken),
      rateLimitPolicy.reportImageToken
    );
    if (attempt.limited) {
      return { authorized: false, response: throttled(attempt.retryAfter) };
    }
    return verifyReportContext(input.reportToken, {
      kind: 'managed',
      credential: managedToken,
    });
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

  return verifyReportContext(
    input.reportToken,
    { kind: 'free', credential: input.installationId },
    true
  );
}
