import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRecordedContactCohort7 } from '../../experiments/native-architecture/src/drawing/recordedContactCohort7.ts';
import { createContactSound } from '../../experiments/native-architecture/src/audio/contactSound.ts';
import { createNativeRecordedInput7 } from '../../experiments/native-architecture/src/drawing/nativeRecordedInput7.ts';
vi.mock('react-native', () => ({ findNodeHandle: (owner) => owner }));
const PAPER = { kind: 'adopted', cssWidth: 512, cssHeight: 384, backingScale: 2 };
const FRAME = { width: 512, height: 384, pageX: 40, pageY: 80 };
const STYLE = { brush: 'crayon', color: 'Red', width: 8 };
const TARGET = {};
function touch(identifier, x, y, timestamp) {
  return { identifier, pageX: x + FRAME.pageX, pageY: y + FRAME.pageY, timestamp, target: TARGET };
}
function event(touches, changedTouches, starts) {
  const touchBank = {};
  for (const t of [...touches, ...changedTouches])
    touchBank[t.identifier] = {
      touchActive: touches.some((active) => active.identifier === t.identifier),
      startTimeStamp: starts[t.identifier],
    };
  return {
    currentTarget: TARGET,
    nativeEvent: { touches, changedTouches, target: TARGET },
    touchHistory: {
      touchBank,
      mostRecentTimeStamp: Math.max(0, ...[...touches, ...changedTouches].map((t) => t.timestamp)),
    },
  };
}
function fixture(initialFrame = FRAME, sound = null, style = () => STYLE) {
  const frames = new Map();
  let id = 0;
  let frame = initialFrame;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      frames.set(++id, callback);
      return id;
    })
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((handle) => frames.delete(handle))
  );
  const complete = vi.fn();
  const error = vi.fn();
  const preview = vi.fn();
  const abandon = vi.fn();
  const input = createNativeRecordedInput7({
    paper: PAPER,
    frame: () => frame,
    style,
    firstSeed: 1,
    sound,
    preview,
    complete,
    abandon,
    error,
  });
  return {
    input,
    frames,
    complete,
    error,
    preview,
    abandon,
    resize: () => {
      frame = { ...frame, width: 600 };
    },
    drain() {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(123);
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('private recorded contact integration boundary', () => {
  it('records only the changed contact once and drains only an actually delivered frame', () => {
    const f = fixture();
    const a = touch('a', 10, 20, 1);
    const b = touch('b', 30, 40, 2);
    const start = event([a], [a], { a: 1 });
    f.input.start(start);
    f.input.start(start);
    f.input.start(event([a, b], [b], { a: 1, b: 2 }));
    const moved = touch('a', 20, 25, 3);
    const delivery = event([moved, b], [moved], { a: 1, b: 2 });
    f.input.move(delivery);
    f.input.move(delivery);
    expect(f.frames.size).toBe(1);
    expect(f.complete).not.toHaveBeenCalled();
    f.drain();
    f.drain();
    f.input.end(event([b], [touch('a', 500, 300, 4)], { a: 1, b: 2 }));
    f.input.end(event([], [touch('b', 501, 301, 5)], { b: 2 }));
    expect(f.error).not.toHaveBeenCalled();
    expect(f.complete).toHaveBeenCalledTimes(1);
    const result = f.complete.mock.calls[0][0];
    expect(result.command.moves.map((m) => m.kind)).toEqual([
      'start',
      'start',
      'move',
      'drain',
      'end',
      'end',
    ]);
    expect(result.command.moves[2]).toEqual({
      kind: 'move',
      contact: 0,
      samples: [{ x: 40, y: 50 }],
    });
    expect(result.command.moves.filter((m) => m.kind === 'end').map((m) => m.samples)).toEqual([
      [],
      [],
    ]);
    expect(result.command.ops.some((op) => op.at?.x === 1000 || op.start?.x === 1000)).toBe(false);
    expect(Object.isFrozen(result.command.ops)).toBe(true);
  });
  it('retains actual queued moves when the last contact ends before its scheduled frame', () => {
    const f = fixture();
    f.input.start(event([touch('a', 10, 20, 1)], [touch('a', 10, 20, 1)], { a: 1 }));
    f.input.move(event([touch('a', 20, 20, 2)], [touch('a', 20, 20, 2)], { a: 1 }));
    f.input.end(event([], [touch('a', 500, 300, 3)], { a: 1 }));
    expect(f.frames.size).toBe(0);
    expect(f.complete).toHaveBeenCalledTimes(1);
    expect(f.complete.mock.calls[0][0].command.moves.map((m) => m.kind)).toEqual([
      'start',
      'move',
      'end',
    ]);
  });
  it('cancels on changed lifetime and never publishes or drains a late frame', () => {
    const f = fixture();
    f.input.start(event([touch('a', 10, 20, 1)], [touch('a', 10, 20, 1)], { a: 1 }));
    f.input.move(event([touch('a', 20, 20, 3)], [touch('a', 20, 20, 3)], { a: 2 }));
    f.drain();
    f.input.end(event([], [touch('a', 30, 20, 4)], { a: 2 }));
    expect(f.error).toHaveBeenCalledTimes(1);
    expect(f.complete).not.toHaveBeenCalled();
  });
  it('cancels on resized geometry without publishing an adopted-paper mismatch', () => {
    const f = fixture();
    f.input.start(event([touch('a', 10, 20, 1)], [touch('a', 10, 20, 1)], { a: 1 }));
    f.resize();
    f.input.move(event([touch('a', 20, 20, 2)], [touch('a', 20, 20, 2)], { a: 1 }));
    expect(f.error).toHaveBeenCalledTimes(1);
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.frames.size).toBe(0);
  });
  it('rejects duplicate changed IDs and wrong paper targets without committing a prefix', () => {
    for (const wrongTarget of [false, true]) {
      const f = fixture();
      const a = touch('a', 10, 20, 1);
      if (wrongTarget) a.target = {};
      f.input.start(event([a], wrongTarget ? [a] : [a, a], { a: 1 }));
      expect(f.error).toHaveBeenCalledTimes(1);
      expect(f.complete).not.toHaveBeenCalled();
    }
  });
  it('refuses a silently disappeared contact and ignores all callbacks after explicit cancellation', () => {
    const f = fixture();
    f.input.start(event([touch('a', 10, 20, 1)], [touch('a', 10, 20, 1)], { a: 1 }));
    f.input.move(event([], [], {}));
    expect(f.error).toHaveBeenCalledTimes(1);
    expect(f.complete).not.toHaveBeenCalled();
    const cancelled = fixture();
    cancelled.input.start(event([touch('a', 10, 20, 1)], [touch('a', 10, 20, 1)], { a: 1 }));
    cancelled.input.cancel();
    cancelled.input.end(event([], [touch('a', 20, 20, 2)], { a: 1 }));
    cancelled.drain();
    expect(cancelled.complete).not.toHaveBeenCalled();
    expect(cancelled.error).not.toHaveBeenCalled();
  });
  it('keeps 64 delivered groups and the global seed cursor without inferred endpoints', () => {
    const cohort = createRecordedContactCohort7(PAPER, 'per-frame', 1);
    cohort.start('a', STYLE, { x: 10, y: 10 });
    for (let group = 1; group <= 64; group++) {
      cohort.move('a', [{ x: 10 + group, y: 10 }]);
      if (group % 8 === 0) cohort.drain();
    }
    const completed = cohort.end('a');
    expect(completed.command.moves.filter((m) => m.kind === 'move')).toHaveLength(64);
    expect(completed.command.ops.filter((op) => op.kind === 'crayonFlush')).toHaveLength(2);
    expect(completed.seedCursor).toBe(3);
    expect(() => cohort.move('a', [{ x: 90, y: 10 }])).toThrow('closed');
  });
  it('copies admitted samples and poisons malformed input instead of accepting a later suffix', () => {
    const cohort = createRecordedContactCohort7(PAPER, 'per-frame', 1);
    cohort.start('a', STYLE, { x: 10, y: 10 });
    const samples = [{ x: 20, y: 10 }];
    cohort.move('a', samples);
    samples[0].x = 999;
    const completed = cohort.end('a');
    expect(completed.command.moves[1].samples).toEqual([{ x: 20, y: 10 }]);
    const rejected = createRecordedContactCohort7(PAPER, 'per-frame', 1);
    rejected.start('a', STYLE, { x: 10, y: 10 });
    expect(() => rejected.move('a', [])).toThrow('samples');
    expect(() => rejected.end('a')).toThrow('closed');
  });
});

describe('incremental native recorded prefixes', () => {
  it('publishes a start dot and drained midpoint path before lift, with one atomic final completion', () => {
    const f = fixture();
    const a = touch('a', 10, 20, 1);
    f.input.start(event([a], [a], { a: 1 }));
    expect(f.input.hasActive()).toBe(true);
    expect(f.preview.mock.lastCall[0].ops.map((op) => op.kind)).toEqual(['crayonDot']);
    const prefix = f.input.snapshot();
    const moved = touch('a', 30, 20, 2);
    f.input.move(event([moved], [moved], { a: 1 }));
    expect(f.input.snapshot()).toBe(prefix);
    f.drain();
    expect(f.input.snapshot().ops.map((op) => op.kind)).toEqual(['crayonDot', 'crayonPath']);
    expect(prefix.ops).toHaveLength(1);
    expect(Object.isFrozen(prefix.ops[0].at)).toBe(true);
    const previews = f.preview.mock.calls.length;
    f.input.end(event([], [touch('a', 500, 300, 3)], { a: 1 }));
    expect(f.preview).toHaveBeenCalledTimes(previews);
    expect(f.complete).toHaveBeenCalledTimes(1);
    expect(f.input.hasActive()).toBe(false);
    expect(f.input.snapshot()).toBeNull();
    const command = f.complete.mock.lastCall[0].command;
    expect(command.ops.at(-2).segments.at(-1)).toEqual({ cx: 20, cy: 40, x: 40, y: 40 });
    expect(command.ops.at(-1)).toEqual({ kind: 'crayonFlush' });
    f.input.cancel();
    expect(command.ops).toHaveLength(3);
  });
  it('maps a new contact through resized locked paper without changing its adopted reference', () => {
    const f = fixture({ ...FRAME, width: 256, height: 192 });
    const a = touch('a', 10, 20, 1);
    f.input.start(event([a], [a], { a: 1 }));
    expect(f.error).not.toHaveBeenCalled();
    expect(f.input.snapshot().paper).toEqual(PAPER);
    expect(f.input.snapshot().ops[0].at).toEqual({ x: 40, y: 80 });
    f.input.end(event([], [touch('a', 500, 300, 2)], { a: 1 }));
    expect(f.complete.mock.lastCall[0].paper).toEqual(PAPER);
  });
  it('clears canceled live state and ignores a genuinely scheduled late callback', () => {
    const f = fixture();
    const a = touch('a', 10, 20, 1);
    f.input.start(event([a], [a], { a: 1 }));
    const moved = touch('a', 30, 20, 2);
    f.input.move(event([moved], [moved], { a: 1 }));
    const callback = [...f.frames.values()][0];
    f.input.cancel();
    const count = f.preview.mock.calls.length;
    callback(123);
    expect(f.preview).toHaveBeenCalledTimes(count);
    expect(f.preview.mock.lastCall[0]).toBeNull();
    expect(f.input.hasActive()).toBe(false);
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.error).not.toHaveBeenCalled();
  });
  it('refuses a foreign end target and clears rather than committing the live prefix', () => {
    const f = fixture();
    const a = touch('a', 10, 20, 1);
    f.input.start(event([a], [a], { a: 1 }));
    const ended = { ...touch('a', 20, 20, 2), target: {} };
    f.input.end(event([], [ended], { a: 1 }));
    expect(f.error).toHaveBeenCalledTimes(1);
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.preview.mock.lastCall[0]).toBeNull();
  });
});

