import { GENERATION_JOB_TTL_MS } from './limits';
import { isStyleName, type StyleName } from './styles';

export const RECOVERY_PROTOCOL = 'splotch-ai-recovery-v1';
export const RECOVERY_PATH = '/api/generation-attempt/v1';
export const RECOVERY_VERSION_HEADER = 'X-AI-Recovery-Version';
export const RECOVERY_NONCE_HEADER = 'X-AI-Attempt-Nonce';
export const RECOVERY_CREATED_HEADER = 'X-AI-Attempt-Created-At';
export const RECOVERY_EXPIRES_HEADER = 'X-AI-Attempt-Expires-At';
export const RECOVERY_DIGEST_HEADER = 'X-AI-Delivery-Digest';
export const RECOVERY_RECEIPT_HEADER = 'X-AI-Delivery-Receipt';
export const RECOVERY_INPUT_DIGEST_HEADER = 'X-AI-Input-Digest';
export const RECOVERY_TERMINAL_HEADER = 'X-AI-Checked-Terminal';
export const RECOVERY_TERMINAL_VALUE = '1';
export const RECOVERY_TERMINAL_CODE = 'RECOVERY_TERMINAL';
export const RECOVERY_ADMISSION_AGE_MS = 60_000;
export const RECOVERY_FUTURE_SKEW_MS = 30_000;
export const RECOVERY_POLL_AFTER_MS = 4_000;
export const RECOVERY_TTL_MS = GENERATION_JOB_TTL_MS;
export const RECOVERY_MAX_INPUT_BYTES = 15 * 1024 * 1024;
export const RECOVERY_MAX_IMAGE_BYTES = 16 * 1024 * 1024;
export const RECOVERY_MAX_JSON_BYTES = 8_192;
export const RECOVERY_MAX_RECORD_BYTES = 32_768;
export const RECOVERY_MAX_PROMPT_BYTES = 8_192;
export const RECOVERY_MAX_REASON_BYTES = 1_024;
export const RECOVERY_MAX_REPORT_TOKEN_BYTES = 4_096;
export const RECOVERY_PHASES = [
  'preparing',
  'funded',
  'pending',
  'working',
  'image',
  'delivery',
  'refusal',
  'error',
  'acknowledged',
] as const;
export type RecoveryPhase = (typeof RECOVERY_PHASES)[number];
export type RecoveryMime = 'image/png' | 'image/jpeg' | 'image/webp';
export type RecoveryCapabilityBody = Readonly<{
  ok: true;
  protocol: typeof RECOVERY_PROTOCOL;
  jobTtlMs: number;
}>;
export type RecoveryStatusBody = Readonly<{
  ok: true;
  protocol: typeof RECOVERY_PROTOCOL;
  id: string;
  expiresAt: number;
  phase: RecoveryPhase;
  pollAfterMs: typeof RECOVERY_POLL_AFTER_MS;
}>;
export type RecoveryAttemptIdentity = Readonly<{ id: string; nonce: string; createdAt: number }>;
export type RecoveryInputMetadata = Readonly<{
  inputDigest: string;
  inputByteLength: number;
  mime: RecoveryMime;
  style: StyleName;
  promptPolicyRevision: string;
  prompt: string;
  requestFingerprint: string;
}>;
export type RecoveryReconcileBody = Readonly<{
  operation: 'reconcile';
  id: string;
  createdAt: number;
}>;
export type RecoveryAckBody = Readonly<{
  operation: 'ack';
  id: string;
  createdAt: number;
  digest: string;
  receipt: string;
}>;
export type RecoveryAckReply = Readonly<{
  ok: true;
  protocol: typeof RECOVERY_PROTOCOL;
  id: string;
  phase: 'acknowledged';
  expiresAt: number;
  deliveryDigest: string;
  deliveryReceipt: string;
}>;
export type RecoveryFaultCode =
  | 'RECOVERY_INVALID'
  | 'RECOVERY_ABSENT'
  | 'RECOVERY_EXPIRED'
  | 'RECOVERY_CONFLICT'
  | 'RECOVERY_UNAVAILABLE'
  | 'RECOVERY_NOT_READY';
