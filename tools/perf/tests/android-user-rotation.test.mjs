import { describe, expect, it } from 'vitest';
import {
  parseFixedToUserRotation,
  pinDisplayToUserRotation,
  readDisplayRotationMode,
  restoreDisplayRotationMode,
} from '../lib/android-user-rotation.mjs';

// `applies` lets a write take effect on the phone while adb still reports a
// failure — the lost-reply case cleanup has to survive.
function fakeAdb(current, { failWrite = false, applies = false } = {}) {
  const calls = [];
  const run = (serial, command) => {
    calls.push([serial, ...command].join(' '));
    if (command.length === 2) {
      return { ok: current !== null, stdout: `${current ?? ''}\n`, stderr: '' };
    }
    if (failWrite) {
      if (applies) current = command[2];
      return { ok: false, stdout: '', stderr: 'device offline' };
    }
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

describe('pinning the display to user rotation', () => {
  it('pins and restores the mode it read', () => {
    const adb = fakeAdb('default');
    const handle = readDisplayRotationMode('R5', adb.run);
    pinDisplayToUserRotation(handle, adb.run);

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

  it('keeps the restore handle when a pin lands but its reply is lost', () => {
    const adb = fakeAdb('default', { failWrite: true, applies: true });
    const handle = readDisplayRotationMode('R5', adb.run);

    expect(() => pinDisplayToUserRotation(handle, adb.run)).toThrow('enabled failed on R5');
    expect(adb.mode()).toBe('enabled');

    const recovered = fakeAdb(adb.mode());
    restoreDisplayRotationMode(handle, recovered.run);
    expect(recovered.mode()).toBe('default');
  });

  it('refuses a display a crashed capture left pinned', () => {
    const adb = fakeAdb('enabled');

    expect(() => readDisplayRotationMode('R5', adb.run)).toThrow('already pinned');
    expect(adb.calls).toEqual(['R5 wm fixed-to-user-rotation']);
  });

  it('refuses to pin when the prior mode cannot be read', () => {
    const adb = fakeAdb(null);

    expect(() => readDisplayRotationMode('R5', adb.run)).toThrow('Could not read');
    expect(adb.calls).toEqual(['R5 wm fixed-to-user-rotation']);
  });

  it('reports a restore that failed', () => {
    const adb = fakeAdb('enabled', { failWrite: true });

    expect(() => restoreDisplayRotationMode({ serial: 'R5', prior: 'default' }, adb.run)).toThrow(
      'default failed on R5'
    );
  });
});
