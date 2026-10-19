import { describe, expect, it } from 'vitest';
import {
  createHandoffCadence,
  HANDOFF_SPACING_MS,
} from '../../experiments/native-architecture/src/drawing/handoffCadence.ts';

const FRAME_MS = 1000 / 120;
// Device costs on the JavaScript thread: taking one packet's samples, and one flush + scene record
// + hand-off (PR 2998's Galaxy and iPad probe runs: liveFlush and sceneRecord p50 well under 1 ms
// each, so 2 ms is generous).
const SAMPLE_MS = 0.1;
const PAINT_MS = 2;
const STALL_MS = 140;
// A packet handed over as it arrived waited at most for one hand-off already running.
const onArrival = (wait) => wait <= SAMPLE_MS + 2 * PAINT_MS + 1e-6;

function fakeClock() {
  const clock = { at: 0, frames: new Map(), next: 0 };
  return {
    clock,
    now: () => clock.at,
    requestFrame: (callback) => {
      const id = ++clock.next;
      clock.frames.set(id, callback);
      return id;
    },
    cancelFrame: (id) => clock.frames.delete(id),
    runFrames() {
      const callbacks = [...clock.frames.values()];
      clock.frames.clear();
      for (const callback of callbacks) callback();
    },
  };
}

// One JavaScript thread over a timeline: packets arrive at their times and run in order, a frame
// callback runs `frameLagMs` after the first display frame after it was requested, and work moves
// the clock.
// `cadence` is the policy under test; it reports each packet's wait from arrival to the end of
// the hand-off that carried it.
function simulate(arrivals, policy, { stallAt = null, frameLagMs = 0 } = {}) {
  const clock = { at: 0 };
  const frames = [];
  let taken = [];
  const waits = [];
  let handoffs = 0;
  const paint = () => {
    if (taken.length === 0) return false;
    clock.at += PAINT_MS;
    handoffs += 1;
    for (const arrival of taken) waits.push(clock.at - arrival);
    taken = [];
    return true;
  };
  const cadence = policy(
    {
      now: () => clock.at,
      requestFrame: (callback) =>
        frames.push({
          due: (Math.floor(clock.at / FRAME_MS) + 1) * FRAME_MS + frameLagMs,
          callback,
        }),
      cancelFrame: () => {},
    },
    paint
  );
  const runFramesUntil = (time) => {
    for (;;) {
      frames.sort((a, b) => a.due - b.due);
      if (frames.length === 0 || frames[0].due > time) return;
      const { due, callback } = frames.shift();
      clock.at = Math.max(clock.at, due);
      callback();
    }
  };
  for (const arrival of arrivals) {
    runFramesUntil(Math.max(arrival, clock.at));
    if (stallAt !== null && arrival >= stallAt && clock.at < stallAt + STALL_MS)
      clock.at = Math.max(clock.at, stallAt + STALL_MS);
    clock.at = Math.max(clock.at, arrival) + SAMPLE_MS;
    taken.push(arrival);
    cadence.sample();
  }
  runFramesUntil(Infinity);
  const sorted = [...waits].sort((a, b) => a - b);
  return {
    handoffs,
    p50: sorted[Math.floor(sorted.length / 2)],
    max: sorted.at(-1),
    waits,
  };
}

// The policy PR 2998 shipped: the first packet of a display frame paints at once, the rest of that
// frame at the next frame callback, which then holds the frame again.
function firstPerFrame(clock, paint) {
  let painted = false;
  let pending = false;
  let frame = null;
  const paintNow = () => {
    pending = false;
    if (!paint()) return;
    painted = true;
    frame ??= clock.requestFrame(() => {
      frame = null;
      painted = false;
      if (pending) paintNow();
    });
  };
  return { sample: () => (painted ? (pending = true) : paintNow()) };
}

function everyPacket(_clock, paint) {
  return { sample: () => void paint() };
}

