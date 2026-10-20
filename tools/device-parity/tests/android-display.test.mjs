import { describe, expect, it } from 'vitest';
import { display0Focus, display0Orientation, focusedPackage } from '../lib/android-display.mjs';

// A secondary display listed ahead of the default one, as a cover screen or an emulator's second
// display can be: its focus and rotation are the first matches anywhere in the dump.
const TWO_DISPLAYS = `WINDOW MANAGER DISPLAY CONTENTS (dumpsys window displays)
  Display: mDisplayId=2 (organized)
    mRotation=1 mDeferredRotationPauseCount=0
    mCurrentFocus=Window{aa11 u0 com.example.launcher/com.example.launcher.Home}
  Display: mDisplayId=0 (organized)
    mRotation=0 mDeferredRotationPauseCount=0
    mCurrentAppOrientation=SCREEN_ORIENTATION_UNSPECIFIED
    mCurrentFocus=Window{bb22 u0 art.example.app/art.example.app.MainActivity}
`;

describe('Display0 reads', () => {
  it('take focus and rotation from Display0, not the first display in the dump', () => {
    expect(focusedPackage(display0Focus(TWO_DISPLAYS))).toBe('art.example.app');
    expect(display0Orientation(TWO_DISPLAYS)).toEqual({
      rotation: 0,
      appOrientation: 'SCREEN_ORIENTATION_UNSPECIFIED',
    });
  });

  it('fail on a dump with no Display0 section', () => {
    const secondaryOnly = TWO_DISPLAYS.split('  Display: mDisplayId=0')[0];

    expect(() => display0Focus(secondaryOnly)).toThrow('no Display0 section');
  });
});

describe('focusedPackage', () => {
  it('reads the whole package, so one package that prefixes another cannot pass for it', () => {
    const focus = 'Window{cc33 u0 art.example.app.baseline/art.example.app.MainActivity}';

    expect(focusedPackage(focus)).toBe('art.example.app.baseline');
    expect(focusedPackage(focus)).not.toBe('art.example.app');
  });
});
