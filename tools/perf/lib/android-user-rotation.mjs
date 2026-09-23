// The native app's Auto orientation requests SCREEN_ORIENTATION_SENSOR (issue
// 2193), which follows the accelerometer and ignores the user rotation that
// Appium's orientation endpoint writes. A phone lying still on the rig can only
// be turned by that user rotation, so once a capture has released the app's
// lock through the product's Orientation picker, Appium's rotation is refused
// with "Screen rotation cannot be changed … locked programmatically?" (issue
// 2215). `wm fixed-to-user-rotation enabled` makes the display follow the user
// rotation instead of the app's request: the substitute for physically turning
// the phone. It also overrides a Portrait or Landscape lock, so it is enabled
// only after the app's lock is released and put back before the rig is handed on.
import { tryCapture } from '../../lib/proc.mjs';
import { ADB } from '../../mobile/android/lib/android-toolchain.mjs';

const FIXED_TO_USER_ROTATION_MODES = new Set([
  'default',
  'enabled',
  'disabled',
  'enabled_if_no_auto_rotation',
]);

export const FIXED_TO_USER_ROTATION_STOCK = 'default';

export const fixedToUserRotationCommand = (mode) =>
  mode === undefined ? ['wm', 'fixed-to-user-rotation'] : ['wm', 'fixed-to-user-rotation', mode];

export function parseFixedToUserRotation(output) {
  const mode = String(output ?? '')
    .trim()
    .toLowerCase();
  return FIXED_TO_USER_ROTATION_MODES.has(mode) ? mode : null;
}

function adbShell(serial, command) {
  return tryCapture(ADB, ['-s', serial, 'shell', ...command]);
}

// The handle restoreDisplayRotationMode needs, read before anything is
// written so a caller can hold it across a pin whose adb reply was lost.
// Refuses rather than guessing when the prior mode cannot be read: a pin with
// nothing recorded to restore would leave the phone ignoring every app's
// orientation request. A display already pinned is refused too: no stock phone
// ships it enabled, so it is a pin a crashed capture left behind, and adopting
// it as the prior mode would make every later restore a no-op.
export function readDisplayRotationMode(serial, run = adbShell) {
  const read = run(serial, fixedToUserRotationCommand());
  const prior = read.ok ? parseFixedToUserRotation(read.stdout) : null;
  if (!prior) {
    throw new Error(
      `Could not read wm fixed-to-user-rotation on ${serial} (${read.stderr || read.stdout}), ` +
        'so the display cannot be pinned to user rotation and restored afterwards'
    );
  }
  if (prior === 'enabled') {
    throw new Error(
      `The display on ${serial} is already pinned to user rotation, most likely by an ` +
        'interrupted capture. Run npm run perf:release (or adb shell wm fixed-to-user-rotation ' +
        `${FIXED_TO_USER_ROTATION_STOCK}) before capturing again`
    );
  }
  return { serial, prior };
}

export function pinDisplayToUserRotation({ serial }, run = adbShell) {
  const pinned = run(serial, fixedToUserRotationCommand('enabled'));
  if (!pinned.ok) {
    throw new Error(`wm fixed-to-user-rotation enabled failed on ${serial}: ${pinned.stderr}`);
  }
}

export function restoreDisplayRotationMode({ serial, prior }, run = adbShell) {
  const restored = run(serial, fixedToUserRotationCommand(prior));
  if (!restored.ok) {
    throw new Error(`wm fixed-to-user-rotation ${prior} failed on ${serial}: ${restored.stderr}`);
  }
}
