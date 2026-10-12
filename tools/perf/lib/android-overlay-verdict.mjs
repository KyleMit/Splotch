// Whether an untrusted overlay can drop touches anywhere on the Android
// foreground app's content (issues 2229, 2270). The rig phone's NU Navigation
// Bar once stacked two 1 px USE_OPACITY windows at x=540 whose combined opacity
// passed Android's obscuring limit, and every drawing swipe through that column
// died before the page saw it. The preflight and `perf:session:person
// --check=overlay` both read this one verdict.
//
// Kept apart from android-touch-occlusion.mjs, which only reuses its parser and
// limit here: that module is hashed into the `perf:ios:xcuitest:actions`
// instrument fingerprint, and this verdict does not change how a capture taps.
import { tryCapture } from '../../lib/proc.mjs';
import { ADB } from '../../mobile/android/lib/android-toolchain.mjs';
import { ANDROID_MAX_OBSCURING_OPACITY, parseInputWindows } from './android-touch-occlusion.mjs';

// `<hash> <package>/<activity>`: an activity window, not an input sink,
// embedded surface, or system bar.
const ACTIVITY_WINDOW_NAME = /^\S+ [\w.]+\/[\w.$]+$/;

function windowPackage(name) {
  return name.split(' ').at(-1).split('/')[0];
}

// Every visible activity window can receive a touch: a picture-in-picture
// window in front must not hide an overlay over the activity behind it.
function contentWindows(windows) {
  return windows.filter(
    (window) =>
      ACTIVITY_WINDOW_NAME.test(window.name) &&
      !window.flags.has('NOT_VISIBLE') &&
      !window.flags.has('NO_INPUT_CHANNEL') &&
      !window.flags.has('TRUSTED_OVERLAY')
  );
}

function frameContains(frame, x, y) {
  return x >= frame.left && x < frame.right && y >= frame.top && y < frame.bottom;
}

// AOSP InputDispatcher::canBeObscuredBy, narrowed to the windows that combine
// by opacity: a visible, untrusted USE_OPACITY window. An alpha-0 window adds
// nothing to the sum, touchable or not.
function opacityOverlays(windows) {
  return windows.filter(
    (window) =>
      window.occlusionMode === 'USE_OPACITY' &&
      !window.flags.has('NOT_VISIBLE') &&
      !window.flags.has('TRUSTED_OVERLAY') &&
      window.alpha > 0
  );
}

// Android judges occlusion against the window a touch lands on: the top-most
// activity under the point. Only another uid's overlays above that window
// count. With no activity window at all (a launcher-only screen) the whole
// display is judged against every overlay.
function overlaysObscuring(windows, contents, overlays, x, y) {
  if (!contents.length) return overlays.filter((overlay) => frameContains(overlay.frame, x, y));
  const target = contents.find((content) => frameContains(content.frame, x, y));
  if (!target) return null;
  const targetIndex = windows.indexOf(target);
  return overlays.filter(
    (overlay) =>
      windows.indexOf(overlay) < targetIndex &&
      overlay.ownerUid !== target.ownerUid &&
      frameContains(overlay.frame, x, y)
  );
}

// Android sums one uid's USE_OPACITY windows under a POINT
// (untrustedOcclusionAt). Within the grid drawn by every overlay's left/top
// edge and every activity's edges, the touch target and the overlays present
// only shrink moving right or down, so each cell's worst sum sits at its
// top-left corner and those corners are the only points worth evaluating.
function worstPoint(windows, contents, overlays) {
  const edges = (pick) =>
    new Set([
      ...overlays.map((window) => window.frame[pick[0]]),
      ...contents.flatMap((window) => pick.map((side) => window.frame[side])),
    ]);
  let worst = { opacity: 0, x: null, y: null, overlay: null, target: null };
  for (const x of edges(['left', 'right'])) {
    for (const y of edges(['top', 'bottom'])) {
      const obscuring = overlaysObscuring(windows, contents, overlays, x, y);
      if (!obscuring) continue;
      const byUid = new Map();
      for (const overlay of obscuring) {
        const opacity = 1 - (1 - (byUid.get(overlay.ownerUid)?.opacity ?? 0)) * (1 - overlay.alpha);
        byUid.set(overlay.ownerUid, { opacity, overlay });
      }
      for (const { opacity, overlay } of byUid.values()) {
        if (opacity > worst.opacity) {
          const target = contents.find((content) => frameContains(content.frame, x, y)) ?? null;
          worst = { opacity, x, y, overlay, target };
        }
      }
    }
  }
  return worst;
}

// Enough places that a sum near the limit never prints as the limit itself.
const OPACITY_DECIMALS = 4;

function displayedOpacity(opacity) {
  let decimals = OPACITY_DECIMALS;
  while (
    opacity !== ANDROID_MAX_OBSCURING_OPACITY &&
    Number(opacity.toFixed(decimals)) === ANDROID_MAX_OBSCURING_OPACITY
  ) {
    decimals += 1;
  }
  return Number(opacity.toFixed(decimals));
}

export function untrustedOverlayVerdict(windows) {
  if (!windows.length) {
    return {
      pass: false,
      windows: 0,
      combinedOpacity: null,
      point: null,
      package: null,
      detail: 'dumpsys input listed no display-0 windows, so no overlay could be checked',
    };
  }
  const contents = contentWindows(windows);
  const overlays = opacityOverlays(windows).filter(
    (overlay) =>
      !contents.length ||
      contents.some(
        (content) =>
          windows.indexOf(overlay) < windows.indexOf(content) &&
          overlay.ownerUid !== content.ownerUid
      )
  );
  const worst = worstPoint(windows, contents, overlays);
  const combined = displayedOpacity(worst.opacity);
  const pass = worst.opacity <= ANDROID_MAX_OBSCURING_OPACITY;
  const judged = worst.overlay ? [worst.target].filter(Boolean) : contents;
  const over = judged.length
    ? [...new Set(judged.map((content) => windowPackage(content.name)))].join(', ')
    : 'the display';
  const overlayPackage = worst.overlay ? windowPackage(worst.overlay.name) : null;
  return {
    pass,
    windows: overlays.length,
    combinedOpacity: combined,
    point: worst.x === null ? null : `(${worst.x},${worst.y})`,
    package: overlayPackage,
    detail: overlayPackage
      ? `${overlayPackage}'s USE_OPACITY windows combine to ${combined} at (${worst.x},${worst.y}) over ${over} (${pass ? '≤' : '>'} ${ANDROID_MAX_OBSCURING_OPACITY})`
      : `no untrusted USE_OPACITY overlay over ${over}`,
  };
}

export function readOverlayVerdict(serial) {
  const result = tryCapture(ADB, ['-s', serial, 'shell', 'dumpsys', 'input']);
  if (!result.ok)
    return { pass: false, detail: `adb dumpsys input failed: ${result.stderr?.trim()}` };
  return untrustedOverlayVerdict(parseInputWindows(result.stdout));
}

export function overlayCheck(verdict) {
  return {
    name: 'android touch overlay',
    status: verdict.pass ? 'ok' : 'blocked',
    detail: verdict.detail,
  };
}
