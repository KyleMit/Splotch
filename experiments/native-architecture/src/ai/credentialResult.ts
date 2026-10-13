import type { CredentialKind } from './contract';
import type { AiCredentialResult } from './sessionContract';
import type { AiReply } from './transport';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type AiCredentialOutcome = DistributiveOmit<AiCredentialResult, 'id'>;

// What a credential check that did not verify says, in Settings' terms: no answer at all, a check
// the server could not run, a throttle, or a refusal in the server's own words.
export function credentialRefusal(kind: CredentialKind, reply: AiReply): AiCredentialOutcome {
  if (reply.kind === 'unknown') return { kind, outcome: 'unreachable' };
  if (reply.kind !== 'failure') return { kind, outcome: 'invalid', detail: null };
  if (reply.reason === 'unavailable')
    return {
      kind,
      outcome: reply.retryAt === undefined ? 'checkUnavailable' : 'throttled',
      detail: reply.message,
    };
  return { kind, outcome: 'invalid', detail: reply.message };
}
