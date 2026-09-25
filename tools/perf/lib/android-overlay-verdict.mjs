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

// Android judges occlusion against the window a touch lands on, so every
// visible activity window is content: a picture-in-picture window in front
// must not hide an overlay over the activity behind it.
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
// (untrustedOcclusionAt), so this evaluates every point where the overlays'
// frames, or the content's, begin: the worst sum over any region is reached at
// the corner where that region's windows all start. A null content (no
// activity window, a launcher-only screen) judges the whole display.
function worstOverContent(windows, content) {
  const overlays = opacityOverlays(windows, content);
  const frames = [...overlays, ...(content ? [content] : [])].map((window) => window.frame);
  const xs = new Set(frames.map((frame) => frame.left));
  const ys = new Set(frames.map((frame) => frame.top));
  let worst = { opacity: 0, x: null, y: null, overlay: null, overlays, content };
  for (const x of xs) {
    for (const y of ys) {
      if (content && !frameContains(content.frame, x, y)) continue;
      const byUid = new Map();
      for (const overlay of overlays.filter((window) => frameContains(window.frame, x, y))) {
        const opacity = 1 - (1 - (byUid.get(overlay.ownerUid)?.opacity ?? 0)) * (1 - overlay.alpha);
        byUid.set(overlay.ownerUid, { opacity, overlay });
      }
      for (const { opacity, overlay } of byUid.values()) {
        if (opacity > worst.opacity) worst = { ...worst, opacity, x, y, overlay };
      }
    }
  }
  return worst;
}

// Enough places that a sum just past the limit never prints as the limit.
const OPACITY_DECIMALS = 4;

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
  const readings = (contents.length ? contents : [null]).map((content) =>
    worstOverContent(windows, content)
  );
  const worst = readings.reduce((a, b) => (b.opacity > a.opacity ? b : a));
  const combined = Number(worst.opacity.toFixed(OPACITY_DECIMALS));
  const pass = worst.opacity <= ANDROID_MAX_OBSCURING_OPACITY;
  const judged = worst.overlay ? [worst.content].filter(Boolean) : contents;
  const over = judged.length
    ? [...new Set(judged.map((content) => windowPackage(content.name)))].join(', ')
    : 'the display';
  const overlayPackage = worst.overlay ? windowPackage(worst.overlay.name) : null;
  return {
    pass,
    windows: new Set(readings.flatMap((reading) => reading.overlays)).size,
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
