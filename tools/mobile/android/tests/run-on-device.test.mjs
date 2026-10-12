import { describe, expect, it } from 'vitest';
import { resolvePhysicalAndroidSerial } from '../run-on-device.mjs';

const FAKE_SERIAL = 'R5CFAKESER1';

describe('resolvePhysicalAndroidSerial', () => {
  it('prefers ANDROID_SERIAL when set', () => {
    expect(resolvePhysicalAndroidSerial({ adbOutput: '', envSerial: FAKE_SERIAL })).toBe(
      FAKE_SERIAL
    );
  });

  it('selects the sole physical device, ignoring emulators and offline rows', () => {
    const adbOutput = [
      'List of devices attached',
      'emulator-5554\tdevice',
      `${FAKE_SERIAL}\tdevice`,
      'unauthorized-one\tunauthorized',
      '',
    ].join('\n');
    expect(resolvePhysicalAndroidSerial({ adbOutput, envSerial: undefined })).toBe(FAKE_SERIAL);
  });

  it('fails without a physical device', () => {
    const adbOutput = 'List of devices attached\nemulator-5554\tdevice\n';
    expect(() => resolvePhysicalAndroidSerial({ adbOutput, envSerial: undefined })).toThrow();
  });

  it('fails on ambiguity instead of guessing', () => {
    const adbOutput = `List of devices attached\n${FAKE_SERIAL}\tdevice\n${FAKE_SERIAL}\tdevice\n`;
    expect(() => resolvePhysicalAndroidSerial({ adbOutput, envSerial: undefined })).toThrow(
      /ANDROID_SERIAL/
    );
  });
});