describe('native recorded allocation abandonment', () => {
  it('hands off a reserved 64-roll seed before clearing the canceled prefix exactly once', () => {
    const f = fixture();
    const a = touch('a', 10, 20, 1);
    f.input.start(event([a], [a], { a: 1 }));
    for (let group = 1; group <= 64; group++) {
      const moved = touch('a', 10, 20, group + 1);
      f.input.move(event([moved], [moved], { a: 1 }));
      if (group % 8 === 0) f.drain();
    }
    expect(f.input.allocationCursor()).toBe(3);
    expect(
      f.input
        .snapshot()
        .ops.filter((op) => 'seed' in op)
        .every((op) => op.seed === 1)
    ).toBe(true);
    f.abandon.mockImplementation((cursor) => {
      expect(cursor).toBe(3);
      expect(f.preview.mock.lastCall[0]).not.toBeNull();
    });
    f.input.cancel();
    f.input.cancel();
    expect(f.abandon).toHaveBeenCalledTimes(1);
    expect(f.abandon).toHaveBeenCalledWith(3);
    expect(f.input.allocationCursor()).toBe(3);
    expect(f.input.snapshot()).toBeNull();
    expect(f.complete).not.toHaveBeenCalled();
  });
  it('hands off the cursor on error and does not abandon a completed cohort', () => {
    const failed = fixture();
    const a = touch('a', 10, 20, 1);
    failed.input.start(event([a], [a], { a: 1 }));
    failed.resize();
    failed.input.move(event([a], [a], { a: 1 }));
    failed.input.cancel();
    expect(failed.abandon).toHaveBeenCalledTimes(1);
    expect(failed.abandon).toHaveBeenCalledWith(2);
    expect(failed.error).toHaveBeenCalledTimes(1);
    expect(failed.complete).not.toHaveBeenCalled();
    const completed = fixture();
    completed.input.start(event([a], [a], { a: 1 }));
    completed.input.end(event([], [touch('a', 10, 20, 2)], { a: 1 }));
    completed.input.cancel();
    expect(completed.complete).toHaveBeenCalledTimes(1);
    expect(completed.abandon).not.toHaveBeenCalled();
  });
});

