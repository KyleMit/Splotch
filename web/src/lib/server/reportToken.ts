import { createHmac } from 'node:crypto';
import { constantTimeEqual } from './admin';
import { config } from './config';

// Proof that this server actually ran the AI attempt being reported. Free
// picture tokens authorize the report for a locally-mintable installation id;
// refusal tokens also carry the server-authenticated provider reason for every
// credential mode, so the report never accepts client-authored context.
//
// It is an HMAC over the generation credential, context, and expiry, so nothing
// is stored server-side and no blob read sits in front of a child-safety path.

const HMAC_ALG = 'sha256';
const FREE_TOKEN_LABEL = 'free-report-v1';
// Bump to invalidate every outstanding context-bearing token at once.
const CONTEXT_TOKEN_LABEL = 'ai-report-context-v1';
// A report is sent from the open result modal, so the realistic lifetime is
// minutes. Two hours absorbs a picture left on screen through a parental gate
// without widening the window a leaked token stays useful in.
const REPORT_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

const MAX_REFUSAL_REASON_CHARS = 512;

export interface ReportTokenBinding {
  kind: 'byok' | 'managed' | 'free';
  credential: string;
}

export type ReportTokenContext =
  { kind: 'picture' } | { kind: 'false-positive-refusal'; refusalReason: string };

export type ReportTokenVerdict =
  | { status: 'valid'; context: ReportTokenContext }
  | { status: 'invalid' | 'expired' | 'unconfigured' };

function signFreePicture(installationId: string, expiresAt: number, secret: string): string {
  return createHmac(HMAC_ALG, secret)
    .update(`${FREE_TOKEN_LABEL}:${installationId}:${expiresAt}`)
    .digest('hex');
}

function signContext(
  binding: ReportTokenBinding,
  expiresAt: number,
  encodedContext: string,
  secret: string
): string {
  return createHmac(HMAC_ALG, secret)
    .update(
      JSON.stringify([
        CONTEXT_TOKEN_LABEL,
        binding.kind,
        binding.credential,
        expiresAt,
        encodedContext,
      ])
    )
    .digest('hex');
}

function normalizedRefusalContext(refusalReason: string): ReportTokenContext {
  const normalized = refusalReason.replace(/\s+/g, ' ').trim().slice(0, MAX_REFUSAL_REASON_CHARS);
  return {
    kind: 'false-positive-refusal',
    refusalReason: normalized || 'UNKNOWN_SAFETY_REASON',
  };
}

export function issueReportToken(
  binding: ReportTokenBinding,
  context: ReportTokenContext = { kind: 'picture' }
): string | null {
  const secret = config.reportTokenSecret();
  if (!secret) return null;
  const expiresAt = Date.now() + REPORT_TOKEN_TTL_MS;
  // Preserve the deployed free-picture format so tokens minted immediately
  // before an update remain usable by already-open result views.
  if (binding.kind === 'free' && context.kind === 'picture') {
    return `${expiresAt}.${signFreePicture(binding.credential, expiresAt, secret)}`;
  }

  const normalizedContext =
    context.kind === 'false-positive-refusal'
      ? normalizedRefusalContext(context.refusalReason)
      : context;
  const encodedContext = Buffer.from(JSON.stringify(normalizedContext)).toString('base64url');
  return `v2.${expiresAt}.${encodedContext}.${signContext(binding, expiresAt, encodedContext, secret)}`;
}

export function verifyReportToken(
  token: string | null,
  binding: ReportTokenBinding
): ReportTokenVerdict {
  const secret = config.reportTokenSecret();
  if (!secret) return { status: 'unconfigured' };
  if (!token) return { status: 'invalid' };

  if (token.startsWith('v2.')) {
    const parts = token.split('.');
    if (parts.length !== 4) return { status: 'invalid' };
    const [, rawExpiresAt, encodedContext, signature] = parts;
    const expiresAt = Number(rawExpiresAt);
    if (!Number.isSafeInteger(expiresAt) || !encodedContext || !signature) {
      return { status: 'invalid' };
    }
    if (!constantTimeEqual(signature, signContext(binding, expiresAt, encodedContext, secret))) {
      return { status: 'invalid' };
    }
    if (expiresAt <= Date.now()) return { status: 'expired' };

    try {
      const context = JSON.parse(Buffer.from(encodedContext, 'base64url').toString('utf8'));
      if (context?.kind === 'picture') return { status: 'valid', context: { kind: 'picture' } };
      if (
        context?.kind === 'false-positive-refusal' &&
        typeof context.refusalReason === 'string' &&
        context.refusalReason.length > 0 &&
        context.refusalReason.length <= MAX_REFUSAL_REASON_CHARS
      ) {
        return {
          status: 'valid',
          context: {
            kind: 'false-positive-refusal',
            refusalReason: context.refusalReason,
          },
        };
      }
    } catch {}
    return { status: 'invalid' };
  }

  if (binding.kind !== 'free') return { status: 'invalid' };

  const separator = token.indexOf('.');
  if (separator < 0) return { status: 'invalid' };
  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (!Number.isSafeInteger(expiresAt) || !signature) return { status: 'invalid' };

  // Authenticate before reading the expiry: an unsigned token's claimed lifetime
  // is attacker-controlled and must never decide the answer.
  if (!constantTimeEqual(signature, signFreePicture(binding.credential, expiresAt, secret))) {
    return { status: 'invalid' };
  }
  return expiresAt <= Date.now()
    ? { status: 'expired' }
    : { status: 'valid', context: { kind: 'picture' } };
}
