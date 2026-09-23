// Android 12+ drops a touch — injected or a real finger — when windows another
// app draws above the touched window obscure the touch point past the system's
// maximum obscuring opacity (issue 2214). Nothing reaches the page, so a native
// tap aimed there records `eventType: uncaptured` with no armed events, and the
// only record is an `InputDispatcher` "Dropping untrusted touch" line in logcat.
//
// The capture phone runs a third-party navigation-bar accessibility service
// that draws two 1-px, ~80%-alpha windows down the portrait centre column
// (x=540 on a 1080-px panel). Each alone sits under the limit; together they
// combine past it, so every tap whose rounded centre lands on that column dies —
// the Settings Dark theme option among them. The runner reads the dispatcher's
// own window list and moves a tap off such a point rather than asking the
// capture phone's owner to uninstall an app.
import { tryCapture } from '../../lib/proc.mjs';
import { ADB } from '../../mobile/android/lib/android-toolchain.mjs';

// AOSP's default for Settings.Global.maximum_obscuring_opacity_for_touch.
export const ANDROID_MAX_OBSCURING_OPACITY = 0.8;

// How far from the centre, as a fraction of the target's size, a moved tap may
// land: inside the control's padding, clear of its neighbours' hit areas.
const TAP_OFFSET_FRACTIONS = [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3];

const WINDOW_LINE =
  /^\s*\d+: name=(?<name>.+?), id=\d+, displayId=(?<displayId>\d+), inputConfig=(?<inputConfig>[^,]*),.*?alpha=(?<alpha>[\d.]+), frame=\[(?<left>-?\d+),(?<top>-?\d+)\]\[(?<right>-?\d+),(?<bottom>-?\d+)\].*?ownerUid=(?<ownerUid>\d+).*?touchOcclusionMode=(?<mode>[A-Z_]+)/;

// The live section only: `dumpsys input` repeats the window list under
// "Input Dispatcher State at time of last ANR", which can be days old.
function liveDispatcherSection(dumpsysInput) {
  const start = dumpsysInput.indexOf('Input Dispatcher State:');
  if (start === -1) return '';
  const end = dumpsysInput.indexOf('Input Dispatcher State at time of last ANR', start);
  return dumpsysInput.slice(start, end === -1 ? undefined : end);
}

// Returned top-most first, the dispatcher's own order.
export function parseInputWindows(dumpsysInput) {
  const windows = [];
  for (const line of liveDispatcherSection(dumpsysInput).split('\n')) {
    const match = WINDOW_LINE.exec(line);
    if (!match || match.groups.displayId !== '0') continue;
    const { name, inputConfig, alpha, left, top, right, bottom, ownerUid, mode } = match.groups;
    windows.push({
      name,
      flags: new Set(inputConfig.split('|').map((flag) => flag.trim())),
      alpha: Number(alpha),
      frame: { left: +left, top: +top, right: +right, bottom: +bottom },
      ownerUid: Number(ownerUid),
      occlusionMode: mode,
    });
  }
  return windows;
}

function frameContains(frame, x, y) {
  return x >= frame.left && x < frame.right && y >= frame.top && y < frame.bottom;
}

// AOSP InputDispatcher::computeTouchOcclusionInfo, reduced to what decides a
// drop: windows above the target from another uid that can obscure it, with
// USE_OPACITY alphas combined per uid.
export function untrustedOcclusionAt(windows, packageName, x, y) {
  const targetIndex = windows.findIndex(
    (window) => window.name.includes(`${packageName}/`) && !window.flags.has('NOT_VISIBLE')
  );
  if (targetIndex === -1) return null;
  const targetUid = windows[targetIndex].ownerUid;
  const opacityByUid = new Map();
  for (const window of windows.slice(0, targetIndex)) {
    if (
      window.ownerUid === targetUid ||
      window.flags.has('NOT_VISIBLE') ||
      window.flags.has('TRUSTED_OVERLAY') ||
      window.alpha === 0 ||
      window.occlusionMode === 'ALLOW' ||
      !frameContains(window.frame, x, y)
    ) {
      continue;
    }
    if (window.occlusionMode === 'BLOCK_UNTRUSTED') return { window: window.name, opacity: 1 };
    const opacity = 1 - (1 - (opacityByUid.get(window.ownerUid) ?? 0)) * (1 - window.alpha);
    opacityByUid.set(window.ownerUid, opacity);
    if (opacity > ANDROID_MAX_OBSCURING_OPACITY) return { window: window.name, opacity };
  }
  return null;
}

// The centre when it is clear; otherwise the clear candidate nearest it. Null
// occlusion data (no adb, an unparseable dump) keeps the centre.
export function unoccludedTapPoint(bounds, windows, packageName) {
  const centre = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const candidates = TAP_OFFSET_FRACTIONS.flatMap((fx) =>
    TAP_OFFSET_FRACTIONS.map((fy) => ({
      x: Math.round(centre.x + fx * bounds.width),
      y: Math.round(centre.y + fy * bounds.height),
    }))
  ).sort(
    (a, b) =>
      Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y)
  );
  const [first] = candidates;
  if (!windows?.length) return { ...first, occludedBy: null };
  const occludedBy = untrustedOcclusionAt(windows, packageName, first.x, first.y);
  if (!occludedBy) return { ...first, occludedBy: null };
  const clear = candidates.find(
    (point) => !untrustedOcclusionAt(windows, packageName, point.x, point.y)
  );
  return { ...(clear ?? first), occludedBy };
}

export function readAndroidInputWindows(serial) {
  const result = tryCapture(ADB, ['-s', serial, 'shell', 'dumpsys', 'input']);
  return result.ok ? parseInputWindows(result.stdout) : null;
}
