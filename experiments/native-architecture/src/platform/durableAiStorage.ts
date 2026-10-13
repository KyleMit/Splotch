import { record, exact, parseNativeReceipt, parseRecoveryHeldReceipt } from './nativeAiReceipt';
import { RecoveryReceiptOwner } from './recoveryReceiptOwner';
import {
  createNativeRecoveryStorage,
  verifyNativeRecoveryResult,
  type RecoveryStorageOperation,
} from './aiRecoveryStorage.native';
import { verifyRecoveryRequestIdentity } from '../ai/recoveryRequest';
import { RECOVERY_PROTOCOL } from '../ai/recoveryContract';
import { Directory, File, Paths } from 'expo-file-system';
import { NativeModules } from 'react-native';
import { bytesBase64 } from '../ai/base64';
import {
  parseAiJournal,
  type AiJournal,
  type AiStorage,
  type AiResult,
  type AiReceipt,
  type AiPreparedReceipt,
} from '../ai/journal';
import { MAX_RESULT_BYTES, MAX_UPLOAD_BYTES, isAiMime, type AiMime } from '../ai/contract';
import { MAX_AI_MODEL_BYTES, validateAiOriginalModel } from './aiOriginalModel';
import { admitAiImage } from './aiImage';
const LEGACY_DIRECTORY = 'splotch-ai-pictures-v1';
const MAX_JOURNAL_BYTES = 32 * 1024;
const MAX_LEGACY_FILES = 256;
const NATIVE_STORAGE_TIMEOUT_MS = 30_000;
type Operation =
  | RecoveryStorageOperation
  | 'read'
  | 'prepare'
  | 'importLegacy'
  | 'write'
  | 'retain'
  | 'pictures'
  | 'readPreparedUpload'
  | 'prepareRecovery'
  | 'commitRecoveryIntent'
  | 'recordRecoveryStatus';
