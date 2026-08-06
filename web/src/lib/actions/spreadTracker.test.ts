import { describe, expect, it } from 'vitest';
import { createSpreadTracker } from './spreadTracker';

describe('createSpreadTracker', () => {
  it('counts the fingers that are down and snapshots their positions', () => {
    const tracker = createSpreadTracker();
    expect(tracker.pointerCount).toBe(0);
    expect(tracker.points()).toEqual([]);

    tracker.down(1, { x: 10, y: 20 });
    tracker.down(2, { x: 30, y: 40 });

    expect(tracker.pointerCount).toBe(2);
    expect(tracker.points()).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });

  it('reports 0 spread until a second finger lands', () => {
    const tracker = createSpreadTracker();
    expect(tracker.spread()).toBe(0);

    tracker.down(1, { x: 0, y: 0 });
    expect(tracker.spread()).toBe(0);

    tracker.down(2, { x: 3, y: 4 });
    expect(tracker.spread()).toBe(5);
  });

  it('measures the spread between the first two fingers only', () => {
    const tracker = createSpreadTracker();
    tracker.down(1, { x: 0, y: 0 });
    tracker.down(2, { x: 6, y: 8 });
    tracker.down(3, { x: 900, y: 900 });

    expect(tracker.spread()).toBe(10);
  });

  it('ignores a move for a finger it never saw go down', () => {
    const tracker = createSpreadTracker();
    tracker.down(1, { x: 0, y: 0 });

    expect(tracker.move(9, { x: 5, y: 5 })).toBe(false);
    expect(tracker.pointerCount).toBe(1);

    expect(tracker.move(1, { x: 0, y: 12 })).toBe(true);
    expect(tracker.points()).toEqual([{ x: 0, y: 12 }]);
  });

  it('reports whether a lift removed a tracked finger', () => {
    const tracker = createSpreadTracker();
    tracker.down(1, { x: 0, y: 0 });

    expect(tracker.up(9)).toBe(false);
    expect(tracker.up(1)).toBe(true);
    expect(tracker.pointerCount).toBe(0);
  });

  it('drops every finger on clear', () => {
    const tracker = createSpreadTracker();
    tracker.down(1, { x: 0, y: 0 });
    tracker.down(2, { x: 3, y: 4 });
    tracker.clear();

    expect(tracker.pointerCount).toBe(0);
    expect(tracker.spread()).toBe(0);
  });
});
