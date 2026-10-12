import { RECOVERY_PROTOCOL, originalRecoveryExpiry } from '../ai/recoveryContract';
import {
  parseAiJournal,
  type AiReceipt,
  type AiRecoveryHeldReceipt,
  type AiRecoveryRequestReceipt,
  type AiRecoveryProgress,
  type AiPreparedReceipt,
} from '../ai/journal';
import { MAX_RESULT_BYTES, MAX_UPLOAD_BYTES, isAiMime, isInstallationId } from '../ai/contract';
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).sort().join(',') !== keys.sort().join(','))
    throw new Error('Native AI journal response changed.');
}
export function parseNativeReceipt(value: unknown): AiReceipt {
  if (!record(value)) throw new Error('Native AI commit was not confirmed.');
  exact(value, [
    'kind',
    'journal',
    'nonce',
    'revision',
    'originalRevision',
    'originalDigest',
    'inputDigest',
    'inputLength',
    'resultDigest',
    'resultLength',
  ]);
  if (
    !['prepared', 'imported'].includes(String(value.kind)) ||
    value.originalRevision !== 1 ||
    !isInstallationId(value.nonce) ||
    !isInstallationId(value.originalDigest) ||
    (value.inputDigest !== null && !isInstallationId(value.inputDigest)) ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  )
    throw new Error('Native AI commit was not confirmed.');
  const journal = parseAiJournal(value.journal);
  if (
    (value.kind === 'prepared' &&
      (!isInstallationId(value.inputDigest) ||
        typeof value.inputLength !== 'number' ||
        !Number.isSafeInteger(value.inputLength) ||
        value.inputLength < 1 ||
        value.inputLength > MAX_UPLOAD_BYTES)) ||
    (value.kind === 'imported' && (value.inputDigest !== null || value.inputLength !== null)) ||
    (journal.result === null
      ? value.resultDigest !== null || value.resultLength !== null
      : !isInstallationId(value.resultDigest) ||
        typeof value.resultLength !== 'number' ||
        !Number.isSafeInteger(value.resultLength) ||
        value.resultLength < 1 ||
        value.resultLength > MAX_RESULT_BYTES)
  )
    throw new Error('Native AI receipt metadata is invalid.');
  if (journal.result) Object.freeze(journal.result);
  const common = {
    journal: Object.freeze(journal),
    nonce: value.nonce,
    revision: value.revision,
    originalRevision: 1 as const,
    resultDigest: value.resultDigest as string | null,
    resultLength: value.resultLength as number | null,
    originalDigest: value.originalDigest,
  };
  const result: AiReceipt =
    value.kind === 'prepared'
      ? Object.freeze({
          ...common,
          kind: 'prepared',
          inputDigest: value.inputDigest as string,
          inputLength: value.inputLength as number,
        })
      : Object.freeze({ ...common, kind: 'imported', inputDigest: null, inputLength: null });
  return result;
}
export function parseRecoveryHeldReceipt(raw: unknown): AiRecoveryHeldReceipt {
  if (!record(raw) || raw.kind !== 'recovery-held' || !record(raw.recovery))
    throw new Error('Recovery restart metadata is invalid. The attempt stays held.');
  const { recovery, ...base } = raw;
  const pinned = parseNativeReceipt({ ...base, kind: 'prepared' });
  exact(recovery, ['version', 'protocol', 'id', 'credential', 'expiry', 'intent']);
  if (
    pinned.kind !== 'prepared' ||
    pinned.journal.phase !== 'unknown' ||
    pinned.journal.jobId !== null ||
    pinned.journal.result !== null ||
    recovery.version !== 2 ||
    recovery.protocol !== RECOVERY_PROTOCOL ||
    !isInstallationId(recovery.id) ||
    !record(recovery.credential) ||
    !record(recovery.expiry) ||
    !['prepared', 'committed'].includes(String(recovery.intent))
  )
    throw new Error('Recovery restart metadata is invalid. The attempt stays held.');
  const credential = recovery.credential;
  exact(credential, ['kind', 'reference']);
  if (
    (credential.kind !== 'free' && credential.kind !== 'managed' && credential.kind !== 'byok') ||
    !isInstallationId(credential.reference)
  )
    throw new Error('Recovery secure reference is invalid. The attempt stays held.');
  let expiry: AiRecoveryHeldReceipt['recovery']['expiry'];
  if (recovery.expiry.kind === 'unknown') {
    exact(recovery.expiry, ['kind']);
    expiry = Object.freeze({ kind: 'unknown' });
  } else if (
    recovery.expiry.kind === 'known' &&
    typeof recovery.expiry.expiresAt === 'number' &&
    recovery.intent === 'committed'
  ) {
    exact(recovery.expiry, ['kind', 'expiresAt', 'provenance']);
    if (recovery.expiry.provenance !== 'admitted-status-202')
      throw new Error('Recovery expiry provenance is invalid.');
    const expiresAt = originalRecoveryExpiry(String(recovery.expiry.expiresAt), {
      kind: 'collect',
      id: recovery.id,
      createdAt: pinned.journal.createdAt,
      expiry: { kind: 'unknown' },
    });
    expiry = Object.freeze({ kind: 'known', expiresAt, provenance: 'admitted-status-202' });
  } else throw new Error('Recovery original expiry is invalid. The attempt stays held.');
  if (recovery.intent !== 'prepared' && recovery.intent !== 'committed')
    throw new Error('Recovery POST intent is invalid. The attempt stays held.');
  return Object.freeze({
    ...pinned,
    kind: 'recovery-held',
    recovery: Object.freeze({
      version: 2,
      protocol: RECOVERY_PROTOCOL,
      id: recovery.id,
      credential: Object.freeze({ kind: credential.kind, reference: credential.reference }),
      expiry,
      intent: recovery.intent,
    }),
  });
}