const MAX_UPLOAD_REPLY_BYTES = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 + MAX_JOURNAL_BYTES;
async function operation(kind: Operation, payload: object): Promise<Record<string, unknown>> {
  const bridge: unknown = NativeModules.SplotchAIEnvironment;
  if (!record(bridge) || typeof bridge.aiStorage !== 'function')
    throw new Error('Native AI durability is unavailable. Nothing was sent.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let raw: unknown;
  try {
    raw = await Promise.race([
      bridge.aiStorage(kind, JSON.stringify(payload)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'Native AI save was not confirmed. Keep the app open and reopen AI picture.'
              )
            ),
          NATIVE_STORAGE_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (
    typeof raw !== 'string' ||
    new TextEncoder().encode(raw).length >
      (kind === 'readPreparedUpload' || kind === 'readRecoveryUpload'
        ? MAX_UPLOAD_REPLY_BYTES
        : MAX_JOURNAL_BYTES)
  )
    throw new Error('Native AI durability response is invalid.');
  const value: unknown = JSON.parse(raw);
  if (!record(value)) throw new Error('Native AI durability response is invalid.');
  return value;
}
const recoveryRestart = new RecoveryReceiptOwner();
function createReceiptOwner() {
  const receipts = new Map<number, AiReceipt>();
  function receipt(value: unknown): AiReceipt {
    const result = parseNativeReceipt(value);
    const prior = receipts.get(result.journal.id);
    if (
      prior &&
      (prior.kind !== result.kind ||
        prior.nonce !== result.nonce ||
        prior.journal.createdAt !== result.journal.createdAt ||
        prior.journal.style !== result.journal.style ||
        prior.journal.originalId !== result.journal.originalId ||
        prior.inputLength !== result.inputLength ||
        (prior.resultDigest !== null &&
          (prior.resultDigest !== result.resultDigest ||
            prior.resultLength !== result.resultLength)) ||
        prior.originalDigest !== result.originalDigest ||
        prior.inputDigest !== result.inputDigest ||
        result.revision < prior.revision ||
        (result.revision === prior.revision && !sameJournal(result.journal, prior.journal)))
    )
      throw new Error('Native AI attempt changed.');
    return result;
  }
  async function commit(
    kind: 'prepare' | 'importLegacy' | 'write' | 'retain',
    payload: object
  ): Promise<AiReceipt> {
    const value = await operation(kind, payload);
    exact(value, ['receipt']);
    return receipt(value.receipt);
  }
  function known(id: number) {
    const value = receipts.get(id);
    if (!value) throw new Error('Read the native recovery journal before changing this attempt.');
    return { id, nonce: value.nonce, revision: value.revision };
  }
  function current(value: AiReceipt) {
    const found = receipts.get(value.journal.id);
    if (!found || found !== value)
      throw new Error('Native AI receipt is stale. Read recovery before uploading.');
    return known(value.journal.id);
  }
  function accept<Receipt extends AiReceipt>(value: Receipt): Receipt {
    receipts.set(value.journal.id, value);
    return value;
  }
  return { receipt, commit, known, current, accept };
}
const owner = createReceiptOwner();
function createStorageQueue() {
  let pending: Promise<unknown> = Promise.resolve();
  let uncertain = false;
  return {
    run<T>(kind: Operation, work: () => Promise<T>): Promise<T> {
      const next = pending
        .catch(() => {})
        .then(async () => {
          if (uncertain && kind !== 'read' && kind !== 'readRecoveryAttempt' && kind !== 'pictures')
            throw new Error('Read native recovery after an unconfirmed storage operation.');
          try {
            const value = await work();
            if (kind === 'read' || kind === 'readRecoveryAttempt') uncertain = false;
            return value;
          } catch (error) {
            uncertain = true;
            throw error;
          }
        });
      pending = next;
      return next;
    },
  };
}
const queue = createStorageQueue();
function sameJournal(a: AiJournal, b: AiJournal) {
  return (
    a.version === b.version &&
    a.id === b.id &&
    a.createdAt === b.createdAt &&
    a.style === b.style &&
    a.originalId === b.originalId &&
    a.phase === b.phase &&
    a.jobId === b.jobId &&
    a.result?.uri === b.result?.uri &&
    a.result?.mime === b.result?.mime
  );
}
function legacyFiles() {
  const directory = new Directory(Paths.document, LEGACY_DIRECTORY);
  if (!directory.exists) return [];
  const files = directory.list();
  if (files.length > MAX_LEGACY_FILES || files.some((item) => !(item instanceof File)))
    throw new Error('Older AI recovery storage is full or invalid.');
  return files.filter((item): item is File => item instanceof File);
}
async function validateResult(result: AiResult) {
  const file = new File(result.uri);
  if (!file.exists || file.size <= 0 || file.size > MAX_RESULT_BYTES)
    throw new Error('Saved AI picture is missing or too large.');
  await admitAiImage(await file.bytes(), result.mime);
}
export const aiStorage: AiStorage = {
  ...createNativeRecoveryStorage(operation, (kind, work) => queue.run(kind, work), recoveryRestart),
  async prepareRecovery(journal, originalModel, upload, credential) {
    return queue.run('prepareRecovery', async () => {
      recoveryRestart.legacy();
      parseAiJournal(journal);
      if (
        journal.phase !== 'unknown' ||
        journal.jobId !== null ||
        journal.result !== null ||
        new TextEncoder().encode(originalModel).length > MAX_AI_MODEL_BYTES ||
        !upload.length ||
        upload.length > MAX_UPLOAD_BYTES
      )
        throw new Error('Recovery original or upload is invalid. Nothing was sent.');
      validateAiOriginalModel(originalModel, 'current');
      const value = await operation('prepareRecovery', {
        journal,
        originalModel,
        upload: bytesBase64(upload),
        credential,
      });
      exact(value, ['receipt']);
      const confirmed = parseRecoveryHeldReceipt(value.receipt);
      if (
        !sameJournal(confirmed.journal, journal) ||
        confirmed.inputLength !== upload.length ||
        confirmed.recovery.credential.kind !== credential.kind ||
        confirmed.recovery.credential.reference !== credential.reference ||
        confirmed.recovery.intent !== 'prepared' ||
        confirmed.recovery.expiry.kind !== 'unknown'
      )
        throw new Error(
          'Recovery creation was not confirmed. Reopen recovery; nothing was uploaded.'
        );
      return recoveryRestart.held(value.receipt);
    });
  },
  async commitRecoveryIntent(receipt) {
    return queue.run('commitRecoveryIntent', async () => {
      const value = await operation('commitRecoveryIntent', recoveryRestart.current(receipt));
      exact(value, ['receipt']);
      const next = recoveryRestart.held(value.receipt);
      if (next.recovery.intent !== 'committed')
        throw new Error('Recovery intent was not confirmed. Nothing was sent.');
      return next;
    });
  },
  async recordRecoveryStatus(receipt, status) {
    return queue.run('recordRecoveryStatus', async () => {
      if (receipt.recovery.intent !== 'committed' || status.id !== receipt.recovery.id)
        throw new Error('Recovery admission does not belong to this held request.');
      const value = await operation('recordRecoveryStatus', {
        ...recoveryRestart.current(receipt),
        status: {
          ...status,
          protocol: RECOVERY_PROTOCOL,
          headerExpiresAt: String(status.expiresAt),
        },
      });
      exact(value, ['receipt']);
      const next = recoveryRestart.held(value.receipt);
      if (
        next.recovery.expiry.kind !== 'known' ||
        next.recovery.expiry.expiresAt !== status.expiresAt
      )
        throw new Error('Recovery server expiry was not confirmed. The request stays held.');
      return next;
    });
  },
  async prepare(journal, originalModel, upload) {
    return queue.run('prepare', async () => {
      parseAiJournal(journal);
      if (new TextEncoder().encode(originalModel).length > MAX_AI_MODEL_BYTES)
        throw new Error('AI original drawing is too large.');
      validateAiOriginalModel(originalModel, 'current');
      if (!upload.length || upload.length > MAX_UPLOAD_BYTES)
        throw new Error('AI recovery payload is too large.');
      const value = await owner.commit('prepare', {
        journal,
        originalModel,
        upload: bytesBase64(upload),
      });
      if (
        value.journal.id !== journal.id ||
        value.kind !== 'prepared' ||
        value.inputDigest === null ||
        value.inputLength !== upload.length ||
        !sameJournal(value.journal, journal)
      )
        throw new Error('Native AI preparation was not confirmed. Nothing was sent.');
      return owner.accept(value);
    });
  },
  async readPreparedUpload(receipt: AiPreparedReceipt) {
    return queue.run('readPreparedUpload', async () => {
      const value = await operation('readPreparedUpload', owner.current(receipt));
      exact(value, ['receipt', 'upload']);
      const confirmed = owner.receipt(value.receipt);
      if (
        confirmed.kind !== 'prepared' ||
        confirmed.nonce !== receipt.nonce ||
        confirmed.revision !== receipt.revision ||
        confirmed.inputDigest !== receipt.inputDigest ||
        confirmed.inputLength !== receipt.inputLength ||
        typeof value.upload !== 'string' ||
        value.upload.length > Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 ||
        value.upload.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value.upload)
      )
        throw new Error('Pinned native upload was not confirmed. Nothing was sent.');
      const bytes = Uint8Array.from(atob(value.upload), (part) => part.charCodeAt(0));
      if (bytes.length !== receipt.inputLength || bytesBase64(bytes) !== value.upload)
        throw new Error('Pinned native upload bytes changed. Nothing was sent.');
      owner.accept(confirmed);
      return bytes;
    });
  },
  async read() {
    return queue.run('read', async () => {
      const value = await operation('read', {});
      exact(value, ['receipt']);
      if (record(value.receipt) && value.receipt.kind === 'recovery-request') {
        const receipt = recoveryRestart.request(value.receipt);
        await verifyRecoveryRequestIdentity(receipt);
        await verifyNativeRecoveryResult(receipt);
        return Object.freeze({ kind: 'recovery-request' as const, receipt });
      }
      if (record(value.receipt) && value.receipt.kind === 'recovery-held')
        return Object.freeze({
          kind: 'recovery-held' as const,
          receipt: recoveryRestart.held(value.receipt),
        });
      recoveryRestart.legacy();
      if (value.receipt !== null) {
        const found = owner.receipt(value.receipt);
        if (found.journal.result) await validateResult(found.journal.result);
        return Object.freeze({ kind: 'native' as const, receipt: owner.accept(found) });
      }
      const file = legacyFiles()
        .filter((item) => /^journal-\d+\.json$/.test(item.name))
        .sort((a, b) => Number(b.name.slice(8, -5)) - Number(a.name.slice(8, -5)))[0];
      if (!file) return null;
      if (file.size > MAX_JOURNAL_BYTES) throw new Error('Older recovery journal is too large.');
      const journal = parseAiJournal(JSON.parse(await file.text()));
      if (journal.phase === 'failed' || journal.phase === 'result') {
        if (
          journal.result &&
          !legacyFiles().some(
            (file) =>
              file.uri === journal.result?.uri && /^result-\d+\.(png|jpg|webp)$/.test(file.name)
          )
        )
          throw new Error('Older AI result points outside its owned gallery.');
        if (journal.result) await validateResult(journal.result);
        return Object.freeze({ kind: 'legacy' as const, journal: Object.freeze(journal) });
      }
      const original = new File(Paths.document, 'splotch-pictures', journal.originalId + '.json');
      if (!original.exists || original.size > MAX_AI_MODEL_BYTES)
        throw new Error('The original drawing for the older attempt is missing. Nothing was sent.');
      const originalModel = await original.text();
      validateAiOriginalModel(originalModel, 'imported');
      const imported = await owner.commit('importLegacy', { journal, originalModel });
      if (imported.kind !== 'imported' || !sameJournal(imported.journal, journal))
        throw new Error('Older native import was not confirmed.');
      return Object.freeze({ kind: 'native' as const, receipt: owner.accept(imported) });
    });
  },
  async write(journal) {
    return queue.run('write', async () => {
      const before = owner.known(journal.id);
      const value = await owner.commit('write', { ...before, journal: parseAiJournal(journal) });
      if (!sameJournal(value.journal, journal))
        throw new Error('Native AI revision was not confirmed.');
      return owner.accept(value);
    });
  },
  async retain(id, bytes, mime) {
    return queue.run('retain', async () => {
      if (!Number.isSafeInteger(id) || id < 1 || !bytes.length || bytes.length > MAX_RESULT_BYTES)
        throw new Error('Invalid AI picture.');
      await admitAiImage(bytes, mime);
      const value = await owner.commit('retain', {
        ...owner.known(id),
        bytes: bytesBase64(bytes),
        mime,
      });
      if (value.journal.id !== id || value.journal.phase !== 'result' || !value.journal.result)
        throw new Error('Native result commit was not confirmed.');
      return Object.freeze({ picture: value.journal.result, receipt: owner.accept(value) });
    });
  },
  async pictures() {
    return queue.run('pictures', async () => {
      const value = await operation('pictures', {});
      exact(value, ['pictures']);
      if (!Array.isArray(value.pictures) || value.pictures.length > 32)
        throw new Error('Native AI gallery is invalid.');
      const pictures: AiResult[] = value.pictures.map((item: unknown) => {
        if (!record(item)) throw new Error('Native AI picture is invalid.');
        exact(item, ['uri', 'mime']);
        if (typeof item.uri !== 'string' || !item.uri.startsWith('file:') || !isAiMime(item.mime))
          throw new Error('Native AI picture is invalid.');
        return { uri: item.uri, mime: item.mime };
      });
      for (const file of legacyFiles()) {
        if (!/^result-\d+\.(png|jpg|webp)$/.test(file.name)) continue;
        const mime: AiMime = file.name.endsWith('.png')
          ? 'image/png'
          : file.name.endsWith('.jpg')
            ? 'image/jpeg'
            : 'image/webp';
        pictures.push({ uri: file.uri, mime });
      }
      for (const picture of pictures) await validateResult(picture);
      return pictures;
    });
  },
};