function soundingFixture() {
  const audio = { begin: vi.fn(), sample: vi.fn(), end: vi.fn() };
  return { ...fixture(FRAME, createContactSound(audio)), audio };
}

describe('sound from admitted recorded contacts', () => {
  it('begins and samples only admitted delivered points once without inventing an up endpoint', () => {
    const f = soundingFixture();
    const a = touch('a', 10, 20, 1);
    const start = event([a], [a], { a: 1 });
    f.input.start(start);
    f.input.start(start);
    expect(f.audio.begin).toHaveBeenCalledTimes(1);
    expect(f.audio.begin).toHaveBeenCalledWith({ x: 20, y: 40 }, 1);
    const moved = touch('a', 20, 20, 2);
    const move = event([moved], [moved], { a: 1 });
    f.input.move(move);
    f.input.move(move);
    expect(f.audio.sample).toHaveBeenCalledTimes(1);
    expect(f.audio.sample).toHaveBeenCalledWith({ x: 40, y: 40 }, 2, {
      point: { x: 20, y: 40 },
      timestamp: 1,
    });
    expect(f.frames.size).toBe(1);
    expect(f.complete).not.toHaveBeenCalled();
    f.input.end(event([], [touch('a', 500, 300, 3)], { a: 1 }));
    f.input.cancel();
    expect(f.audio.sample).toHaveBeenCalledTimes(1);
    expect(f.audio.end).toHaveBeenCalledTimes(1);
    expect(f.complete).toHaveBeenCalledTimes(1);
    expect(f.abandon).not.toHaveBeenCalled();
  });
  it('does not start sound for a rejected target or duplicate changed identifiers', () => {
    for (const badTarget of [false, true]) {
      const f = soundingFixture();
      const a = touch('a', 10, 20, 1);
      if (badTarget) a.target = {};
      f.input.start(event([a], badTarget ? [a] : [a, a], { a: 1 }));
      expect(f.audio.begin).not.toHaveBeenCalled();
      expect(f.audio.sample).not.toHaveBeenCalled();
      expect(f.audio.end).not.toHaveBeenCalled();
      expect(f.error).toHaveBeenCalledTimes(1);
    }
  });
  it('rejects an unadmitted move before sound and ends the previously admitted contact once', () => {
    const f = soundingFixture();
    const a = touch('a', 10, 20, 1);
    f.input.start(event([a], [a], { a: 1 }));
    const foreign = touch('b', 20, 20, 2);
    f.input.move(event([a, foreign], [foreign], { a: 1, b: 2 }));
    f.input.cancel();
    expect(f.audio.begin).toHaveBeenCalledTimes(1);
    expect(f.audio.sample).not.toHaveBeenCalled();
    expect(f.audio.end).toHaveBeenCalledTimes(1);
    expect(f.abandon).toHaveBeenCalledTimes(1);
    expect(f.error).toHaveBeenCalledTimes(1);
    expect(f.complete).not.toHaveBeenCalled();
  });
  it('keeps sound active for another admitted contact until the final admitted end', () => {
    const f = soundingFixture();
    const a = touch('a', 10, 20, 1);
    const b = touch('b', 30, 40, 2);
    f.input.start(event([a], [a], { a: 1 }));
    f.input.start(event([a, b], [b], { a: 1, b: 2 }));
    f.input.end(event([b], [touch('a', 500, 300, 3)], { a: 1, b: 2 }));
    expect(f.audio.begin).toHaveBeenCalledTimes(1);
    expect(f.audio.end).not.toHaveBeenCalled();
    const moved = touch('b', 40, 40, 4);
    f.input.move(event([moved], [moved], { b: 2 }));
    expect(f.audio.sample).toHaveBeenCalledTimes(1);
    expect(f.audio.sample).toHaveBeenCalledWith({ x: 80, y: 80 }, 4, {
      point: { x: 60, y: 80 },
      timestamp: 2,
    });
    f.input.end(event([], [touch('b', 501, 301, 5)], { b: 2 }));
    expect(f.audio.end).toHaveBeenCalledTimes(1);
    expect(f.complete).toHaveBeenCalledTimes(1);
  });
  it('ends canceled sounds once and ignores an actually scheduled late frame and later deliveries', () => {
    const f = soundingFixture();
    const a = touch('a', 10, 20, 1);
    f.input.start(event([a], [a], { a: 1 }));
    const moved = touch('a', 20, 20, 2);
    f.input.move(event([moved], [moved], { a: 1 }));
    const callback = [...f.frames.values()][0];
    f.input.cancel();
    f.input.cancel();
    callback(123);
    f.input.move(event([touch('a', 30, 20, 3)], [touch('a', 30, 20, 3)], { a: 1 }));
    expect(f.audio.begin).toHaveBeenCalledTimes(1);
    expect(f.audio.sample).toHaveBeenCalledTimes(1);
    expect(f.audio.end).toHaveBeenCalledTimes(1);
    expect(f.abandon).toHaveBeenCalledTimes(1);
    expect(f.input.allocationCursor()).toBe(2);
    expect(f.complete).not.toHaveBeenCalled();
  });
  it('preserves abandonment and cleanup when an admitted audio sample fails', () => {
    const f = soundingFixture();
    const a = touch('a', 10, 20, 1);
    f.input.start(event([a], [a], { a: 1 }));
    f.audio.sample.mockImplementation(() => {
      throw new Error('AUDIO_SAMPLE_FAILURE');
    });
    const moved = touch('a', 20, 20, 2);
    f.input.move(event([moved], [moved], { a: 1 }));
    f.input.cancel();
    expect(f.audio.end).toHaveBeenCalledTimes(1);
    expect(f.abandon).toHaveBeenCalledTimes(1);
    expect(f.error.mock.lastCall[0].message).toBe('AUDIO_SAMPLE_FAILURE');
    expect(f.input.snapshot()).toBeNull();
    expect(f.frames.size).toBe(0);
    expect(f.complete).not.toHaveBeenCalled();
  });
});

