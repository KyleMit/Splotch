// The device classes the crash harness runs on, and what each allows.
// iPadOS treats four- and five-finger swipes as app switching, and Samsung phones add multi-finger
// capture gestures, so only the emulator keeps five simultaneous fingers.
export const CRASH_TARGETS = {
  'ios-simulator': { platform: 'ios', physical: false, maxFingers: 3 },
  'android-emulator': { platform: 'android', physical: false, maxFingers: 5 },
  'ios-device': { platform: 'ios', physical: true, maxFingers: 3 },
  'android-device': { platform: 'android', physical: true, maxFingers: 3 },
};

export const CRASH_TARGET_NAMES = Object.keys(CRASH_TARGETS);

export function assertSessionMatchesTarget(session, target) {
  const expected = CRASH_TARGETS[target].platform;
  if (session.platform !== expected) {
    throw new Error(`--target=${target} needs an ${expected} session, got ${session.platform}`);
  }
}
