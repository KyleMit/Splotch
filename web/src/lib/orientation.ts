import { browser } from '$app/environment';
import { isNative, supportsOrientationLock } from '$lib/platform';
import { settings } from '$lib/state/settings.svelte';

type OrientationLockType = 'portrait' | 'landscape';

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: OrientationLockType) => Promise<void>;
  unlock?: () => void;
};

let lastRequested: OrientationLockType | 'unlocked' | null = null;

export async function applyDeviceOrientationPreference() {
  if (!browser) return;

  // Windowed platforms (iPadOS 26+) own orientation themselves; locking there
  // only floats a letterboxed window, so leave it to the OS window controls.
  if (!supportsOrientationLock()) return;

  const target: OrientationLockType | 'unlocked' = settings.lockRotationEnabled
    ? settings.forceLandscapeOrientation
      ? 'landscape'
      : 'portrait'
    : 'unlocked';

  if (target === lastRequested) return;
  lastRequested = target;

  // Native: lock at the Activity level via @capacitor/screen-orientation. Unlike
  // the Web Screen Orientation API, this overrides the OS Auto-Rotate setting, so
  // the parent's choice is honored even when the device has rotation turned off.
  // The literal __IS_CAPACITOR__ lets Rollup drop the plugin import from the web
  // bundle; isNative() alone is a runtime check it can't tree-shake.
  if (__IS_CAPACITOR__ && isNative()) {
    try {
      const { ScreenOrientation } = await import('@capacitor/screen-orientation');
      if (target === 'unlocked') await ScreenOrientation.unlock();
      else await ScreenOrientation.lock({ orientation: target });
    } catch {
      // Plugin unavailable or the platform refused the lock — the setting stays
      // persisted for the next launch.
    }
    return;
  }

  // Web fallback. Browsers may require fullscreen/user activation, and some
  // WebViews do not expose locking at all; failures are swallowed since the
  // setting remains persisted for platforms that can honor it.
  const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
  if (target === 'unlocked') {
    orientation?.unlock?.();
    return;
  }
  orientation?.lock?.(target).catch(() => {});
}