export class RecoveryFault extends Error {
  constructor(readonly code: RecoveryFaultCode) {
    super(code);
    this.name = 'RecoveryFault';
  }
}
export function recoveryInvalid(): never {
  throw new RecoveryFault('RECOVERY_INVALID');
}
export function isRecoveryHex(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
export function isRecoveryTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
export function isRecoveryMime(value: unknown): value is RecoveryMime {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp';
}
export function recoveryObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) recoveryInvalid();
  return value as Record<string, unknown>;
}
export function recoveryExact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
    recoveryInvalid();
}
export function recoveryText(value: unknown, maximumBytes: number): string {
  if (
    typeof value !== 'string' ||
    !value ||
    new TextEncoder().encode(value).byteLength > maximumBytes
  )
    recoveryInvalid();
  return value;
}
export function parseRecoveryTimestamp(raw: string | null): number {
  if (raw === null || !/^(0|[1-9][0-9]*)$/.test(raw)) recoveryInvalid();
  const value = Number(raw);
  if (!isRecoveryTime(value) || String(value) !== raw) recoveryInvalid();
  return value;
}
export function parseRecoveryIdentity(value: unknown): RecoveryAttemptIdentity {
  const item = recoveryObject(value);
  recoveryExact(item, ['id', 'nonce', 'createdAt']);
  if (!isRecoveryHex(item.id) || !isRecoveryHex(item.nonce) || !isRecoveryTime(item.createdAt))
    recoveryInvalid();
  return Object.freeze({ id: item.id, nonce: item.nonce, createdAt: item.createdAt });
}
export function parseRecoveryInput(value: unknown): RecoveryInputMetadata {
  const item = recoveryObject(value);
  recoveryExact(item, [
    'inputDigest',
    'inputByteLength',
    'mime',
    'style',
    'promptPolicyRevision',
    'prompt',
    'requestFingerprint',
  ]);
  if (
    !isRecoveryHex(item.inputDigest) ||
    !isRecoveryHex(item.requestFingerprint) ||
    !isRecoveryTime(item.inputByteLength) ||
    item.inputByteLength < 1 ||
    item.inputByteLength > RECOVERY_MAX_INPUT_BYTES ||
    !isRecoveryMime(item.mime) ||
    !isStyleName(item.style)
  )
    recoveryInvalid();
  const promptPolicyRevision = recoveryText(item.promptPolicyRevision, RECOVERY_MAX_REASON_BYTES);
  const prompt = recoveryText(item.prompt, RECOVERY_MAX_PROMPT_BYTES);
  return Object.freeze({
    inputDigest: item.inputDigest,
    inputByteLength: item.inputByteLength,
    mime: item.mime,
    style: item.style,
    promptPolicyRevision,
    prompt,
    requestFingerprint: item.requestFingerprint,
  });
}
export function parseRecoveryMutation(value: unknown): RecoveryReconcileBody | RecoveryAckBody {
  const item = recoveryObject(value);
  if (!isRecoveryHex(item.id) || !isRecoveryTime(item.createdAt)) recoveryInvalid();
  if (item.operation === 'reconcile') {
    recoveryExact(item, ['operation', 'id', 'createdAt']);
    return Object.freeze({ operation: 'reconcile', id: item.id, createdAt: item.createdAt });
  }
  recoveryExact(item, ['operation', 'id', 'createdAt', 'digest', 'receipt']);
  if (item.operation !== 'ack' || !isRecoveryHex(item.digest) || !isRecoveryHex(item.receipt))
    recoveryInvalid();
  return Object.freeze({
    operation: 'ack',
    id: item.id,
    createdAt: item.createdAt,
    digest: item.digest,
    receipt: item.receipt,
  });
}
export function recoveryCapability(): RecoveryCapabilityBody {
  return Object.freeze({ ok: true, protocol: RECOVERY_PROTOCOL, jobTtlMs: RECOVERY_TTL_MS });
}
export function recoveryStatus(
  id: string,
  expiresAt: number,
  phase: RecoveryPhase
): RecoveryStatusBody {
  if (
    !isRecoveryHex(id) ||
    !isRecoveryTime(expiresAt) ||
    expiresAt < 1 ||
    !RECOVERY_PHASES.includes(phase)
  )
    recoveryInvalid();
  return Object.freeze({
    ok: true,
    protocol: RECOVERY_PROTOCOL,
    id,
    expiresAt,
    phase,
    pollAfterMs: RECOVERY_POLL_AFTER_MS,
  });
}
export type RecoveryAdmissionHeaders = Readonly<{
  nonce: string;
  createdAt: number;
  inputDigest: string;
  mime: RecoveryMime;
  style: StyleName;
}>;
export function parseRecoveryAdmissionHeaders(
  headers: Pick<Headers, 'get'>,
  style: unknown
): RecoveryAdmissionHeaders {
  const nonce = headers.get(RECOVERY_NONCE_HEADER);
  const inputDigest = headers.get(RECOVERY_INPUT_DIGEST_HEADER);
  const mime = headers.get('Content-Type')?.split(';')[0].trim();
  if (
    headers.get(RECOVERY_VERSION_HEADER) !== RECOVERY_PROTOCOL ||
    !isRecoveryHex(nonce) ||
    !isRecoveryHex(inputDigest) ||
    !isRecoveryMime(mime) ||
    !isStyleName(style)
  )
    recoveryInvalid();
  return Object.freeze({
    nonce,
    createdAt: parseRecoveryTimestamp(headers.get(RECOVERY_CREATED_HEADER)),
    inputDigest,
    mime,
    style,
  });
}
export function parseRecoveryAckReply(
  value: unknown,
  expected: Readonly<{ id: string; expiresAt: number; digest: string; receipt: string }>
): RecoveryAckReply {
  const item = recoveryObject(value);
  recoveryExact(item, [
    'ok',
    'protocol',
    'id',
    'phase',
    'expiresAt',
    'deliveryDigest',
    'deliveryReceipt',
  ]);
  if (
    item.ok !== true ||
    item.protocol !== RECOVERY_PROTOCOL ||
    item.phase !== 'acknowledged' ||
    !isRecoveryHex(item.id) ||
    item.id !== expected.id ||
    !isRecoveryTime(item.expiresAt) ||
    item.expiresAt < 1 ||
    item.expiresAt !== expected.expiresAt ||
    !isRecoveryHex(item.deliveryDigest) ||
    item.deliveryDigest !== expected.digest ||
    !isRecoveryHex(item.deliveryReceipt) ||
    item.deliveryReceipt !== expected.receipt
  )
    recoveryInvalid();
  return Object.freeze({
    ok: true,
    protocol: RECOVERY_PROTOCOL,
    id: item.id,
    phase: 'acknowledged',
    expiresAt: item.expiresAt,
    deliveryDigest: item.deliveryDigest,
    deliveryReceipt: item.deliveryReceipt,
  });
}
export type RecoveryLookupHeaders =
  | Readonly<{ kind: 'capability' }>
  | Readonly<{ kind: 'collect'; nonce: string; createdAt: number }>;
