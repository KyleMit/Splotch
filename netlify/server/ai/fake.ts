import type { AiImageProvider } from './provider';

// Long enough for the client to paint its waiting state and poll, without a paid model call.
export const FAKE_IMAGE_DELAY_MS = 1_500;
const FAKE_KEY_DELAY_MS = 250;
const CANNED_IMAGE =
  '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';
const ERROR_REASONS = {
  'sk-test-invalid-key': 'OpenAI request failed: 401 Incorrect API key provided',
  'sk-test-rate-limited': 'OpenAI request failed: 429 Rate limit reached',
  'sk-test-error': 'OpenAI request failed: 500 Internal server error',
  'sk-test-timeout': 'OpenAI request failed: Request timed out.',
} as const;

export const fakeAiProvider: AiImageProvider = {
  async generateImage({ apiKey, deadlineMs }) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(FAKE_IMAGE_DELAY_MS, deadlineMs)));
    if (deadlineMs < FAKE_IMAGE_DELAY_MS)
      return { kind: 'error', reason: ERROR_REASONS['sk-test-timeout'] };
    if (apiKey === 'sk-test-refusal')
      return { kind: 'refusal', reason: "I can't turn that drawing into a picture." };
    for (const [key, reason] of Object.entries(ERROR_REASONS))
      if (apiKey === key) return { kind: 'error', reason };
    if (apiKey !== 'sk-test-success')
      return { kind: 'error', reason: ERROR_REASONS['sk-test-invalid-key'] };
    return { kind: 'image', data: CANNED_IMAGE, mimeType: 'image/png' };
  },
  async verifyKey(apiKey) {
    await new Promise((resolve) => setTimeout(resolve, FAKE_KEY_DELAY_MS));
    if (apiKey === 'sk-test-verify-rate-limited' || apiKey === 'sk-test-verify-timeout')
      return { ok: false, kind: 'unreachable', reason: 'The key check ran out of time' };
    if (
      apiKey === 'sk-test-success' ||
      apiKey === 'sk-test-refusal' ||
      Object.hasOwn(ERROR_REASONS, apiKey)
    )
      return apiKey === 'sk-test-invalid-key'
        ? { ok: false, kind: 'rejected', reason: '401 Incorrect API key provided' }
        : { ok: true };
    return { ok: false, kind: 'rejected', reason: '401 Incorrect API key provided' };
  },
};
