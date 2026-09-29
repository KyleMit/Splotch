import { describe, expect, it } from 'vitest';
import { iosProvisioningCheck } from '../lib/ios-provisioning.mjs';

const team = 'EXAMPLETEAM';
const udid = 'new-device';
const profile = (devices, appId = `${team}.*`) => ({
  teams: [team],
  appId,
  devices,
  expires: '2099-01-01T00:00:00Z',
});

describe('iOS provisioning preflight', () => {
  it('accepts a profile that covers WebDriverAgent and the connected device', () => {
    expect(iosProvisioningCheck({ udid, team, profiles: [profile([udid])] })).toMatchObject({
      status: 'ok',
    });
  });

  it('flags a new device missing from the cached development profile', () => {
    expect(
      iosProvisioningCheck({ udid, team, profiles: [profile(['previous-device'])] })
    ).toMatchObject({
      status: 'blocked',
      detail: expect.stringContaining('register this iPhone if needed'),
    });
  });

  it('does not accept another app or expired profile as WebDriverAgent coverage', () => {
    const unrelated = profile([udid], `${team}.art.splotch.app`);
    const expired = { ...profile([udid]), expires: '2020-01-01T00:00:00Z' };
    expect(iosProvisioningCheck({ udid, team, profiles: [unrelated, expired] })).toMatchObject({
      status: 'blocked',
      detail: expect.stringContaining('no cached development profile for WebDriverAgent'),
    });
  });
});
