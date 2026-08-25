import { describe, expect, it } from 'vitest';
import { handCaptureArgs, operatorSessionPlan } from '../run-operator-session.mjs';

describe('operatorSessionPlan', () => {
  it('expands hand steps across brushes and orientations for attached devices', () => {
    const plan = operatorSessionPlan({
      steps: ['grant', 'android-hand', 'ios-hand'],
      brushes: ['pen', 'crayon'],
      orientations: ['PORTRAIT', 'LANDSCAPE'],
      androidSerial: 'R5CRC3AVCXM',
      iosUdid: '00008103-0006202E3CF1001E',
    });
    expect(plan.filter((item) => item.step === 'grant')).toHaveLength(1);
    expect(plan.filter((item) => item.step === 'android-hand')).toHaveLength(4);
    expect(plan.filter((item) => item.step === 'ios-hand')).toHaveLength(4);
    expect(plan.every((item) => item.skipped === null)).toBe(true);
  });

  it('marks a missing device as skipped rather than dropping its items', () => {
    const plan = operatorSessionPlan({ androidSerial: 'serial', iosUdid: null });
    const ios = plan.filter((item) => item.step === 'ios-hand' || item.step === 'grant');
    expect(ios.length).toBeGreaterThan(0);
    expect(ios.every((item) => item.skipped?.includes('iPad'))).toBe(true);
    expect(plan.filter((item) => item.step === 'android-hand').every((i) => !i.skipped)).toBe(true);
  });

  it('rejects an unknown step, brush, or orientation by throwing', () => {
    expect(() => operatorSessionPlan({ steps: ['grant', 'reboot'] })).toThrow(/unknown step/);
    expect(() => operatorSessionPlan({ brushes: ['chalk'] })).toThrow(/unknown brush/);
    expect(() => operatorSessionPlan({ orientations: ['UPSIDE_DOWN'] })).toThrow(
      /unknown orientation/
    );
  });
});

describe('handCaptureArgs', () => {
  const base = { brush: 'pen', orientation: 'PORTRAIT', theme: 'light', seconds: 25 };

  it('drives Android through adb with the serial and the iPad manually without one', () => {
    const android = handCaptureArgs({
      ...base,
      platform: 'android',
      host: 'http://192.168.40.53:4175',
      serial: 'R5CRC3AVCXM',
    });
    expect(android.args).toContain('--open=adb');
    expect(android.args).toContain('--device-serial=R5CRC3AVCXM');
    const ios = handCaptureArgs({ ...base, platform: 'ios', host: 'http://192.168.40.53:4175' });
    expect(ios.args).toContain('--open=manual');
    expect(ios.args.some((arg) => arg.startsWith('--device-serial'))).toBe(false);
  });

  it('always captures the native runtime and writes the artifact under the label', () => {
    const { label, output, args } = handCaptureArgs({
      ...base,
      platform: 'ios',
      brush: 'crayon',
      host: 'http://h:1',
    });
    expect(args).toContain('--native-app');
    expect(label).toBe('hand-ios-native-crayon-portrait-light');
    expect(output).toContain(label);
    expect(args).toContain(`--output=${output}`);
  });
});
