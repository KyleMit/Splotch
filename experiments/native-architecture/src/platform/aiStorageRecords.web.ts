import { bytesBase64 } from '../ai/base64';
import { MAX_RESULT_BYTES, MAX_UPLOAD_BYTES, type AiMime } from '../ai/contract';
import { type AiReceipt, type AiRecoveryHeldReceipt } from '../ai/journal';
import { MAX_AI_MODEL_BYTES, validateAiOriginalModel } from './aiOriginalModel';
import { exact, record, parseNativeReceipt, parseRecoveryHeldReceipt } from './nativeAiReceipt';
import { sha256Hex } from '../../../../web/src/lib/digestHex';
import { admitAiImage } from './aiImage.web';

export const AI_STORAGE_DATABASE = 'splotch-beta-ai-jobs-v1';
export const AI_STORAGE_STORE = 'state';
export const AI_STORAGE_KEY = 'current';
export const MAX_AI_STORAGE_ATTEMPTS = 32;
export const MAX_AI_STORAGE_BYTES = 128 * 1024 * 1024;
const MAX_STATE_METADATA_BYTES = 64 * 1024;
const MAX_AI_ORIGINAL_ID_CHARACTERS = 128;
const MAX_DATA_URI_HEADER_CHARACTERS = 64;

export type WebAiReceipt = AiReceipt | AiRecoveryHeldReceipt;
export type WebAiAttempt = Readonly<{
  receipt: WebAiReceipt;
  originalModel: string;
  originalLength: number;
  upload: string;
}>;
export type WebAiState = Readonly<{
  version: 1;
  revision: number;
  attempts: readonly WebAiAttempt[];
}>;

export function invalidAiStorage(): never {
  throw new Error('AI storage could not be confirmed. Reopen AI picture before continuing.');
}

export function decodeAiBytes(value: unknown, maximum: number): Uint8Array {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > Math.ceil(maximum / 3) * 4 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    invalidAiStorage();
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  if (!bytes.length || bytes.length > maximum || bytesBase64(bytes) !== value) invalidAiStorage();
  return bytes;
}

export function resultAiBytes(uri: string, mime: AiMime): Uint8Array {
  const prefix = `data:${mime};base64,`;
  if (!uri.startsWith(prefix)) invalidAiStorage();
  return decodeAiBytes(uri.slice(prefix.length), MAX_RESULT_BYTES);
}

export function checkAiStorageCapacity(state: WebAiState): void {
  if (state.attempts.length > MAX_AI_STORAGE_ATTEMPTS) invalidAiStorage();
  let bytes = MAX_STATE_METADATA_BYTES;
  for (const attempt of state.attempts) {
    bytes += attempt.originalModel.length * 2 + attempt.originalLength;
    bytes += attempt.upload.length * 2 + attempt.receipt.inputLength!;
    if (attempt.receipt.journal.result)
      bytes += attempt.receipt.journal.result.uri.length * 2 + attempt.receipt.resultLength!;
  }
  if (bytes > MAX_AI_STORAGE_BYTES)
    throw new Error('AI picture storage is full. Saved pictures stay here.');
}

export function parseWebAiState(raw: unknown): WebAiState {
  if (!record(raw)) invalidAiStorage();
  exact(raw, ['version', 'revision', 'attempts']);
  if (
    raw.version !== 1 ||
    typeof raw.revision !== 'number' ||
    !Number.isSafeInteger(raw.revision) ||
    raw.revision < 1 ||
    !Array.isArray(raw.attempts) ||
    !raw.attempts.length ||
    raw.attempts.length > MAX_AI_STORAGE_ATTEMPTS
  )
    invalidAiStorage();
  let priorId = 0;
  const nonces = new Set<string>();
  const attempts = raw.attempts.map((entry: unknown): WebAiAttempt => {
    if (!record(entry)) invalidAiStorage();
    exact(entry, ['receipt', 'originalModel', 'originalLength', 'upload']);
    const receipt =
      record(entry.receipt) && entry.receipt.kind === 'recovery-held'
        ? parseRecoveryHeldReceipt(entry.receipt)
        : parseNativeReceipt(entry.receipt);
    if (
      receipt.kind === 'imported' ||
      receipt.journal.id <= priorId ||
      receipt.journal.originalId.length > MAX_AI_ORIGINAL_ID_CHARACTERS ||
      nonces.has(receipt.nonce) ||
      typeof entry.originalModel !== 'string' ||
      entry.originalModel.length > MAX_AI_MODEL_BYTES ||
      typeof entry.originalLength !== 'number' ||
      !Number.isSafeInteger(entry.originalLength) ||
      entry.originalLength < 1 ||
      entry.originalLength > MAX_AI_MODEL_BYTES ||
      typeof entry.upload !== 'string' ||
      entry.upload.length > Math.ceil(MAX_UPLOAD_BYTES / 3) * 4
    )
      invalidAiStorage();
    priorId = receipt.journal.id;
    nonces.add(receipt.nonce);
    if (
      receipt.journal.result &&
      receipt.journal.result.uri.length >
        Math.ceil(MAX_RESULT_BYTES / 3) * 4 + MAX_DATA_URI_HEADER_CHARACTERS
    )
      invalidAiStorage();
    return Object.freeze({
      receipt,
      originalModel: entry.originalModel,
      originalLength: entry.originalLength,
      upload: entry.upload,
    });
  });
  if (
    attempts
      .slice(0, -1)
      .some(({ receipt }) => !['result', 'failed'].includes(receipt.journal.phase))
  )
    invalidAiStorage();
  const state = Object.freeze({
    version: 1 as const,
    revision: raw.revision,
    attempts: Object.freeze(attempts),
  });
  checkAiStorageCapacity(state);
  return state;
}

export async function verifyWebAiState(state: WebAiState): Promise<void> {
  for (const attempt of state.attempts) {
    const receipt = attempt.receipt;
    validateAiOriginalModel(attempt.originalModel, 'current');
    const model = new TextEncoder().encode(attempt.originalModel);
    const upload = decodeAiBytes(attempt.upload, MAX_UPLOAD_BYTES);
    if (
      new TextDecoder('utf-8', { fatal: true }).decode(model) !== attempt.originalModel ||
      model.length !== attempt.originalLength ||
      (await sha256Hex(model.buffer)) !== receipt.originalDigest ||
      upload.length !== receipt.inputLength ||
      (await sha256Hex(new Uint8Array(upload).buffer)) !== receipt.inputDigest
    )
      invalidAiStorage();
    await admitAiImage(upload, 'image/png');
    if (receipt.journal.result) {
      const bytes = resultAiBytes(receipt.journal.result.uri, receipt.journal.result.mime);
      if (
        bytes.length !== receipt.resultLength ||
        (await sha256Hex(new Uint8Array(bytes).buffer)) !== receipt.resultDigest
      )
        invalidAiStorage();
      await admitAiImage(bytes, receipt.journal.result.mime);
    }
  }
}
