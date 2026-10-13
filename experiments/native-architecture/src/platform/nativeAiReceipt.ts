import { RECOVERY_PROTOCOL, originalRecoveryExpiry } from '../ai/recoveryContract';
import { parseAiJournal, type AiReceipt, type AiRecoveryHeldReceipt } from '../ai/journal';
import { MAX_RESULT_BYTES, MAX_UPLOAD_BYTES, isInstallationId } from '../ai/contract';
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
