import { describe, expect, it } from 'vitest';
import {
  androidPageLaunchSteps,
  androidRotationRestoreCommands,
  androidRotationVerdict,
} from '../split-capture/lib/android-input.mjs';

describe('androidRotationVerdict', () => {
  it('passes when the page followed the device both ways', () => {
    const verdict = androidRotationVerdict([
      { requested: 'LANDSCAPE', observed: 'LANDSCAPE' },
      { requested: 'PORTRAIT', observed: 'PORTRAIT' },
    ]);

    expect(verdict.ok).toBe(true);
    expect(verdict.detail).toContain('landscape and portrait');
  });

  // The shape observed once on the physical SM-G990U1: a LANDSCAPE request came back
  // PORTRAIT, which is the fault that cost all eight landscape drawing cells on a
  // green rig. It was attributed to `am force-stop` returning `user_rotation` to 0,
  // and that attribution did not survive re-testing — 8 later trials kept it at 1 in
  // every arrangement. The mismatch this asserts is real; its cause is unexplained,
  // and this case is a synthetic injection rather than a device fault anyone can
  // summon on demand.
  it('fails, naming the orientation that did not arrive', () => {
    const verdict = androidRotationVerdict([
      { requested: 'LANDSCAPE', observed: 'PORTRAIT' },
      { requested: 'PORTRAIT', observed: 'PORTRAIT' },
    ]);

    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toContain('landscape came back as portrait');
    expect(verdict.detail).toContain('Every landscape cell will fail');
  });

  // A page that never loads reports no orientation at all. That is still a rotation
  // failure from the campaign's point of view, and it must not read as a pass.
  it('fails when the page never reported an orientation', () => {
    const verdict = androidRotationVerdict([{ requested: 'LANDSCAPE', observed: null }]);

    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toContain('landscape came back as nothing');
  });
});

describe('androidRotationRestoreCommands', () => {
  it('writes back the values that were there', () => {
    expect(
      androidRotationRestoreCommands({ accelerometer_rotation: '1', user_rotation: '3' })
    ).toEqual([
      ['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '1'],
      ['shell', 'settings', 'put', 'system', 'user_rotation', '3'],
    ]);
  });

  // `settings get` prints the literal string `null` for a setting that was never
  // written. Writing that back leaves the device holding a value it cannot parse, so
  // an absent setting is restored by removing it.
  it('deletes a setting that had never been written', () => {
    expect(
      androidRotationRestoreCommands({ accelerometer_rotation: 'null', user_rotation: undefined })
    ).toEqual([
      ['shell', 'settings', 'delete', 'system', 'accelerometer_rotation'],
      ['shell', 'settings', 'delete', 'system', 'user_rotation'],
    ]);
  });
});

describe('the launch order the verification drives', () => {
  // The verification is only worth anything if it exercises the order a capture
  // uses. Stopping after rotating is the defect it exists to catch, so a change that
  // reorders these steps must fail here rather than in a landscape cell.
  it('stops the browser before rotating, and launches last', () => {
    const steps = androidPageLaunchSteps('LANDSCAPE', 'http://host/page');

    expect(steps.map((step) => step.args.join(' '))).toEqual([
      'shell am force-stop com.android.chrome',
      'shell settings put system accelerometer_rotation 0',
      'shell settings put system user_rotation 1',
      "shell am start -a android.intent.action.VIEW -d 'http://host/page' com.android.chrome",
    ]);
  });
});
