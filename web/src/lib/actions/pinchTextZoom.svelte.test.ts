import { describe, expect, it } from 'vitest';
import { clampTextZoom, MAX_TEXT_ZOOM, MIN_TEXT_ZOOM, nextTextZoom } from './pinchTextZoom.svelte';

describe('clampTextZoom', () => {
  it('keeps values within [MIN, MAX]', () => {
    expect(clampTextZoom(0.5)).toBe(MIN_TEXT_ZOOM);
    expect(clampTextZoom(2)).toBe(2);
    expect(clampTextZoom(99)).toBe(MAX_TEXT_ZOOM);
  });

  it('falls back to MIN for non-finite input (matches clampScale)', () => {
    expect(clampTextZoom(NaN)).toBe(MIN_TEXT_ZOOM);
    expect(clampTextZoom(Infinity)).toBe(MIN_TEXT_ZOOM);
    expect(clampTextZoom(-Infinity)).toBe(MIN_TEXT_ZOOM);
  });
});

describe('nextTextZoom', () => {
  it('scales proportionally to how far the fingers spread', () => {
    // Fingers twice as far apart as when the pinch began → twice the zoom.
    expect(nextTextZoom(1, 100, 200)).toBe(2);
    // Half the spread → half (clamped to MIN since 0.5 < 1).
    expect(nextTextZoom(2, 200, 100)).toBe(1);
  });

  it('compounds from the base zoom captured at the pinch start', () => {
    // Already at 1.5×, fingers spread 1.5× further → 2.25×.
    expect(nextTextZoom(1.5, 100, 150)).toBeCloseTo(2.25);
  });

  it('never exceeds MAX or drops below MIN', () => {
    expect(nextTextZoom(2, 100, 1000)).toBe(MAX_TEXT_ZOOM);
    expect(nextTextZoom(1, 100, 1)).toBe(MIN_TEXT_ZOOM);
  });

  it('holds the current zoom when the base spread is degenerate', () => {
    // A zero base spread (e.g. fingers coincident) must not divide-by-zero.
    expect(nextTextZoom(1.5, 0, 300)).toBe(1.5);
  });
});
