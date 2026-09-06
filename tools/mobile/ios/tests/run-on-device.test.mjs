import { describe, expect, it } from 'vitest';
import { resolvePhysicalIosUdid } from '../run-on-device.mjs';

const FAKE_UDID = '00008103-DEADBEEFDEADBEEF';
const FAKE_LEGACY_UDID = 'deadbeef'.repeat(5);

const listing = (devices) =>
  [
    '== Devices ==',
    'Host MacBook Pro (D0000000-0000-0000-0000-000000000000)',
    ...devices,
    '',
    '== Simulators ==',
    'iPad mini (A17 Pro) Simulator (26.5) (C0000000-0000-0000-0000-000000000000)',
    '',
  ].join('\n');

describe('resolvePhysicalIosUdid', () => {
  it('prefers IOS_UDID when set', () => {
    expect(resolvePhysicalIosUdid({ xctraceOutput: '', envUdid: FAKE_UDID })).toBe(FAKE_UDID);
  });

  it('selects the sole hardware UDID, ignoring the host Mac and simulators', () => {
    const xctraceOutput = listing([`Some iPad (26.5) (${FAKE_UDID})`]);
    expect(resolvePhysicalIosUdid({ xctraceOutput, envUdid: undefined })).toBe(FAKE_UDID);
  });

  it('selects a legacy 40-hex UDID device', () => {
    const xctraceOutput = listing([`Old iPad (12.5) (${FAKE_LEGACY_UDID})`]);
    expect(resolvePhysicalIosUdid({ xctraceOutput, envUdid: undefined })).toBe(FAKE_LEGACY_UDID);
  });

  it('reports ambiguity across mixed UDID formats instead of picking one', () => {
    const xctraceOutput = listing([
      `Some iPad (26.5) (${FAKE_UDID})`,
      `Old iPad (12.5) (${FAKE_LEGACY_UDID})`,
    ]);
    expect(() => resolvePhysicalIosUdid({ xctraceOutput, envUdid: undefined })).toThrow(/IOS_UDID/);
  });

  it('fails without a physical device', () => {
    expect(() => resolvePhysicalIosUdid({ xctraceOutput: listing([]), envUdid: undefined })).toThrow();
  });

  it('fails on ambiguity instead of guessing', () => {
    const xctraceOutput = listing([
      `Some iPad (26.5) (${FAKE_UDID})`,
      `Some iPhone (26.5) (${FAKE_UDID})`,
    ]);
    expect(() => resolvePhysicalIosUdid({ xctraceOutput, envUdid: undefined })).toThrow(/IOS_UDID/);
  });
});
