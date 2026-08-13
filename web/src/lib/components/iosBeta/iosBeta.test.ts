// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TESTFLIGHT_APP_URL, TESTFLIGHT_INVITE_CODE, TESTFLIGHT_INVITE_URL } from './iosBeta';

describe('/ios-beta facts', () => {
  it('keeps the published Splotch invitation code', () => {
    expect(TESTFLIGHT_INVITE_CODE).toBe('9GRH3JNQ');
  });

  it('builds the public invitation from its one invite code', () => {
    expect(TESTFLIGHT_INVITE_URL).toBe(
      `https://testflight.apple.com/join/${TESTFLIGHT_INVITE_CODE}`
    );
  });

  it('links to Apple for both TestFlight enrollment steps', () => {
    expect(new URL(TESTFLIGHT_INVITE_URL).host).toBe('testflight.apple.com');
    expect(new URL(TESTFLIGHT_APP_URL).host).toBe('apps.apple.com');
  });
});
