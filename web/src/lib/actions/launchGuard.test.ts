// On the happy-dom default because settings.svelte.ts, imported below for the
// Button Size ceiling, reads localStorage as it loads (.claude/rules/testing.md).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_BUTTON_BASE_PX } from '$lib/actionButtonLayout';
import { ACTION_BUTTON_SCALE_MAX } from '$lib/state/settings.svelte';
import {
  LAUNCH_ZONE_DURATION_MS,
  LAUNCH_ZONE_RADIUS_PX,
  guardLaunchZone,
  guardTapZone,
  isPointInLaunchZone,
  clearLaunchZones,
} from './launchGuard';

// The path stays a parameter because Vite rewrites a literal
// `new URL('./literal', import.meta.url)` into the served asset's http URL,
// which readFileSync rejects (precedent: inkMotion.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('launch zone tuning', () => {
  it('outlasts every modal fly-in app.css plays', () => {
    const flyInDurationsMs = [
      ...sourceFile('../../app.css').matchAll(/animation:\s*dialogFlyFromOrigin\s+(\d+)ms\b/g),
    ].map(([, durationMs]) => Number(durationMs));

    expect(flyInDurationsMs).not.toHaveLength(0);
    expect(LAUNCH_ZONE_DURATION_MS).toBeGreaterThan(Math.max(...flyInDurationsMs));
  });

  it('reaches every corner of the largest action button from its center', () => {
    const largestBasePx = Math.max(
      ...Object.values(ACTION_BUTTON_BASE_PX).flatMap((steps) => Object.values(steps))
    );
    const largestButtonPx = (largestBasePx * ACTION_BUTTON_SCALE_MAX) / 100;

    expect(LAUNCH_ZONE_RADIUS_PX).toBeGreaterThan(
      Math.hypot(largestButtonPx / 2, largestButtonPx / 2)
    );
  });
});

describe('launchGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearLaunchZones();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects taps within the radius of the launching button', () => {
    guardLaunchZone({ x: 100, y: 100 });
    expect(isPointInLaunchZone(100, 100)).toBe(true);
    expect(isPointInLaunchZone(100 + LAUNCH_ZONE_RADIUS_PX - 1, 100)).toBe(true);
  });

  it('lets taps outside the radius through', () => {
    guardLaunchZone({ x: 100, y: 100 });
    expect(isPointInLaunchZone(100 + LAUNCH_ZONE_RADIUS_PX + 1, 100)).toBe(false);
  });

  it('stops rejecting once the window lapses', () => {
    guardLaunchZone({ x: 100, y: 100 });
    expect(isPointInLaunchZone(100, 100)).toBe(true);
    vi.advanceTimersByTime(LAUNCH_ZONE_DURATION_MS + 1);
    expect(isPointInLaunchZone(100, 100)).toBe(false);
  });

  it('arms nothing for a null origin (unanchored open)', () => {
    guardLaunchZone(null);
    expect(isPointInLaunchZone(0, 0)).toBe(false);
  });

  it('guards each of several concurrent zones independently', () => {
    guardLaunchZone({ x: 0, y: 0 });
    guardLaunchZone({ x: 500, y: 500 });
    expect(isPointInLaunchZone(10, 0)).toBe(true);
    expect(isPointInLaunchZone(510, 500)).toBe(true);
    expect(isPointInLaunchZone(250, 250)).toBe(false);
  });

  it('clearLaunchZones drops every armed zone', () => {
    guardLaunchZone({ x: 100, y: 100 });
    clearLaunchZones();
    expect(isPointInLaunchZone(100, 100)).toBe(false);
  });

  it('guardTapZone rejects repeat taps at the point, then lapses', () => {
    guardTapZone(100, 100);
    expect(isPointInLaunchZone(100, 100)).toBe(true);
    expect(isPointInLaunchZone(100 + LAUNCH_ZONE_RADIUS_PX + 1, 100)).toBe(false);
    vi.advanceTimersByTime(LAUNCH_ZONE_DURATION_MS + 1);
    expect(isPointInLaunchZone(100, 100)).toBe(false);
  });
});