// A seeded generator, so the jitter is the same on every run.
function random(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

// 120 Hz packets, each up to ±2 ms off its slot, so consecutive ones are 4.3 to 12.3 ms apart.
function steady(count, jitterMs = 2) {
  const next = random(7);
  return Array.from(
    { length: count },
    (_, index) => index * FRAME_MS + (next() * 2 - 1) * jitterMs + 10
  );
}

describe('createHandoffCadence', () => {
  it('paints each packet as it arrives once the spacing has passed', () => {
    const fake = fakeClock();
    const painted = [];
    const cadence = createHandoffCadence(fake, () => {
      painted.push(fake.clock.at);
      return true;
    });
    cadence.sample();
    fake.clock.at = FRAME_MS;
    cadence.sample();
    fake.clock.at = 2 * FRAME_MS;
    cadence.sample();
    expect(painted).toEqual([0, FRAME_MS, 2 * FRAME_MS]);
    expect(fake.clock.frames.size).toBe(0);
  });

  // Negative control: dropping the spacing check paints all three packets.
  it('holds a packet that arrives within the spacing for the next packet past it or the frame', () => {
    const fake = fakeClock();
    let paints = 0;
    const cadence = createHandoffCadence(fake, () => {
      paints += 1;
      return true;
    });
    cadence.sample();
    fake.clock.at = HANDOFF_SPACING_MS - 0.5;
    cadence.sample();
    expect(paints).toBe(1);
    expect(fake.clock.frames.size).toBe(1);
    fake.clock.at = HANDOFF_SPACING_MS;
    cadence.sample();
    expect(paints).toBe(2);
    // The frame callback finds nothing left to paint.
    fake.runFrames();
    expect(paints).toBe(2);
    fake.clock.at += 1;
    cadence.sample();
    expect(paints).toBe(2);
    fake.runFrames();
    expect(paints).toBe(3);
  });

  // Negative control: settling through the spacing check leaves the lift's samples to a frame.
  it('paints a settle at once whatever the spacing', () => {
    const fake = fakeClock();
    let paints = 0;
    const cadence = createHandoffCadence(fake, () => {
      paints += 1;
      return true;
    });
    cadence.sample();
    cadence.sample();
    cadence.settle();
    expect(paints).toBe(2);
    cadence.dispose();
    expect(fake.clock.frames.size).toBe(0);
  });

  // Negative control: starting the spacing at a paint that handed nothing over holds the next
  // packet, the one that does change ink.
  it('spends no spacing on a packet that changed no ink', () => {
    const fake = fakeClock();
    const results = [false, true];
    let paints = 0;
    const cadence = createHandoffCadence(fake, () => {
      paints += 1;
      return results.shift();
    });
    cadence.sample();
    fake.clock.at = 1;
    cadence.sample();
    expect(paints).toBe(2);
  });

  it('cancels a requested frame when disposed', () => {
    const fake = fakeClock();
    const cadence = createHandoffCadence(fake, () => true);
    cadence.sample();
    cadence.sample();
    expect(fake.clock.frames.size).toBe(1);
    cadence.dispose();
    expect(fake.clock.frames.size).toBe(0);
  });
});

// The numbers behind HANDOFF_SPACING_MS, on a simulated JavaScript thread (SAMPLE_MS per packet,
// PAINT_MS per hand-off, frame callbacks at 120 Hz vsync).
describe('the hand-off spacing', () => {
  const cadence = (clock, paint) => createHandoffCadence(clock, paint);

  // Negative control: a spacing of 9 ms holds the closer-together pairs for the frame callback.
  it('hands every packet of jittered 120 Hz input over as it arrives', () => {
    const result = simulate(steady(240), cadence);
    expect(result.handoffs).toBe(240);
    expect(result.max).toBeCloseTo(SAMPLE_MS + PAINT_MS, 6);
  });

  // Android runs a display frame's input before its frame callbacks, so a packet reaches
  // JavaScript before the frame callback that would free PR 2998's frame slot. Negative control:
  // that policy holds every packet here until the callback, 2.5 ms later.
  it('hands a packet over before the frame callback of the frame it arrived in', () => {
    const arrivals = steady(240, 0).map((at) => at - 10 + 0.5);
    const options = { frameLagMs: 3 };
    const result = simulate(arrivals, cadence, options);
    const shipped = simulate(arrivals, firstPerFrame, options);
    expect(result.waits.every(onArrival)).toBe(true);
    expect(shipped.p50).toBeGreaterThanOrEqual(result.p50 + 2.4);
  });

  // A stall queues its packets; the thread then takes them back to back. Negative control: a
  // spacing of 0 paints and hands over every queued packet, as unbounded per-packet hand-off does.
  it('paints a backlog of queued packets once or twice instead of once per packet', () => {
    const arrivals = steady(240, 0);
    const stallAt = arrivals[100];
    const queued = arrivals.filter((at) => at >= stallAt && at < stallAt + STALL_MS).length;
    const last = 100 + queued - 1;
    const result = simulate(arrivals, cadence, { stallAt });
    const unbounded = simulate(arrivals, everyPacket, { stallAt });
    expect(queued).toBe(17);
    expect(unbounded.handoffs).toBe(240);
    expect(unbounded.handoffs - result.handoffs).toBeGreaterThanOrEqual(queued - 2);
    // The newest queued packet is shown sooner than when each one before it is painted in turn.
    expect(unbounded.waits[last] - result.waits[last]).toBeGreaterThan(20);
    // And the packets after the backlog hand over as they arrive again.
    expect(result.waits.slice(last + 2).every(onArrival)).toBe(true);
  });

  // The bursty trace's late packet lands just before the on-time one: that one packet waits for
  // the next frame callback, never more than a frame and a paint, and the packets after it are
  // handed over as they arrive. Negative control: starting the spacing at the frame callback's
  // paint holds every later packet for the frame callback.
  it('holds only the on-time packet after a late one, and for at most a frame', () => {
    const arrivals = steady(240, 0).map((at, index) => (index % 60 === 30 ? at + 6 : at));
    const result = simulate(arrivals, cadence);
    const held = result.waits.flatMap((wait, index) => (onArrival(wait) ? [] : [index]));
    expect(held).toEqual([31, 91, 151, 211]);
    for (const index of held) expect(result.waits[index]).toBeLessThanOrEqual(FRAME_MS + PAINT_MS);
  });
});
