import { afterEach, expect, it, vi } from 'vitest';

const impactAsync = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
    Rigid: 'rigid',
    Soft: 'soft',
  },
  impactAsync,
}));

afterEach(() => {
  impactAsync.mockClear();
  vi.unstubAllGlobals();
});

it('asks the native motor for the impact style haptics.ts asks for', async () => {
  const { ImpactFeedbackStyle } = await import('expo-haptics');
  const { impactThreshold } = await import('../../src/platform/clearHaptics.ts');
  impactThreshold();
  await vi.waitFor(() =>
    expect(impactAsync).toHaveBeenCalledExactlyOnceWith(ImpactFeedbackStyle.Medium)
  );
});
it('vibrates the web for one accept-threshold pulse', async () => {
  const vibrate = vi.fn();
  vi.stubGlobal('navigator', { vibrate });
  const native = await import('../../src/platform/clearHaptics.web.ts');
  native.impactThreshold();
  expect(vibrate).toHaveBeenCalledExactlyOnceWith(15);
});
it('accepts a browser without a vibration motor', async () => {
  vi.stubGlobal('navigator', {});
  const native = await import('../../src/platform/clearHaptics.web.ts');
  expect(() => native.impactThreshold()).not.toThrow();
});
