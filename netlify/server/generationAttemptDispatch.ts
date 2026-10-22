import { RECOVERY_PROTOCOL } from '../../src/lib/ai/generationAttempt';
import type { AttemptRecord } from './generationAttempts';
import type { RecoveryCredential } from './generationAttemptRequest';
import { sealRecoveryWork, signRecoveryWork, type RecoveryWork } from './generationAttemptWork';
import {
  RECOVERY_WORKER_PATH,
  RECOVERY_WORK_TICKET_HEADER,
  RECOVERY_WORK_DOMAIN,
  RECOVERY_HANDOFF_TIMEOUT_MS,
} from './generationAttemptPolicy';
export function recoveryWorkerUrl(origin: string): URL {
  const url = new URL(origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
  )
    throw new Error('Recovery worker origin is invalid');
  return new URL(RECOVERY_WORKER_PATH, url.origin);
}
export async function dispatchRecoveryWork(
  origin: string,
  record: AttemptRecord,
  credential: RecoveryCredential,
  secret: string
): Promise<void> {
  if (record.phase !== 'pending') return;
  const payload: RecoveryWork = {
    domain: RECOVERY_WORK_DOMAIN,
    protocol: RECOVERY_PROTOCOL,
    id: record.admission.identity.id,
    createdAt: record.admission.identity.createdAt,
    issuedAt: Date.now(),
    expiresAt: record.admission.expiresAt,
    requestFingerprint: record.admission.input.requestFingerprint,
    credential,
  };
  const body = sealRecoveryWork(payload, secret);
  const ticket = signRecoveryWork(body, secret);
  if (!ticket) throw new Error('Recovery worker signing is unavailable');
  // A lost handoff retains the same pending admission; only an explicit POST may re-dispatch it.
  try {
    const response = await fetch(recoveryWorkerUrl(origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [RECOVERY_WORK_TICKET_HEADER]: ticket },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(RECOVERY_HANDOFF_TIMEOUT_MS),
    });
    if (response.status !== 202)
      console.warn('[recovery-dispatch] worker handoff was not confirmed');
  } catch {
    console.warn('[recovery-dispatch] worker handoff outcome is unknown');
  }
}
