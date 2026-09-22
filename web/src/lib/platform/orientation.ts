import { browser } from '$app/environment';
import {
  getPlatform,
  isNative,
  supportsOrientationLock,
  type LockableScreenOrientation,
  type Orientation,
} from '$lib/platform';

type OrientationTarget = Orientation | 'unlocked';

// A web lock is honored or refused per display context — Chrome on Android
// grants one only in fullscreen, and exiting fullscreen releases it — so the
// latch keys a web lock on that context. A refused tab lock is then retried the
// moment fullscreen begins, and one released by leaving fullscreen is requested
// afresh on the next entry. Native and unlocking never depend on it.
type OrientationRequest = OrientationTarget | `${Orientation}:fullscreen`;

let lastRequested: OrientationRequest | null = null;

function orientationTarget(
  lockRotationEnabled: boolean,
  forceLandscapeOrientation: boolean
): OrientationTarget {
  if (!lockRotationEnabled) return 'unlocked';
  return forceLandscapeOrientation ? 'landscape' : 'portrait';
}

function releaseLatch(request: OrientationRequest) {
  if (lastRequested === request) lastRequested = null;
}

export async function applyDeviceOrientationPreference(
  lockRotationEnabled: boolean,
  forceLandscapeOrientation: boolean,
  fullscreenActive: boolean
) {
  if (!browser) return;

  // Windowed platforms (iPadOS 26+) own orientation themselves; locking there
  // only floats a letterboxed window, so leave it to the OS window controls.
  if (!supportsOrientationLock()) return;

  const target = orientationTarget(lockRotationEnabled, forceLandscapeOrientation);
  const native = __IS_CAPACITOR__ && isNative();
  const request: OrientationRequest =
    !native && target !== 'unlocked' && fullscreenActive ? `${target}:fullscreen` : target;

  if (request === lastRequested) return;
  lastRequested = request;

  // Native: lock at the Activity level via @capacitor/screen-orientation. Unlike
  // the Web Screen Orientation API, a Portrait or Landscape lock overrides the OS
  // Auto-Rotate setting. The plugin's unlock() defers to that setting instead, so
  // Android unlocks through SensorOrientation to rotate even with Auto-Rotate off;
  // iOS offers no way past its rotation lock and keeps unlock().
  // The literal __IS_CAPACITOR__ lets Rollup drop the plugin import from the web
  // bundle; isNative() alone is a runtime check it can't tree-shake.
  if (__IS_CAPACITOR__ && native) {
    try {
      // The two plugins load as separate chunks, so an older request's import
      // can settle after a newer one's; once superseded, it must not reach the
      // Activity. Plugin calls themselves dispatch in call order.
      if (target === 'unlocked' && getPlatform() === 'android') {
        const { SensorOrientation } = await import('$lib/plugins/sensorOrientation');
        if (request === lastRequested) await SensorOrientation.followSensor();
      } else {
        const { ScreenOrientation } = await import('@capacitor/screen-orientation');
        if (request !== lastRequested) return;
        if (target === 'unlocked') await ScreenOrientation.unlock();
        else await ScreenOrientation.lock({ orientation: target });
      }
    } catch {
      // Plugin unavailable or the platform refused the lock — the setting stays
      // persisted for the next launch. Clearing the latch lets a later call with
      // the same target retry within this session.
      releaseLatch(request);
    }
    return;
  }

  // Web fallback. Browsers may require fullscreen/user activation, and some
  // WebViews do not expose locking at all; failures are swallowed since the
  // setting remains persisted, and the fullscreen-keyed latch retries it.
  const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
  if (target === 'unlocked') {
    orientation?.unlock?.();
    return;
  }
  orientation?.lock?.(target).catch(() => releaseLatch(request));
}
