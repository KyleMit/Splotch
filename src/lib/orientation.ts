import { browser } from '$app/environment';
import { settings } from '$lib/state/settings.svelte';

type OrientationLockType = 'portrait' | 'landscape';

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: OrientationLockType) => Promise<void>;
  unlock?: () => void;
};

let lastRequested: OrientationLockType | 'unlocked' | null = null;

export function applyDeviceOrientationPreference() {
  if (!browser) return;

  const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
  const target = settings.lockRotationEnabled
    ? settings.forceLandscapeOrientation ? 'landscape' : 'portrait'
    : 'unlocked';

  if (target === lastRequested) return;
  lastRequested = target;

  if (target === 'unlocked') {
    orientation?.unlock?.();
    return;
  }

  orientation?.lock?.(target).catch(() => {
    // Browsers may require fullscreen/user activation, and some WebViews do not
    // expose locking at all. The setting remains persisted for platforms that
    // can honor it.
  });
}
