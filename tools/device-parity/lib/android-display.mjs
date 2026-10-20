// Reads of `dumpsys window displays`, bound to the default display.
import { adb } from './device-commands.mjs';

const DISPLAY_HEADER = /^\s*Display: mDisplayId=/m;

// A device with more than one display (a cover screen, DeX, an emulator's secondary display) dumps
// one section per display, so the first mCurrentFocus or mRotation in the dump can belong to any of
// them. Every read here takes Display0's own section, and a dump without one fails.
function display0Section(dumpsys) {
  const section = dumpsys.split(DISPLAY_HEADER).find((chunk) => /^0\b/.test(chunk));
  if (section === undefined) throw new Error('dumpsys window displays listed no Display0 section');
  return section;
}

export function display0Focus(dumpsys) {
  return (
    display0Section(dumpsys)
      .match(/mCurrentFocus=(.*)$/m)?.[1]
      .trim() ?? ''
  );
}

export function focusedPackage(focus) {
  return focus.match(/^Window\{\S+ \S+ ([^/}\s]+)/)?.[1] ?? '';
}

export function display0Orientation(dumpsys) {
  const section = display0Section(dumpsys);
  return {
    rotation: Number(section.match(/mRotation=(\d)/)?.[1] ?? 0),
    appOrientation: section.match(/mCurrentAppOrientation=([A-Z_]+)/)?.[1] ?? null,
  };
}

export function readDisplays(serial) {
  return adb(serial, 'shell', 'dumpsys', 'window', 'displays');
}
