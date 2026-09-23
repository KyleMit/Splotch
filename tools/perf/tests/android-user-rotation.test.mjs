import { describe, expect, it } from 'vitest';
import {
  parseFixedToUserRotation,
  pinDisplayToUserRotation,
  restoreDisplayRotationMode,
} from '../lib/android-user-rotation.mjs';

function fakeAdb(current, { failWrite = false } = {}) {
  const calls = [];
  const run = (serial, command) => {
    calls.push([serial, ...command].join(' '));
    if (command.length === 2)
      return { ok: current !== null, stdout: `${current ?? ''}\n`, stderr: '' };
    if (failWrite) return { ok: false, stdout: '', stderr: 'denied' };
    current = command[2];
    return { ok: true, stdout: '', stderr: '' };
  };
  return { run, calls, mode: () => current };
}

describe('parseFixedToUserRotation', () => {
  it('reads every mode wm prints', () => {
    expect(parseFixedToUserRotation('default\n')).toBe('default');
    expect(parseFixedToUserRotation('enabled')).toBe('enabled');
    expect(parseFixedToUserRotation('enabled_if_no_auto_rotation')).toBe(
      'enabled_if_no_auto_rotation'
    );
  });

  it('refuses output that is not a mode', () => {
    expect(parseFixedToUserRotation('Error: unknown command')).toBeNull();
    expect(parseFixedToUserRotation('')).toBeNull();
  });
});

describe('pinDisplayToUserRotation', () => {
  it('enables the pin and restores the mode it found', () => {
    const adb = fakeAdb('default');
    const handle = pinDisplayToUserRotation('R5', adb.run);

    expect(handle).toEqual({ serial: 'R5', prior: 'default' });
    expect(adb.mode()).toBe('enabled');
    restoreDisplayRotationMode(handle, adb.run);
    expect(adb.mode()).toBe('default');
    expect(adb.calls).toEqual([
      'R5 wm fixed-to-user-rotation',
      'R5 wm fixed-to-user-rotation enabled',
      'R5 wm fixed-to-user-rotation default',
    ]);
  });

  it('leaves a pin it did not create in place', () => {
    const adb = fakeAdb('enabled');
    const handle = pinDisplayToUserRotation('R5', adb.run);
    restoreDisplayRotationMode(handle, adb.run);

    expect(adb.calls).toEqual(['R5 wm fixed-to-user-rotation']);
  });

  it('refuses to pin when the prior mode cannot be read', () => {
    const adb = fakeAdb(null);

    expect(() => pinDisplayToUserRotation('R5', adb.run)).toThrow('Could not read');
    expect(adb.calls).toEqual(['R5 wm fixed-to-user-rotation']);
  });

  it('reports a pin write that failed', () => {
    const adb = fakeAdb('default', { failWrite: true });

    expect(() => pinDisplayToUserRotation('R5', adb.run)).toThrow('enabled failed on R5');
  });
});
