import { useEffect, useState } from 'react';
import type { OrientationChoice } from '../settings/orientation';

// The Screen Orientation members TypeScript's DOM lib omits; either may be
// missing at runtime, as in every WebKit browser.
type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: Exclude<OrientationChoice, 'auto'>) => Promise<void>;
  unlock?: () => void;
};

// The same two predicates the shipping orientationLockApplies() reads: a
// hand-held screen that can turn, and Chromium's exact fullscreen condition for
// honoring a lock (docs/ORIENTATION.md, "Detection").
const COARSE_POINTER_QUERY = '(pointer: coarse)';
const FULLSCREEN_DISPLAY_MODE_QUERY = '(display-mode: fullscreen)';

export function autoOverridesSystemLock(): boolean {
  return false;
}

function screenOrientation(): LockableScreenOrientation | undefined {
  return window.screen.orientation as LockableScreenOrientation | undefined;
}

function lockApplies(): boolean {
  return (
    typeof screenOrientation()?.lock === 'function' &&
    window.matchMedia?.(COARSE_POINTER_QUERY).matches === true &&
    (document.fullscreenElement != null ||
      window.matchMedia?.(FULLSCREEN_DISPLAY_MODE_QUERY).matches === true)
  );
}

export function useOrientationLockApplies(): boolean {
  const [applies, setApplies] = useState(lockApplies);
  useEffect(() => {
    const changed = () => setApplies(lockApplies());
    changed();
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  return applies;
}

// Chromium releases a lock when fullscreen ends, so the choice is requested
// afresh each time the lock starts to apply, not only when it changes.
export function useDeviceOrientation(choice: OrientationChoice): void {
  const applies = useOrientationLockApplies();
  useEffect(() => {
    if (!applies) return;
    const orientation = screenOrientation();
    if (choice === 'auto') orientation?.unlock?.();
    else orientation?.lock?.(choice).catch(() => undefined);
  }, [applies, choice]);
}
