import { vi } from 'vitest';

export function nativeAiBoundary() {
  let journal = null;
  let upload = new Uint8Array();
  const receipt = (next) => ({
    kind: 'prepared',
    journal: next,
    nonce: 'c'.repeat(64),
    revision: 1,
    originalRevision: 1,
    originalDigest: 'd'.repeat(64),
    inputDigest: 'e'.repeat(64),
    inputLength: upload.length,
    resultDigest: next.result ? 'f'.repeat(64) : null,
    resultLength: next.result ? 1 : null,
  });
  return {
    admitAiImage: vi.fn(async () => {}),
    aiVault: {
      installationId: vi.fn(async () => 'a'.repeat(64)),
      read: vi.fn(async () => null),
      write: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
    aiDismissal: { read: async () => null, write: async () => {} },
    aiStorage: {
      prepare: vi.fn(async (next, _, bytes) => {
        journal = next;
        upload = bytes.slice();
        return receipt(next);
      }),
      readPreparedUpload: vi.fn(async () => upload.slice()),
      read: vi.fn(async () => null),
      write: vi.fn(async (next) => {
        journal = next;
        return receipt(next);
      }),
      pictures: vi.fn(async () => []),
      retain: vi.fn(async () => {
        const picture = { uri: 'file:///fixture/ai.png', mime: 'image/png' };
        journal = { ...journal, phase: 'result', result: picture };
        return { picture, receipt: receipt(journal) };
      }),
    },
    aiTransport: vi.fn(async () => {
      throw new Error('This drawing fixture does not authorize AI network requests.');
    }),
  };
}