export function parseRecoveryLookupHeaders(headers: Pick<Headers, 'get'>): RecoveryLookupHeaders {
  if (headers.get(RECOVERY_VERSION_HEADER) !== RECOVERY_PROTOCOL) recoveryInvalid();
  const nonce = headers.get(RECOVERY_NONCE_HEADER);
  const createdAt = headers.get(RECOVERY_CREATED_HEADER);
  if (nonce === null && createdAt === null) return Object.freeze({ kind: 'capability' });
  if (!isRecoveryHex(nonce) || createdAt === null) recoveryInvalid();
  return Object.freeze({ kind: 'collect', nonce, createdAt: parseRecoveryTimestamp(createdAt) });
}

export type RecoveryTerminalOutcome = 'expired' | 'refusal' | 'error';
export const RECOVERY_TERMINAL_STATUS = Object.freeze({
  expired: 410,
  refusal: 422,
  error: 502,
} as const);
type RecoveryTerminalBody = Readonly<{
  ok: false;
  error: string;
  code: typeof RECOVERY_TERMINAL_CODE;
  protocol: typeof RECOVERY_PROTOCOL;
  id: string;
  createdAt: number;
  expiresAt: number;
  outcome: RecoveryTerminalOutcome;
}>;
export type RecoveryTerminalConfirmation = Readonly<{
  status: (typeof RECOVERY_TERMINAL_STATUS)[RecoveryTerminalOutcome];
  body: RecoveryTerminalBody;
}>;
export function parseRecoveryTerminalReply(
  status: number,
  value: unknown,
  expected: Readonly<{
    id: string;
    createdAt: number;
    expiry: Readonly<{ kind: 'unknown' }> | Readonly<{ kind: 'known'; expiresAt: number }>;
  }>
): RecoveryTerminalConfirmation {
  const item = recoveryObject(value);
  recoveryExact(item, [
    'ok',
    'error',
    'code',
    'protocol',
    'id',
    'createdAt',
    'expiresAt',
    'outcome',
  ]);
  const outcome = item.outcome;
  if (outcome !== 'expired' && outcome !== 'refusal' && outcome !== 'error') recoveryInvalid();
  const minimum = expected.createdAt + RECOVERY_TTL_MS - RECOVERY_FUTURE_SKEW_MS;
  const maximum = expected.createdAt + RECOVERY_TTL_MS + RECOVERY_ADMISSION_AGE_MS;
  if (
    item.ok !== false ||
    item.code !== RECOVERY_TERMINAL_CODE ||
    item.protocol !== RECOVERY_PROTOCOL ||
    !isRecoveryHex(expected.id) ||
    item.id !== expected.id ||
    !isRecoveryTime(expected.createdAt) ||
    item.createdAt !== expected.createdAt ||
    !isRecoveryTime(minimum) ||
    !isRecoveryTime(maximum) ||
    !isRecoveryTime(item.expiresAt) ||
    item.expiresAt < minimum ||
    item.expiresAt > maximum ||
    (expected.expiry.kind !== 'known' && expected.expiry.kind !== 'unknown') ||
    (expected.expiry.kind === 'known' &&
      (!isRecoveryTime(expected.expiry.expiresAt) ||
        item.expiresAt !== expected.expiry.expiresAt)) ||
    status !== RECOVERY_TERMINAL_STATUS[outcome]
  )
    recoveryInvalid();
  const error = recoveryText(item.error, RECOVERY_MAX_JSON_BYTES);
  return Object.freeze({
    status: RECOVERY_TERMINAL_STATUS[outcome],
    body: Object.freeze({
      ok: false,
      error,
      code: RECOVERY_TERMINAL_CODE,
      protocol: RECOVERY_PROTOCOL,
      id: expected.id,
      createdAt: expected.createdAt,
      expiresAt: item.expiresAt,
      outcome,
    }),
  });
}
export function recoveryTerminalRequested(headers: Pick<Headers, 'get'>): boolean {
  const value = headers.get(RECOVERY_TERMINAL_HEADER);
  if (value === null) return false;
  if (value !== RECOVERY_TERMINAL_VALUE) recoveryInvalid();
  return true;
}
