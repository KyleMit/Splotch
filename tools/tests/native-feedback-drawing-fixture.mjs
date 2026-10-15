import { afterEach, expect, vi } from 'vitest';

vi.mock('../../experiments/native-architecture/src/platform/useOnline.ts', () => ({
  useOnline: () => true,
}));
vi.mock('../../experiments/native-architecture/src/platform/networkReturn.ts', () => ({
  subscribeNetworkReturn: () => () => {},
}));

vi.mock('../../experiments/native-architecture/src/platform/brushPreferences.ts', () => ({
  brushPreferencesStorage: { read: async () => null, write: async () => {} },
}));

const feedback = vi.hoisted(() => ({
  send: vi.fn().mockRejectedValue(new Error('Unexpected feedback submission in drawing fixture')),
  device: vi.fn(() => ({})),
  write: vi.fn(),
}));

// Drawing fixtures retain the actual feedback owner while refusing native SDK I/O outside their scope.
vi.mock('../../experiments/native-architecture/src/platform/feedback.ts', () => ({
  feedbackTransport: feedback.send,
  feedbackDevice: feedback.device,
  feedbackOffline: () => false,
  feedbackPolicyStorage: { read: async () => null, write: feedback.write },
}));

afterEach(() => {
  expect(feedback.send).not.toHaveBeenCalled();
  expect(feedback.device).not.toHaveBeenCalled();
  expect(feedback.write).not.toHaveBeenCalled();
});
