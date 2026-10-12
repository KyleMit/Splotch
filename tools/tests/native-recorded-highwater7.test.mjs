import { describe, expect, it } from 'vitest';
import {
  createCohortRecorder7,
  createLiveCohortRecorder7,
} from '../../experiments/native-architecture/src/drawing/cohortRecorder7.ts';
import {
  parseRecordedDrawing7,
  serializeRecordedDrawing7,
} from '../../experiments/native-architecture/src/drawing/recordedDrawing7.ts';
import { isAllocationCursor7 } from '../../experiments/native-architecture/src/drawing/recordedGuards7.ts';
import {
  adoptPaper,
  UNADOPTED_PAPER,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { MAX_CRAYON_SEED } from '../../experiments/native-architecture/src/drawing/brushes.ts';

const PAPER = adoptPaper(512, 384, 2);
const CRAYON = { brush: 'crayon', color: 'Red', width: 2 };
const PEN = { brush: 'pen', color: 'Blue', width: 2 };
function recorded(firstSeed, style = CRAYON) {
  const recorder = createCohortRecorder7(PAPER, [style], 'per-frame', firstSeed);
  recorder.accept({ kind: 'start', contact: 0, samples: [{ x: 100, y: 100 }] });
  recorder.accept({ kind: 'move', contact: 0, samples: [{ x: 120, y: 100 }] });
  recorder.accept({ kind: 'end', contact: 0, samples: [] });
  return recorder.finish();
}
function picture(commands, seedCursor, paper = PAPER) {
  return { version: 7, paper, pageId: 'blank', rainbow: 0, seedCursor, commands };
}
function reopened(value) {
  return parseRecordedDrawing7(JSON.parse(serializeRecordedDrawing7(value)));
}
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

describe('explicit v7 command allocation and persisted high-water', () => {
  it('records actual firstSeed in replay and live producers without changing op phases', () => {
    const replay = recorded(43);
    expect(replay.command.firstSeed).toBe(43);
    expect(replay.command.ops.filter((op) => 'seed' in op).map((op) => op.seed)).toEqual([43, 43]);
    expect(replay.seedCursor).toBe(44);
    const live = createLiveCohortRecorder7(PAPER, 'per-frame', 43);
    live.start(CRAYON, { x: 100, y: 100 });
    live.accept({ kind: 'move', contact: 0, samples: [{ x: 120, y: 100 }] });
    live.accept({ kind: 'end', contact: 0, samples: [] });
    expect(live.finish()).toEqual(replay);
  });
  it('round trips allocation gaps and preserves high-water beyond the last retained command', () => {
    const first = recorded(1);
    const next = recorded(8);
    const value = picture([first.command, next.command], 20);
    expect(reopened(value)).toEqual(value);
    expect(reopened(value).commands.map((command) => command.firstSeed)).toEqual([1, 8]);
    expect(reopened(value).seedCursor).toBe(20);
  });
  it('saves and reopens an Undo-shaped prefix before a distinct new stroke', () => {
    const first = recorded(1);
    const removed = recorded(first.seedCursor);
    const beforeUndo = picture([first.command, removed.command], removed.seedCursor);
    const undoState = picture([beforeUndo.commands[0]], beforeUndo.seedCursor);
    const reopenedUndo = reopened(undoState);
    const next = recorded(reopenedUndo.seedCursor);
    const nextPicture = picture([...reopenedUndo.commands, next.command], next.seedCursor);
    expect(next.command.firstSeed).toBe(3);
    expect(next.command.ops[0].seed).not.toBe(removed.command.ops[0].seed);
    expect(reopened(nextPicture)).toEqual(nextPicture);
    expect(nextPicture.commands.map((command) => command.firstSeed)).toEqual([1, 3]);
  });
  it('represents an explicit canceled allocation gap without inventing ops or history', () => {
    const first = recorded(1);
    const retained = reopened(picture([first.command], 65));
    expect(retained.commands).toHaveLength(1);
    expect(retained.commands[0].ops).toEqual(first.command.ops);
    const next = recorded(retained.seedCursor);
    expect(next.command.firstSeed).toBe(65);
    expect(next.command.ops[0].seed).toBe(65);
    expect(
      reopened(picture([...retained.commands, next.command], next.seedCursor)).seedCursor
    ).toBe(66);
  });
  it.each([1, 42, MAX_CRAYON_SEED + 1])(
    'retains empty New/Clear state at high-water %s',
    (highWater) => {
      const empty = picture([], highWater, UNADOPTED_PAPER);
      expect(reopened(empty)).toEqual(empty);
      const adopted = picture([], highWater);
      expect(reopened(adopted)).toEqual(adopted);
    }
  );
  it('allows a final legal seed, refuses wrap, and retains exhausted empty state', () => {
    const last = recorded(MAX_CRAYON_SEED);
    expect(last.command.firstSeed).toBe(MAX_CRAYON_SEED);
    expect(last.seedCursor).toBe(MAX_CRAYON_SEED + 1);
    expect(reopened(picture([last.command], last.seedCursor)).seedCursor).toBe(MAX_CRAYON_SEED + 1);
    expect(() => recorded(MAX_CRAYON_SEED + 1)).toThrow('exhausted');
    expect(reopened(picture([], MAX_CRAYON_SEED + 1)).commands).toEqual([]);
    const pen = recorded(MAX_CRAYON_SEED + 1, PEN);
    expect(pen.seedCursor).toBe(MAX_CRAYON_SEED + 1);
    expect(reopened(picture([pen.command], pen.seedCursor)).commands[0].firstSeed).toBe(
      MAX_CRAYON_SEED + 1
    );
  });
  it('does not require a new allocation for a Pen command at the same derived floor', () => {
    const pen = recorded(1, PEN);
    const crayon = recorded(pen.seedCursor);
    expect(pen.seedCursor).toBe(1);
    expect(
      reopened(picture([pen.command, crayon.command], crayon.seedCursor)).commands.map(
        (command) => command.firstSeed
      )
    ).toEqual([1, 1]);
  });
  it.each([
    [
      'missing mandatory firstSeed',
      (v) => {
        delete v.commands[0].firstSeed;
      },
    ],
    [
      'unknown command field',
      (v) => {
        v.commands[0].allocation = 1;
      },
    ],
    [
      'zero firstSeed',
      (v) => {
        v.commands[0].firstSeed = 0;
      },
    ],
    [
      'fractional firstSeed',
      (v) => {
        v.commands[0].firstSeed = 1.5;
      },
    ],
    [
      'string firstSeed',
      (v) => {
        v.commands[0].firstSeed = '1';
      },
    ],
    [
      'nonfinite firstSeed',
      (v) => {
        v.commands[0].firstSeed = Infinity;
      },
    ],
    [
      'unsafe firstSeed',
      (v) => {
        v.commands[0].firstSeed = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'beyond allowed cursor',
      (v) => {
        v.commands[0].firstSeed = MAX_CRAYON_SEED + 2;
      },
    ],
    [
      'firstSeed above drawing high-water',
      (v) => {
        v.commands[0].firstSeed = v.seedCursor + 1;
      },
    ],
    [
      'high-water below derived allocation',
      (v) => {
        v.seedCursor = 1;
      },
    ],
    [
      'wrong declared phase',
      (v) => {
        v.commands[0].ops[0].seed = 2;
      },
    ],
    [
      'root cursor string',
      (v) => {
        v.seedCursor = '2';
      },
    ],
    [
      'root cursor nonfinite',
      (v) => {
        v.seedCursor = NaN;
      },
    ],
    [
      'root cursor beyond exhaustion',
      (v) => {
        v.seedCursor = MAX_CRAYON_SEED + 2;
      },
    ],
  ])('refuses %s', (_, corrupt) => {
    const result = recorded(1);
    const value = plain(picture([result.command], result.seedCursor));
    corrupt(value);
    expect(() => parseRecordedDrawing7(value)).toThrow();
  });
  it('refuses backward and duplicate allocations across individually authentic commands', () => {
    const first = recorded(10);
    const backward = recorded(1);
    const duplicate = recorded(10);
    expect(() => parseRecordedDrawing7(picture([first.command, backward.command], 20))).toThrow();
    expect(() => parseRecordedDrawing7(picture([first.command, duplicate.command], 20))).toThrow();
  });
  it('refuses an edited firstSeed unless the exact regenerated ops authenticate that declared allocation', () => {
    const value = plain(picture([recorded(1).command], 20));
    value.commands[0].firstSeed = 8;
    expect(() => parseRecordedDrawing7(value)).toThrow('ops do not match');
  });
  it('rejects malformed allocation headers before visiting late move payloads', () => {
    const value = plain(picture([recorded(1).command], 2));
    let visits = 0;
    const late = new Array(1);
    Object.defineProperty(late, 0, {
      get() {
        visits++;
        throw new Error('LATE_MOVE_VISITED');
      },
    });
    value.commands[0].moves = late;
    value.commands[0].firstSeed = 0;
    expect(() => parseRecordedDrawing7(value)).toThrow('command shape');
    expect(visits).toBe(0);
  });
  it('rejects allocation getters without invoking them and validates the exact cursor endpoints', () => {
    const value = plain(picture([recorded(1).command], 2));
    let visits = 0;
    Object.defineProperty(value.commands[0], 'firstSeed', {
      enumerable: true,
      get() {
        visits++;
        return 1;
      },
    });
    expect(() => parseRecordedDrawing7(value)).toThrow();
    expect(visits).toBe(0);
    expect(isAllocationCursor7(1)).toBe(true);
    expect(isAllocationCursor7(MAX_CRAYON_SEED + 1)).toBe(true);
    expect(isAllocationCursor7(0)).toBe(false);
    expect(isAllocationCursor7(MAX_CRAYON_SEED + 2)).toBe(false);
  });
});

describe('allocation query after uncompleted live cohorts', () => {
  it('retains a checkpoint allocation with no subsequent op through poison and cancel', () => {
    const live = createLiveCohortRecorder7(PAPER, 'per-frame', 42);
    live.start(CRAYON, { x: 100, y: 100 });
    for (let group = 1; group <= 64; group++) {
      live.accept({ kind: 'move', contact: 0, samples: [{ x: 100, y: 100 }] });
      if (group % 8 === 0) live.accept({ kind: 'drain' });
    }
    expect(live.allocationCursor()).toBe(44);
    expect(
      live
        .snapshot()
        .ops.filter((op) => 'seed' in op)
        .every((op) => op.seed === 42)
    ).toBe(true);
    expect(() => live.accept({ kind: 'UNKNOWN' })).toThrow();
    expect(live.allocationCursor()).toBe(44);
    live.cancel();
    expect(live.allocationCursor()).toBe(44);
    const next = recorded(live.allocationCursor());
    expect(next.command.ops[0].seed).toBe(44);
    expect(reopened(picture([next.command], next.seedCursor)).seedCursor).toBe(45);
  });
});