function parseRecoveryRequestProgress(
  recovery: Record<string, unknown>,
  pinned: AiPreparedReceipt
): AiRecoveryProgress {
  if (!record(recovery.expiry) || !isInstallationId(recovery.id))
    throw new Error('Recovery request expiry is invalid.');
  const commonKeys = ['version', 'protocol', 'id', 'credential', 'sourceHeld', 'state', 'expiry'];
  let progress: AiRecoveryProgress;
  if (recovery.state === 'prepared' || recovery.state === 'submission-uncertain') {
    exact(recovery, commonKeys);
    exact(recovery.expiry, ['kind']);
    if (recovery.expiry.kind !== 'unknown')
      throw new Error('Recovery preparation expiry is invalid.');
    progress = { state: recovery.state, expiry: Object.freeze({ kind: 'unknown' }) };
  } else {
    exact(recovery.expiry, ['kind', 'expiresAt', 'provenance']);
    if (
      recovery.expiry.kind !== 'known' ||
      recovery.expiry.provenance !== 'validated-recovery-response' ||
      typeof recovery.expiry.expiresAt !== 'number'
    )
      throw new Error('Recovery request expiry is invalid.');
    const expiresAt = originalRecoveryExpiry(String(recovery.expiry.expiresAt), {
      kind: 'collect',
      id: recovery.id,
      createdAt: pinned.journal.createdAt,
      expiry: { kind: 'unknown' },
    });
    const expiry = Object.freeze({
      kind: 'known' as const,
      expiresAt,
      provenance: 'validated-recovery-response' as const,
    });
    if (recovery.state === 'admitted') {
      exact(recovery, commonKeys);
      progress = { state: 'admitted', expiry };
    } else if (recovery.state === 'terminal') {
      exact(recovery, [...commonKeys, 'outcome']);
      if (
        recovery.outcome !== 'refusal' &&
        recovery.outcome !== 'error' &&
        recovery.outcome !== 'expired'
      )
        throw new Error('Recovery outcome is invalid.');
      progress = { state: 'terminal', expiry, outcome: recovery.outcome };
    } else if (
      recovery.state === 'delivery-pinned' ||
      recovery.state === 'retained' ||
      recovery.state === 'acknowledged'
    ) {
      exact(recovery, [...commonKeys, 'delivery']);
      if (!record(recovery.delivery)) throw new Error('Recovery delivery is invalid.');
      const delivery = recovery.delivery;
      exact(delivery, ['expiresAt', 'digest', 'receipt', 'mime', 'length']);
      if (
        delivery.expiresAt !== expiresAt ||
        !isInstallationId(delivery.digest) ||
        !isInstallationId(delivery.receipt) ||
        !isAiMime(delivery.mime) ||
        typeof delivery.length !== 'number' ||
        !Number.isSafeInteger(delivery.length) ||
        delivery.length < 1 ||
        delivery.length > MAX_RESULT_BYTES
      )
        throw new Error('Recovery delivery is invalid.');
      progress = {
        state: recovery.state,
        expiry,
        delivery: Object.freeze({
          expiresAt,
          digest: delivery.digest,
          receipt: delivery.receipt,
          mime: delivery.mime,
          length: delivery.length,
        }),
      };
    } else throw new Error('Recovery local state is invalid.');
  }
  return Object.freeze(progress);
}
export function parseRecoveryRequestReceipt(raw: unknown): AiRecoveryRequestReceipt {
  if (!record(raw) || raw.kind !== 'recovery-request' || !record(raw.recovery))
    throw new Error('Recovery request metadata is invalid.');
  const { recovery, ...base } = raw;
  const pinned = parseNativeReceipt({ ...base, kind: 'prepared' });
  if (
    pinned.kind !== 'prepared' ||
    recovery.version !== 3 ||
    recovery.protocol !== RECOVERY_PROTOCOL ||
    !isInstallationId(recovery.id) ||
    !record(recovery.credential) ||
    !record(recovery.sourceHeld) ||
    !record(recovery.expiry)
  )
    throw new Error('Recovery request identity is invalid.');
  exact(recovery.credential, ['kind', 'reference']);
  exact(recovery.sourceHeld, ['id', 'nonce', 'revision']);
  const { credential, sourceHeld } = recovery;
  if (
    (credential.kind !== 'free' && credential.kind !== 'managed' && credential.kind !== 'byok') ||
    !isInstallationId(credential.reference) ||
    !isInstallationId(sourceHeld.nonce) ||
    typeof sourceHeld.id !== 'number' ||
    !Number.isSafeInteger(sourceHeld.id) ||
    sourceHeld.id < 1 ||
    sourceHeld.id >= pinned.journal.id ||
    typeof sourceHeld.revision !== 'number' ||
    !Number.isSafeInteger(sourceHeld.revision) ||
    sourceHeld.revision < 1 ||
    pinned.journal.jobId !== null
  )
    throw new Error('Recovery source or credential is invalid.');
  const progress = parseRecoveryRequestProgress(recovery, pinned);
  const retained = progress.state === 'retained' || progress.state === 'acknowledged';
  if (
    pinned.journal.phase !==
      (retained ? 'result' : progress.state === 'terminal' ? 'failed' : 'unknown') ||
    (retained &&
      (!('delivery' in progress) ||
        pinned.resultDigest !== progress.delivery.digest ||
        pinned.resultLength !== progress.delivery.length ||
        pinned.journal.result?.mime !== progress.delivery.mime))
  )
    throw new Error('Recovery journal and delivery disagree.');
  return Object.freeze({
    ...pinned,
    kind: 'recovery-request',
    recovery: Object.freeze({
      version: 3,
      protocol: RECOVERY_PROTOCOL,
      id: recovery.id,
      credential: Object.freeze({ kind: credential.kind, reference: credential.reference }),
      sourceHeld: Object.freeze({
        id: sourceHeld.id,
        nonce: sourceHeld.nonce,
        revision: sourceHeld.revision,
      }),
      ...progress,
    }),
  });
}
export function assertRecoveryRequestProgress(
  before: AiRecoveryRequestReceipt,
  after: AiRecoveryRequestReceipt
): void {
  const a = before.recovery,
    b = after.recovery;
  const states = [
    'prepared',
    'submission-uncertain',
    'admitted',
    'delivery-pinned',
    'retained',
    'acknowledged',
  ];
  if (
    before.journal.id !== after.journal.id ||
    before.journal.createdAt !== after.journal.createdAt ||
    before.journal.originalId !== after.journal.originalId ||
    before.journal.style !== after.journal.style ||
    before.nonce !== after.nonce ||
    before.originalDigest !== after.originalDigest ||
    before.inputDigest !== after.inputDigest ||
    before.inputLength !== after.inputLength ||
    a.id !== b.id ||
    JSON.stringify(a.credential) !== JSON.stringify(b.credential) ||
    JSON.stringify(a.sourceHeld) !== JSON.stringify(b.sourceHeld) ||
    after.revision < before.revision ||
    (after.revision === before.revision && JSON.stringify(before) !== JSON.stringify(after)) ||
    (a.expiry.kind === 'known' && JSON.stringify(a.expiry) !== JSON.stringify(b.expiry)) ||
    ('delivery' in a &&
      (!('delivery' in b) || JSON.stringify(a.delivery) !== JSON.stringify(b.delivery))) ||
    (a.state === 'terminal' && JSON.stringify(a) !== JSON.stringify(b)) ||
    (a.state !== 'terminal' &&
      b.state !== 'terminal' &&
      states.indexOf(b.state) < states.indexOf(a.state)) ||
    (['delivery-pinned', 'retained', 'acknowledged'].includes(a.state) && b.state === 'terminal') ||
    (before.resultDigest !== null &&
      (before.resultDigest !== after.resultDigest || before.resultLength !== after.resultLength)) ||
    (before.journal.result !== null &&
      JSON.stringify(before.journal.result) !== JSON.stringify(after.journal.result))
  )
    throw new Error('Recovery request metadata regressed or changed.');
}
