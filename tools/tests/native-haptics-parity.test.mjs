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

const SHIPPING = readFileSync(
  new URL('../../web/src/lib/platform/haptics.ts', import.meta.url),
  'utf8'
);
// The impact the shipping app asks @capacitor/haptics for, and its Vibration API stand-in.
const SHIPPING_STYLE = /Haptics\.impact\(\{ style: ImpactStyle\.(\w+) \}\)/.exec(SHIPPING)?.[1];
const SHIPPING_WEB_IMPACT_MS = Number(/const WEB_IMPACT_MS = (\d+);/.exec(SHIPPING)?.[1]);

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

it('vibrates the web for the duration haptics.ts uses', async () => {
  expect(SHIPPING_WEB_IMPACT_MS).toBeGreaterThan(0);
  const vibrate = vi.fn();
  vi.stubGlobal('navigator', { vibrate });
  const { impactThreshold } =
    await import('../../experiments/native-architecture/src/platform/clearHaptics.web.ts');
  impactThreshold();
  expect(vibrate).toHaveBeenCalledExactlyOnceWith(SHIPPING_WEB_IMPACT_MS);
});
