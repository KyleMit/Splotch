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

// The top-most visible activity window is the content every touch is aimed at.
function contentWindow(windows) {
  return (
    windows.find(
      (window) =>
        ACTIVITY_WINDOW_NAME.test(window.name) &&
        !window.flags.has('NOT_VISIBLE') &&
        !window.flags.has('NO_INPUT_CHANNEL') &&
        !window.flags.has('TRUSTED_OVERLAY')
    ) ?? null
  );
}

function frameContains(frame, x, y) {
  return x >= frame.left && x < frame.right && y >= frame.top && y < frame.bottom;
}

// AOSP InputDispatcher::canBeObscuredBy, narrowed to the windows that combine
// by opacity: another uid's visible, untrusted USE_OPACITY window. An alpha-0
// window adds nothing to the sum, touchable or not.
function opacityOverlays(windows, content) {
  const above = content ? windows.slice(0, windows.indexOf(content)) : windows;
  return above.filter(
    (window) =>
      window.occlusionMode === 'USE_OPACITY' &&
      window.ownerUid !== content?.ownerUid &&
      !window.flags.has('NOT_VISIBLE') &&
      !window.flags.has('TRUSTED_OVERLAY') &&
      window.alpha > 0
  );
}

// Android sums one uid's USE_OPACITY windows under a POINT
// (untrustedOcclusionAt), so the verdict evaluates every point where the
// overlays' frames, or the content's, begin: the worst sum over any region is
// reached at the corner where that region's windows all start. Without a
// content window (a launcher-only screen) the whole display counts.
export function untrustedOverlayVerdict(windows) {
  const content = contentWindow(windows);
  const overlays = opacityOverlays(windows, content);
  const frames = [...overlays, ...(content ? [content] : [])].map((window) => window.frame);
  const xs = new Set(frames.map((frame) => frame.left));
  const ys = new Set(frames.map((frame) => frame.top));
  let worst = { opacity: 0, x: null, y: null, overlay: null };
  for (const x of xs) {
    for (const y of ys) {
      if (content && !frameContains(content.frame, x, y)) continue;
      const byUid = new Map();
      for (const overlay of overlays.filter((window) => frameContains(window.frame, x, y))) {
        const opacity = 1 - (1 - (byUid.get(overlay.ownerUid)?.opacity ?? 0)) * (1 - overlay.alpha);
        byUid.set(overlay.ownerUid, { opacity, overlay });
      }
      for (const { opacity, overlay } of byUid.values()) {
        if (opacity > worst.opacity) worst = { opacity, x, y, overlay };
      }
    }
  }
  const combined = Math.round(worst.opacity * 1000) / 1000;
  const pass = worst.opacity <= ANDROID_MAX_OBSCURING_OPACITY;
  const over = content ? windowPackage(content.name) : 'the display';
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
