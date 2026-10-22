import { describe, expect, it } from 'vitest';
import { DEV_APP_ID, STORE_APP_ID } from '../../release/lib/native-app.mjs';
import { TARGETS, STORE_XCCONFIG } from '../../release/build-native-release.mjs';
import { readHostedTestApiOrigin, requireVirtualTarget } from '../lib/hosted-api-journey.mjs';

describe('hosted native UI coverage', () => {
  it('selects only existing test deploy origins at build time', () => {
    expect(readHostedTestApiOrigin({})).toBe('https://test.splotch.art');
    expect(
      readHostedTestApiOrigin({
        EXPO_PUBLIC_SPLOTCH_API_ORIGIN: 'https://test--splotchy.netlify.app',
      })
    ).toBe('https://test--splotchy.netlify.app');
    expect(() =>
      readHostedTestApiOrigin({ EXPO_PUBLIC_SPLOTCH_API_ORIGIN: 'https://splotch.art' })
    ).toThrow('known test API');
    expect(() =>
      readHostedTestApiOrigin({ EXPO_PUBLIC_SPLOTCH_API_ORIGIN: 'https://outside.example' })
    ).toThrow('known test API');
  });
  it('keeps the store simulator guard and adds a separate development Release target', () => {
    const store = TARGETS.simulator;
    const development = TARGETS['development-simulator'];
    expect(store.appId).toBe(STORE_APP_ID);
    expect(store.steps.flatMap((step) => step.args)).toContain(STORE_XCCONFIG);
    expect(development.appId).toBe(DEV_APP_ID);
    expect(development.steps.flatMap((step) => step.args)).not.toContain(STORE_XCCONFIG);
    expect(development.steps.flatMap((step) => step.args)).toContain('Release');
    expect(development.steps.flatMap((step) => step.args)).toContain('CODE_SIGNING_ALLOWED=YES');
    expect(development.steps.flatMap((step) => step.args)).toContain('CODE_SIGN_IDENTITY=-');
    expect(store.steps.flatMap((step) => step.args)).toContain('CODE_SIGNING_ALLOWED=NO');
    expect(development.artifact).not.toBe(store.artifact);
  });
  it('accepts explicit virtual targets', () => {
    expect(() => requireVirtualTarget('android', 'emulator-5556')).not.toThrow();
    expect(() =>
      requireVirtualTarget('ios', 'sim-id', {
        iOS: [{ udid: 'sim-id', state: 'Booted', isAvailable: true }],
      })
    ).not.toThrow();
  });
  it.each([
    ['android', 'physical-serial', {}],
    ['android', undefined, {}],
    ['ios', 'physical-udid', {}],
    ['ios', 'sim-id', { iOS: [{ udid: 'sim-id', state: 'Shutdown', isAvailable: true }] }],
    ['unknown', 'emulator-5556', {}],
  ])(
    'rejects a physical, missing or unavailable %s target as a negative control',
    (platform, device, simulators) => {
      expect(() => requireVirtualTarget(platform, device, simulators)).toThrow(
        'explicit Android emulator'
      );
    }
  );
});
