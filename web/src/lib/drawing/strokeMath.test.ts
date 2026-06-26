import { describe, it, expect } from 'vitest';
import {
  guardedEdgeAt,
  edgeSwipeIsOsGesture,
  edgeSwipeDirectionDecided,
  pointerWasResumed,
  calculateStrokeSpeed,
  type SpeedSample,
} from './strokeMath';

describe('guardedEdgeAt', () => {
  // Portrait: only the bottom is guarded.
  const portrait = { width: 400, height: 800, renderScale: 1, bottomInset: 0 };

  it('guards the bottom band in portrait', () => {
    expect(guardedEdgeAt(200, 790, portrait)).toBe('bottom');
    expect(guardedEdgeAt(200, 776, portrait)).toBe('bottom'); // exactly at the band edge
    expect(guardedEdgeAt(200, 700, portrait)).toBeNull();
  });

  it('does not guard the side edges in portrait', () => {
    expect(guardedEdgeAt(2, 400, portrait)).toBeNull();
    expect(guardedEdgeAt(398, 400, portrait)).toBeNull();
  });

  // Landscape: both short side edges are always guarded; the long bottom only
  // when the OS reports a home-indicator inset there (tablets).
  it('guards both side edges in landscape', () => {
    const land = { width: 800, height: 400, renderScale: 1, bottomInset: 0 };
    expect(guardedEdgeAt(5, 200, land)).toBe('left');
    expect(guardedEdgeAt(795, 200, land)).toBe('right');
    expect(guardedEdgeAt(400, 200, land)).toBeNull();
  });

  it('guards the landscape long bottom only above the inset threshold', () => {
    const tablet = { width: 800, height: 400, renderScale: 1, bottomInset: 20 };
    const phone = { width: 800, height: 400, renderScale: 1, bottomInset: 10 };
    expect(guardedEdgeAt(400, 395, tablet)).toBe('bottom');
    expect(guardedEdgeAt(400, 395, phone)).toBeNull();
  });

  it('scales the band with renderScale', () => {
    const r1 = { width: 400, height: 800, renderScale: 1, bottomInset: 0 };
    const r2 = { width: 400, height: 800, renderScale: 2, bottomInset: 0 };
    // y=760 is inside a 48px band (scale 2) but outside a 24px band (scale 1).
    expect(guardedEdgeAt(200, 760, r2)).toBe('bottom');
    expect(guardedEdgeAt(200, 760, r1)).toBeNull();
  });
});

describe('edgeSwipeIsOsGesture', () => {
  it('treats a mostly-perpendicular inward flick as the OS gesture', () => {
    expect(edgeSwipeIsOsGesture('bottom', 0, -30)).toBe(true); // straight up off the bottom
    expect(edgeSwipeIsOsGesture('left', 30, 0)).toBe(true); // rightward off the left edge
    expect(edgeSwipeIsOsGesture('right', -30, 0)).toBe(true); // leftward off the right edge
  });

  it('includes the ~45° boundary (inward >= cross)', () => {
    expect(edgeSwipeIsOsGesture('bottom', 20, -20)).toBe(true); // exactly 45°
    expect(edgeSwipeIsOsGesture('bottom', 21, -20)).toBe(false); // just past 45° → real stroke
  });

  it('treats sideways or outward travel as a real stroke', () => {
    expect(edgeSwipeIsOsGesture('bottom', 40, -10)).toBe(false); // mostly along the edge
    expect(edgeSwipeIsOsGesture('bottom', 0, 30)).toBe(false); // downward (outward)
    expect(edgeSwipeIsOsGesture('left', -30, 0)).toBe(false); // outward off the left edge
  });
});

describe('edgeSwipeDirectionDecided', () => {
  it('is undecided until travel reaches the threshold, then decided at/after it', () => {
    // Default threshold is 12px at renderScale 1.
    expect(edgeSwipeDirectionDecided(11, 1)).toBe(false);
    expect(edgeSwipeDirectionDecided(12, 1)).toBe(true);
    expect(edgeSwipeDirectionDecided(50, 1)).toBe(true);
  });

  it('scales the threshold with renderScale', () => {
    // At scale 2 the threshold is 24px, so 12px no longer decides.
    expect(edgeSwipeDirectionDecided(12, 2)).toBe(false);
    expect(edgeSwipeDirectionDecided(24, 2)).toBe(true);
  });
});

describe('pointerWasResumed', () => {
  const minSide = 1000; // jump threshold = 0.1 * 1000 = 100px

  it('requires both a long idle gap and a large jump', () => {
    expect(pointerWasResumed(200, 150, minSide)).toBe(true);
  });

  it('is false when the idle gap is too short, even with a big jump', () => {
    expect(pointerWasResumed(50, 150, minSide)).toBe(false);
  });

  it('is false when the jump is too small, even after a long gap', () => {
    expect(pointerWasResumed(200, 50, minSide)).toBe(false);
  });

  it('treats the thresholds as strict (must exceed, not equal)', () => {
    expect(pointerWasResumed(100, 150, minSide)).toBe(false); // gap == 100ms
    expect(pointerWasResumed(200, 100, minSide)).toBe(false); // jump == 100px
  });

  it('scales the jump threshold with the canvas size', () => {
    // Smaller canvas (minSide 500 → threshold 50px) decides on a jump that a
    // larger canvas would treat as continuous contact.
    expect(pointerWasResumed(200, 60, 500)).toBe(true);
    expect(pointerWasResumed(200, 60, 1000)).toBe(false);
  });
});

describe('calculateStrokeSpeed', () => {
  it('divides distance covered by the elapsed span', () => {
    const samples: SpeedSample[] = [{ t: 0, distance: 0 }];
    expect(calculateStrokeSpeed(samples, { t: 100, distance: 50 }, 1000)).toBeCloseTo(0.5);
  });

  it('drops samples older than the window and excludes the anchor distance', () => {
    const samples: SpeedSample[] = [
      { t: 0, distance: 0 },
      { t: 50, distance: 10 },
    ];
    // window 100 at t=120 drops t=0; the surviving oldest sample (t=50) is the
    // span anchor, so its own distance is excluded — only the t=120 chord counts.
    const speed = calculateStrokeSpeed(samples, { t: 120, distance: 14 }, 100);
    expect(speed).toBeCloseTo(14 / 70);
    expect(samples).toEqual([
      { t: 50, distance: 10 },
      { t: 120, distance: 14 },
    ]);
  });

  it('floors the span at 1ms so simultaneous samples never divide by zero', () => {
    const samples: SpeedSample[] = [{ t: 100, distance: 0 }];
    expect(calculateStrokeSpeed(samples, { t: 100, distance: 5 }, 50)).toBe(5);
  });
});
