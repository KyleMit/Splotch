export const AI_ORIGIN = 'https://splotch.art';
export const AI_STYLES = [
  'Magical',
  'Crayon',
  'Watercolor',
  'Paper',
  'Felt',
  'Sticker',
  'Cartoon',
  'Clay',
] as const;
export type AiStyle = (typeof AI_STYLES)[number];
export const FREE_LIMIT = 10;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_RESULT_BYTES = 16 * 1024 * 1024;
export const MAX_JSON_BYTES = 8192;
export const REQUEST_TIMEOUT_MS = 27_000;
export const POLL_INTERVAL_MS = 3000;
export const POLL_TIMEOUT_MS = 240_000;
export const JOB_TTL_MS = 20 * 60 * 1000;
export const MAX_RETRY_AFTER_MS = 60 * 60 * 1000;
export const MAX_CREDENTIAL_CHARACTERS = 2048;
export type CredentialKind = 'managed' | 'byok';
export const SECRET_SLOTS: Record<CredentialKind, 'gemini-api-key' | 'managed-access-code'> = {
  managed: 'managed-access-code',
  byok: 'gemini-api-key',
};
export type AiMime = 'image/png' | 'image/jpeg' | 'image/webp';
export function isAiStyle(value: unknown): value is AiStyle {
  return AI_STYLES.some((style) => style === value);
}
export function isAiMime(value: unknown): value is AiMime {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp';
}
export function isInstallationId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
