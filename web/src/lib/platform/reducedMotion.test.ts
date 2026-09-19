import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyReducedMotion,
  isReduceMotionPreference,
  prefersReducedMotion,
  REDUCE_MOTION_ATTRIBUTE,
  resolveReducedMotion,
  watchReducedMotion,
} from './reducedMotion';

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute(REDUCE_MOTION_ATTRIBUTE);
});

describe('resolveReducedMotion', () => {
  it('follows the OS in system mode', () => {
    expect(resolveReducedMotion('system', true)).toBe(true);
    expect(resolveReducedMotion('system', false)).toBe(false);
  });

  it('lets an explicit preference override the OS in both directions', () => {
    expect(resolveReducedMotion('reduce', false)).toBe(true);
    expect(resolveReducedMotion('full', true)).toBe(false);
  });
});

describe('isReduceMotionPreference', () => {
  it('accepts exactly the three stored values', () => {
    expect(['reduce', 'full', 'system'].every(isReduceMotionPreference)).toBe(true);
    expect(isReduceMotionPreference('true')).toBe(false);
    expect(isReduceMotionPreference(null)).toBe(false);
  });
});

describe('prefersReducedMotion', () => {
  it('reports the effective answer stamped on the root element', () => {
    expect(prefersReducedMotion()).toBe(false);
    applyReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    applyReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  // Components that call this are imported by prerendered routes, which render
  // them on the server where there is no document.
  it('reports no preference where there is no document', () => {
    vi.stubGlobal('document', undefined);
    expect(prefersReducedMotion()).toBe(false);
    expect(() => applyReducedMotion(true)).not.toThrow();
  });
});

describe('watchReducedMotion', () => {
  it('reports each flip of the effective answer until stopped', async () => {
    const seen: boolean[] = [];
    const stop = watchReducedMotion((reduced) => seen.push(reduced));

    applyReducedMotion(true);
    await Promise.resolve();
    applyReducedMotion(false);
    await Promise.resolve();
    expect(seen).toEqual([true, false]);

    stop();
    applyReducedMotion(true);
    await Promise.resolve();
    expect(seen).toEqual([true, false]);
  });
});
