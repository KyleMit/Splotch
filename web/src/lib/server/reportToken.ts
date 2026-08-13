import { createHmac } from 'node:crypto';
import { constantTimeEqual } from './admin';
import { config } from './config';

// Proof that this server actually ran a free AI attempt for this installation.
// The free credential is otherwise a locally-mintable 64-hex string, which would
// leave /api/report-image an unauthenticated public write to blob storage and
// the private issue tracker — the per-instance rate limiter is a throttle, not
// an authorization boundary (ADR-0014 resets it on every cold start and shares
// nothing across instances).
//
// generate-image mints one when a free run returns an image or safety refusal;
// report-image spends it.
// It is an HMAC over the installation id and an expiry, so nothing is stored
// server-side and no blob read sits in front of a child-safety path.

const HMAC_ALG = 'sha256';
// Bump to invalidate every outstanding report token at once.
const TOKEN_LABEL = 'free-report-v1';
// A report is sent from the open result modal, so the realistic lifetime is
// minutes. Two hours absorbs a picture left on screen through a parental gate
// without widening the window a leaked token stays useful in.
const REPORT_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

export type ReportTokenVerdict = 'valid' | 'invalid' | 'expired' | 'unconfigured';

function sign(installationId: string, expiresAt: number, secret: string): string {
  return createHmac(HMAC_ALG, secret)
    .update(`${TOKEN_LABEL}:${installationId}:${expiresAt}`)
    .digest('hex');
}

export function issueReportToken(installationId: string): string | null {
  const secret = config.reportTokenSecret();
  if (!secret) return null;
  const expiresAt = Date.now() + REPORT_TOKEN_TTL_MS;
  return `${expiresAt}.${sign(installationId, expiresAt, secret)}`;
}

export function verifyReportToken(
  token: string | null,
  installationId: string
): ReportTokenVerdict {
  const secret = config.reportTokenSecret();
  if (!secret) return 'unconfigured';
  if (!token) return 'invalid';

  const separator = token.indexOf('.');
  if (separator < 0) return 'invalid';
  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!Number.isSafeInteger(expiresAt) || !signature) return 'invalid';

  // Authenticate before reading the expiry: an unsigned token's claimed lifetime
  // is attacker-controlled and must never decide the answer.
  if (!constantTimeEqual(signature, sign(installationId, expiresAt, secret))) return 'invalid';
  return expiresAt <= Date.now() ? 'expired' : 'valid';
}
