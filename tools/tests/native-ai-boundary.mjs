import { vi } from 'vitest';

export function nativeAiBoundary() {
  return {
    aiVault: {
      installationId: vi.fn(async () => 'a'.repeat(64)),
      read: vi.fn(async () => null),
      write: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
    aiStorage: {
      read: vi.fn(async () => null),
      write: vi.fn(async () => {}),
      pictures: vi.fn(async () => []),
      retain: vi.fn(async () => ({ uri: 'file:///fixture/ai.png', mime: 'image/png' })),
    },
    aiTransport: vi.fn(async () => {
      throw new Error('This drawing fixture does not authorize AI network requests.');
    }),
  };
}
