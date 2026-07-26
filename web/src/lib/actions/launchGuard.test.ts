// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DURATION_MS,
  DEFAULT_RADIUS,
  guardLaunchZone,
  isPointInLaunchZone,
  clearLaunchZones,
} from './launchGuard';

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
    expect(isPointInLaunchZone(100 + DEFAULT_RADIUS - 1, 100)).toBe(true);
  });

  it('lets taps outside the radius through', () => {
    guardLaunchZone({ x: 100, y: 100 });
    expect(isPointInLaunchZone(100 + DEFAULT_RADIUS + 1, 100)).toBe(false);
  });

  it('stops rejecting once the window lapses', () => {
    guardLaunchZone({ x: 100, y: 100 });
    expect(isPointInLaunchZone(100, 100)).toBe(true);
    vi.advanceTimersByTime(DEFAULT_DURATION_MS + 1);
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
});
