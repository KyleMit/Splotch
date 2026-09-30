import { describe, expect, it } from 'vitest';
import { iosLaunchBlocker } from '../lib/capture-readiness.mjs';

describe('iOS launch preflight', () => {
  it('skips the WDA probe when signing is unavailable', () => {
    expect(
      iosLaunchBlocker({ iosDeveloperModeEnabled: true, iosProvisioningReady: false })
    ).toContain('signing is not ready');
  });

  it('skips the WDA probe when Developer Mode is off', () => {
    expect(
      iosLaunchBlocker({ iosDeveloperModeEnabled: false, iosProvisioningReady: true })
    ).toContain('Developer Mode is off');
  });
});
