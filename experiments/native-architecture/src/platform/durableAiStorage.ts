import { Directory, File, Paths } from 'expo-file-system';
import { NativeModules } from 'react-native';
import { bytesBase64 } from '../ai/base64';
import { parseAiJournal, type AiJournal, type AiStorage, type AiResult } from '../ai/journal';
import {
  MAX_RESULT_BYTES,
  MAX_UPLOAD_BYTES,
  isAiMime,
  isInstallationId,
  type AiMime,
} from '../ai/contract';
import { parseDrawing } from '../drawing/model';
import { admitAiImage } from './aiImage';
const LEGACY_DIRECTORY = 'splotch-ai-pictures-v1';
const MAX_MODEL_BYTES = 8 * 1024 * 1024;
const MAX_JOURNAL_BYTES = 32 * 1024;
const MAX_LEGACY_FILES = 256;
const NATIVE_STORAGE_TIMEOUT_MS = 30_000;
type Operation = 'read' | 'prepare' | 'importLegacy' | 'write' | 'retain' | 'pictures';
type Receipt = {
  journal: AiJournal;
  nonce: string;
  revision: number;
  originalDigest: string;
  inputDigest: string | null;
};
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).sort().join(',') !== keys.sort().join(','))
    throw new Error('Native AI journal response changed.');
}
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
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_JOURNAL_BYTES)
    throw new Error('Native AI durability response is invalid.');
  const value: unknown = JSON.parse(raw);
  if (!record(value)) throw new Error('Native AI durability response is invalid.');
  return value;
}
function createReceiptOwner() {
  const receipts = new Map<number, Receipt>();
  function receipt(value: unknown): Receipt {
    if (!record(value)) throw new Error('Native AI commit was not confirmed.');
    exact(value, ['journal', 'nonce', 'revision', 'originalDigest', 'inputDigest']);
    if (
      !isInstallationId(value.nonce) ||
      !isInstallationId(value.originalDigest) ||
      (value.inputDigest !== null && !isInstallationId(value.inputDigest)) ||
      typeof value.revision !== 'number' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1
    )
      throw new Error('Native AI commit was not confirmed.');
    const result = {
      journal: parseAiJournal(value.journal),
      nonce: value.nonce,
      revision: value.revision,
      originalDigest: value.originalDigest,
      inputDigest: value.inputDigest,
    };
    const prior = receipts.get(result.journal.id);
    if (
      prior &&
      (prior.nonce !== result.nonce ||
        prior.originalDigest !== result.originalDigest ||
        prior.inputDigest !== result.inputDigest ||
        result.revision < prior.revision)
    )
      throw new Error('Native AI attempt changed.');
    receipts.set(result.journal.id, result);
    return result;
  }
  async function commit(
    kind: 'prepare' | 'importLegacy' | 'write' | 'retain',
    payload: object
  ): Promise<Receipt> {
    const value = await operation(kind, payload);
    exact(value, ['receipt']);
    return receipt(value.receipt);
  }
  function known(id: number) {
    const value = receipts.get(id);
    if (!value) throw new Error('Read the native recovery journal before changing this attempt.');
    return { id, nonce: value.nonce, revision: value.revision };
  }
  return { receipt, commit, known };
}
const owner = createReceiptOwner();
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
  async prepare(journal, originalModel, upload) {
    parseAiJournal(journal);
    if (new TextEncoder().encode(originalModel).length > MAX_MODEL_BYTES)
      throw new Error('AI original drawing is too large.');
    parseDrawing(JSON.parse(originalModel));
    if (!upload.length || upload.length > MAX_UPLOAD_BYTES)
      throw new Error('AI recovery payload is too large.');
    const value = await owner.commit('prepare', {
      journal,
      originalModel,
      upload: bytesBase64(upload),
    });
    if (
      value.journal.id !== journal.id ||
      value.inputDigest === null ||
      !sameJournal(value.journal, journal)
    )
      throw new Error('Native AI preparation was not confirmed. Nothing was sent.');
  },
  async read() {
    const value = await operation('read', {});
    exact(value, ['receipt']);
    if (value.receipt !== null) {
      const found = owner.receipt(value.receipt).journal;
      if (found.result) await validateResult(found.result);
      return found;
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
      return journal;
    }
    const original = new File(Paths.document, 'splotch-pictures', journal.originalId + '.json');
    if (!original.exists || original.size > MAX_MODEL_BYTES)
      throw new Error('The original drawing for the older attempt is missing. Nothing was sent.');
    const originalModel = await original.text();
    parseDrawing(JSON.parse(originalModel));
    return (await owner.commit('importLegacy', { journal, originalModel })).journal;
  },
  async write(journal) {
    const before = owner.known(journal.id);
    const value = await owner.commit('write', { ...before, journal: parseAiJournal(journal) });
    if (!sameJournal(value.journal, journal))
      throw new Error('Native AI revision was not confirmed.');
  },
  async retain(id, bytes, mime) {
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
    return value.journal.result;
  },
  async pictures() {
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
  },
};
