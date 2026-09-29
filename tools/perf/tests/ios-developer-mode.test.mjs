import { describe, expect, it } from 'vitest';
import { iosDeveloperModeCheck } from '../lib/ios-developer-mode.mjs';

const coreDeviceResult = (mode) => ({
  ok: true,
  out: JSON.stringify({
    result: { properties: { state: { developerModeStatus: { enabled: { mode } } } } },
  }),
  err: '',
});

describe('iOS Developer Mode preflight', () => {
  it('accepts the enabled CoreDevice status', () => {
    expect(iosDeveloperModeCheck(coreDeviceResult(1))).toMatchObject({
      status: 'ok',
      enabled: true,
    });
  });

  it('blocks a disabled device with the steps needed to resume capture', () => {
    expect(iosDeveloperModeCheck(coreDeviceResult(0))).toMatchObject({
      status: 'blocked',
      enabled: false,
      detail: expect.stringContaining('Settings → Privacy & Security → Developer Mode → On'),
    });
  });

  it('reports an unreadable status without claiming Developer Mode is off', () => {
    expect(iosDeveloperModeCheck({ ok: false, out: '', err: 'device unavailable' })).toMatchObject({
      status: 'warn',
      enabled: null,
      detail: expect.stringContaining('device unavailable'),
    });
  });
});
