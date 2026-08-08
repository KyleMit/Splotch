import { aiProvider } from './ai/provider';
import { fail, throttled } from './http';
import { peekRateLimit, rateLimit } from './rateLimit';
import {
  reportImageByokBucket,
  reportImageTokenBucket,
  verifyAccessCodeBucket,
} from './rateLimitKeys';
import { rateLimitPolicy } from './rateLimitPolicy';
import { isAllowedToken } from './tokens';

export type ImageReportAuthorizationResult =
  | { authorized: true }
  | { authorized: false; response: Response };

export async function authorizeImageReport(input: {
  apiKey: string | null;
  token: string | null;
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

  const guessKey = verifyAccessCodeBucket(input.clientAddress);
  const guess = peekRateLimit(guessKey, rateLimitPolicy.verifyAccessCode);
  if (guess.limited) return { authorized: false, response: throttled(guess.retryAfter) };
  if (typeof input.token !== 'string' || !(await isAllowedToken(input.token))) {
    rateLimit(guessKey, rateLimitPolicy.verifyAccessCode);
    return { authorized: false, response: fail(403, 'Invalid access token') };
  }

  const attempt = rateLimit(reportImageTokenBucket(input.token), rateLimitPolicy.reportImageToken);
  return attempt.limited
    ? { authorized: false, response: throttled(attempt.retryAfter) }
    : { authorized: true };
}