describe('recorded sound admission and teardown negative controls', () => {
  it('does not begin sound when the actual recorder rejects a style after native target admission', () => {
    const audio = { begin: vi.fn(), sample: vi.fn(), end: vi.fn() };
    const f = fixture(FRAME, createContactSound(audio), () => ({ ...STYLE, width: 999 }));
    const a = touch('a', 10, 20, 1);
    f.input.start(event([a], [a], { a: 1 }));
    expect(audio.begin).not.toHaveBeenCalled();
    expect(audio.sample).not.toHaveBeenCalled();
    expect(audio.end).not.toHaveBeenCalled();
    expect(f.error).toHaveBeenCalledTimes(1);
    expect(f.abandon).toHaveBeenCalledWith(1);
    expect(f.complete).not.toHaveBeenCalled();
  });
  it('clears audio and preview even when the allocation handoff callback fails', () => {
    const f = soundingFixture();
    const a = touch('a', 10, 20, 1);
    f.input.start(event([a], [a], { a: 1 }));
    f.abandon.mockImplementation(() => {
      throw new Error('ABANDON_FAILURE');
    });
    expect(() => f.input.cancel()).toThrow('ABANDON_FAILURE');
    f.input.cancel();
    expect(f.audio.end).toHaveBeenCalledTimes(1);
    expect(f.abandon).toHaveBeenCalledTimes(1);
    expect(f.preview.mock.lastCall[0]).toBeNull();
    expect(f.input.snapshot()).toBeNull();
    expect(f.input.allocationCursor()).toBe(2);
    expect(f.complete).not.toHaveBeenCalled();
  });
});

