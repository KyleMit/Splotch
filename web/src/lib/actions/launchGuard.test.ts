// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guardLaunchZone, isPointInLaunchZone, clearLaunchZones } from './launchGuard';

describe('launchGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearLaunchZones();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects taps within the radius of the launching button', () => {
    guardLaunchZone({ x: 100, y: 100 }, { radius: 50 });
    expect(isPointInLaunchZone(100, 100)).toBe(true);
    expect(isPointInLaunchZone(140, 100)).toBe(true);
  });

  it('lets taps outside the radius through', () => {
    guardLaunchZone({ x: 100, y: 100 }, { radius: 50 });
    expect(isPointInLaunchZone(200, 100)).toBe(false);
  });

  it('stops rejecting once the window lapses', () => {
    guardLaunchZone({ x: 100, y: 100 }, { radius: 50, durationMs: 600 });
    expect(isPointInLaunchZone(100, 100)).toBe(true);
    vi.advanceTimersByTime(601);
    expect(isPointInLaunchZone(100, 100)).toBe(false);
  });

  it('arms nothing for a null origin (unanchored open)', () => {
    guardLaunchZone(null);
    expect(isPointInLaunchZone(0, 0)).toBe(false);
  });

  it('guards each of several concurrent zones independently', () => {
    guardLaunchZone({ x: 0, y: 0 }, { radius: 30 });
    guardLaunchZone({ x: 500, y: 500 }, { radius: 30 });
    expect(isPointInLaunchZone(10, 0)).toBe(true);
    expect(isPointInLaunchZone(510, 500)).toBe(true);
    expect(isPointInLaunchZone(250, 250)).toBe(false);
  });

  it('clearLaunchZones drops every armed zone', () => {
    guardLaunchZone({ x: 100, y: 100 }, { radius: 50 });
    clearLaunchZones();
    expect(isPointInLaunchZone(100, 100)).toBe(false);
  });
});
