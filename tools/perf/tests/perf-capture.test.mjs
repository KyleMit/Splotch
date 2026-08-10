import { describe, expect, it } from 'vitest';
import { createMeasureTimeline, markPhase } from '../capture.mjs';

// The Performance API is per document: a navigation clears its entries and
// restarts performance.now() at 0. A driver that reloads between scenarios and
// has no browser-level CDP trace (WebKit) therefore collects once per scenario,
// and every collection arrives claiming to start at zero.
describe('createMeasureTimeline', () => {
  it('shifts each collection past the end of the one before it', () => {
    const timeline = createMeasureTimeline();
    timeline.append([{ name: 'a', ts: 0, dur: 100 }]);
    timeline.append([{ name: 'b', ts: 0, dur: 50 }]);

    // Without the shift both events sit at ts 0 and the analyzer reads two
    // scenarios as one overlapping instant.
    expect(timeline.events).toEqual([
      { name: 'a', ts: 0, dur: 100 },
      { name: 'b', ts: 100, dur: 50 },
    ]);
  });

  it('advances the base past the latest end, not the last event appended', () => {
    // Entries come back in start order, so the longest-running one can finish
    // after an event that starts later. Basing the next offset on the final
    // event's end would overlap the collections.
    const timeline = createMeasureTimeline();
    timeline.append([
      { name: 'long', ts: 0, dur: 900 },
      { name: 'short', ts: 10, dur: 5 },
    ]);
    timeline.append([{ name: 'next', ts: 0, dur: 1 }]);

    expect(timeline.events.at(-1)).toEqual({ name: 'next', ts: 900, dur: 1 });
  });

  it('leaves the source events untouched', () => {
    const collected = [{ name: 'a', ts: 0, dur: 10 }];
    const timeline = createMeasureTimeline();
    timeline.append([{ name: 'first', ts: 0, dur: 40 }]);
    timeline.append(collected);

    expect(collected[0].ts).toBe(0);
    expect(timeline.events.at(-1).ts).toBe(40);
  });

  it('treats a collection with no measures as taking no time', () => {
    const timeline = createMeasureTimeline();
    timeline.append([{ name: 'a', ts: 0, dur: 20 }]);
    timeline.append([]);
    timeline.append([{ name: 'b', ts: 0, dur: 1 }]);

    expect(timeline.events.at(-1).ts).toBe(20);
  });

  it('gives each timeline its own clock', () => {
    const one = createMeasureTimeline();
    const two = createMeasureTimeline();
    one.append([{ name: 'a', ts: 0, dur: 500 }]);
    two.append([{ name: 'b', ts: 0, dur: 1 }]);

    expect(two.events[0].ts).toBe(0);
  });
});

describe('markPhase', () => {
  it('returns the work result captured before the trailing browser round trip', async () => {
    const calls = [];
    const page = {
      evaluate: async (fn) => {
        calls.push(fn.toString().includes('performance.measure') ? 'measure' : 'mark');
      },
    };

    const result = await markPhase(page, 'draw', async () => {
      calls.push('work');
      return 42;
    });

    expect(result).toBe(42);
    expect(calls).toEqual(['mark', 'work', 'measure']);
  });
});