describe('partially admitted and completed recorded sound cohorts', () => {
  it('ends the admitted contact when a later start in the same delivery is rejected', () => {
    const audio = { begin: vi.fn(), sample: vi.fn(), end: vi.fn() };
    const style = vi
      .fn()
      .mockReturnValueOnce(STYLE)
      .mockReturnValueOnce({ ...STYLE, width: 999 });
    const f = fixture(FRAME, createContactSound(audio), style);
    const a = touch('a', 10, 20, 1);
    const b = touch('b', 30, 40, 1);
    f.input.start(event([a, b], [a, b], { a: 1, b: 1 }));
    f.input.cancel();
    expect(audio.begin).toHaveBeenCalledTimes(1);
    expect(audio.end).toHaveBeenCalledTimes(1);
    expect(audio.sample).not.toHaveBeenCalled();
    expect(f.abandon).toHaveBeenCalledWith(2);
    expect(f.error).toHaveBeenCalledTimes(1);
    expect(f.complete).not.toHaveBeenCalled();
  });
  it('ends sound before completion and preserves no-abandon semantics if that callback rejects', () => {
    const f = soundingFixture();
    const a = touch('a', 10, 20, 1);
    f.input.start(event([a], [a], { a: 1 }));
    f.complete.mockImplementation(() => {
      expect(f.audio.end).toHaveBeenCalledTimes(1);
      throw new Error('COMPLETE_REJECTION');
    });
    f.input.end(event([], [touch('a', 500, 300, 2)], { a: 1 }));
    f.input.cancel();
    expect(f.complete).toHaveBeenCalledTimes(1);
    expect(f.error.mock.lastCall[0].message).toBe('COMPLETE_REJECTION');
    expect(f.audio.end).toHaveBeenCalledTimes(1);
    expect(f.abandon).not.toHaveBeenCalled();
    expect(f.input.allocationCursor()).toBe(2);
  });
});
