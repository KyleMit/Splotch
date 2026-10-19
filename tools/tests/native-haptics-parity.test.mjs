import { readFileSync } from 'node:fs';
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

// Shipping's web branch runs here as-is: it vibrates whenever the build is not Capacitor.
vi.mock('../../web/src/lib/platform/index.ts', () => ({ isNative: () => false }));
vi.mock('../../web/src/lib/nativePlugin.ts', () => ({
  lazyPluginModule: () => () => Promise.reject(new Error('native-only plugin')),
}));

const SHIPPING = readFileSync(
  new URL('../../web/src/lib/platform/haptics.ts', import.meta.url),
  'utf8'
);
// The impact the shipping app asks @capacitor/haptics for.
const SHIPPING_STYLE = /Haptics\.impact\(\{ style: ImpactStyle\.(\w+) \}\)/.exec(SHIPPING)?.[1];

afterEach(() => {
  impactAsync.mockClear();
  vi.unstubAllGlobals();
});

it('asks the native motor for the impact style haptics.ts asks for', async () => {
  expect(SHIPPING_STYLE).toBeTypeOf('string');
  const { ImpactFeedbackStyle } = await import('expo-haptics');
  const { impactThreshold } =
    await import('../../experiments/native-architecture/src/platform/clearHaptics.ts');
  impactThreshold();
  await vi.waitFor(() => expect(impactAsync).toHaveBeenCalledOnce());
  expect(impactAsync).toHaveBeenCalledWith(ImpactFeedbackStyle[SHIPPING_STYLE]);
});

it('vibrates the web exactly as haptics.ts does', async () => {
  vi.stubGlobal('__IS_CAPACITOR__', false);
  const shippingVibrate = vi.fn();
  vi.stubGlobal('navigator', { vibrate: shippingVibrate });
  const shipping = await import('../../web/src/lib/platform/haptics.ts');
  shipping.impactThreshold();
  const nativeVibrate = vi.fn();
  vi.stubGlobal('navigator', { vibrate: nativeVibrate });
  const native =
    await import('../../experiments/native-architecture/src/platform/clearHaptics.web.ts');
  native.impactThreshold();
  expect(shippingVibrate).toHaveBeenCalledOnce();
  expect(nativeVibrate.mock.calls).toEqual(shippingVibrate.mock.calls);
});
