import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCohortRecorder7,
  createLiveCohortRecorder7,
} from '../../experiments/native-architecture/src/drawing/cohortRecorder7.ts';
import { createRecordedContactCohort7 } from '../../experiments/native-architecture/src/drawing/recordedContactCohort7.ts';
import { CrayonTracker7 } from '../../experiments/native-architecture/src/drawing/crayonTracker7.ts';
import {
  adoptPaper,
  paperScale,
  textureScale,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { parseRecordedDrawing7 } from '../../experiments/native-architecture/src/drawing/recordedDrawing7.ts';
import {
  MAX_CONTACTS_7,
  MAX_GEOMETRY_7,
} from '../../experiments/native-architecture/src/drawing/recordedTypes7.ts';
import { shippingRecorderOracle7 } from './native-recorded-crayon7-oracle.mjs';

const CRAYON = { brush: 'crayon', color: 'Red', width: 2 };
const PEN = { brush: 'pen', color: 'Blue', width: 4 };
const point = (x, y = 100) => ({ x, y });
const start = (contact, at) => ({ kind: 'start', contact, samples: [at] });
const move = (contact, at) => ({ kind: 'move', contact, samples: [at] });
const end = (contact) => ({ kind: 'end', contact, samples: [] });
const drain = () => ({ kind: 'drain' });
afterEach(() => vi.restoreAllMocks());

describe('incremental v7 live recorder', () => {
  it.each(['per-move', 'per-frame'])(
    'matches actual shipping ops at every drain and final end for %s',
    (granularity) => {
      const paper = adoptPaper(512, 384, 2);
      const live = createLiveCohortRecorder7(paper, granularity, 1);
      const events = [];
      const styles = [CRAYON, PEN];
      function prefix() {
        expect(live.snapshot().ops).toEqual(
          shippingRecorderOracle7(
            styles,
            granularity,
            events,
            textureScale(paper),
            paperScale(paper)
          )
        );
      }
      expect(live.start(CRAYON, point(100))).toBe(0);
      events.push(start(0, point(100)));
      prefix();
      live.accept(move(0, point(120)));
      events.push(move(0, point(120)));
      expect(live.start(PEN, point(200, 200))).toBe(1);
      events.push(start(1, point(200, 200)));
      prefix();
      live.accept(move(1, point(220, 220)));
      events.push(move(1, point(220, 220)));
      live.accept(move(0, point(100)));
      events.push(move(0, point(100)));
      live.accept(drain());
      events.push(drain());
      prefix();
      live.accept(end(1));
      events.push(end(1));
      prefix();
      live.accept(move(0, point(80)));
      events.push(move(0, point(80)));
      live.accept(end(0));
      events.push(end(0));
      prefix();
      const result = live.finish();
      expect(result.command.ops).toEqual(
        shippingRecorderOracle7(styles, granularity, events, textureScale(paper), paperScale(paper))
      );
      const replay = createCohortRecorder7(paper, styles, granularity, 1);
      for (const event of events) replay.accept(event);
      expect(result).toEqual(replay.finish());
      expect(
        parseRecordedDrawing7({
          version: 7,
          paper,
          pageId: 'blank',
          rainbow: 0,
          seedCursor: result.seedCursor,
          commands: [result.command],
        }).commands[0]
      ).toEqual(result.command);
    }
  );
  it('does not advance old tracker geometry when publishing or finishing an already drained prefix', () => {
    const paper = adoptPaper(512, 384, 1);
    const advance = vi.spyOn(CrayonTracker7.prototype, 'advance');
    const cohort = createRecordedContactCohort7(paper, 'per-frame', 1);
    cohort.start('a', CRAYON, point(100));
    let previous = 0;
    for (let delivery = 1; delivery <= 32; delivery++) {
      cohort.move('a', [point(100 + delivery)]);
      cohort.drain();
      expect(advance.mock.calls.length - previous).toBe(1);
      previous = advance.mock.calls.length;
      const prefix = cohort.snapshot();
      expect(cohort.snapshot()).toBe(prefix);
      expect(advance).toHaveBeenCalledTimes(previous);
    }
    const result = cohort.end('a');
    expect(advance).toHaveBeenCalledTimes(32);
    expect(result.command.ops.some((op) => op.kind === 'crayonPath')).toBe(true);
    cohort.cancel();
    expect(result.command.ops.length).toBeGreaterThan(1);
  });
  it('retains immutable pre-lift prefixes and preserves the replay API mutable output behavior', () => {
    const paper = adoptPaper(512, 384, 1);
    const live = createLiveCohortRecorder7(paper, 'per-frame', 1);
    live.start(CRAYON, point(100));
    const first = live.snapshot();
    live.accept(move(0, point(120)));
    expect(live.snapshot()).toBe(first);
    live.accept(drain());
    const second = live.snapshot();
    expect(second.ops).toHaveLength(2);
    expect(first.ops).toHaveLength(1);
    expect(() => {
      first.ops[0].at.x = 999;
    }).toThrow();
    live.accept(end(0));
    const final = live.finish();
    expect(Object.isFrozen(final.command.moves)).toBe(true);
    live.cancel();
    expect(final.command.ops).toHaveLength(3);
    const replay = createCohortRecorder7(paper, [CRAYON], 'per-frame', 1);
    replay.accept(start(0, point(100)));
    replay.accept(end(0));
    const mutable = replay.finish();
    mutable.command.ops[0].seed = 99;
    expect(mutable.command.ops[0].seed).toBe(99);
  });
  it('credits 64 actual groups globally across contacts and keeps a distinct later seed', () => {
    const paper = adoptPaper(512, 384, 2);
    const live = createLiveCohortRecorder7(paper, 'per-frame', 1);
    live.start(CRAYON, point(100));
    live.start(CRAYON, point(300));
    for (let delivery = 1; delivery <= 64; delivery++) {
      const contact = delivery % 2;
      live.accept(move(contact, point((contact ? 300 : 100) + delivery / 2)));
      live.accept(drain());
    }
    expect(live.snapshot().ops.filter((op) => op.kind === 'crayonFlush')).toHaveLength(1);
    live.accept(end(0));
    live.accept(end(1));
    const result = live.finish();
    expect(result.seedCursor).toBe(4);
    const next = createLiveCohortRecorder7(paper, 'per-frame', result.seedCursor);
    next.start(CRAYON, point(100));
    expect(next.snapshot().ops[0].seed).toBe(4);
  });
  it('poisons malformed style/input and refuses empty completion or cross-cohort restart', () => {
    const paper = adoptPaper(512, 384, 1);
    const empty = createLiveCohortRecorder7(paper, 'per-frame', 1);
    expect(() => empty.finish()).toThrow('incomplete');
    const malformed = createLiveCohortRecorder7(paper, 'per-frame', 1);
    expect(() => malformed.start({ ...CRAYON, width: 3 }, point(100))).toThrow();
    expect(() => malformed.start(CRAYON, point(100))).toThrow('closed');
    const value = createLiveCohortRecorder7(paper, 'per-frame', 1);
    value.start(CRAYON, point(100));
    expect(() => value.accept({ kind: 'move', contact: 0, samples: [], extra: true })).toThrow();
    expect(() => value.snapshot()).toThrow('closed');
    const ended = createLiveCohortRecorder7(paper, 'per-frame', 1);
    ended.start(CRAYON, point(100));
    ended.accept(end(0));
    expect(() => ended.start(PEN, point(200))).toThrow('contact start');
  });
  it('retains the contact and input caps including empty drains', () => {
    const paper = adoptPaper(512, 384, 1);
    const contacts = createLiveCohortRecorder7(paper, 'per-frame', 1);
    for (let contact = 0; contact < MAX_CONTACTS_7; contact++) contacts.start(PEN, point(100));
    expect(() => contacts.start(PEN, point(100))).toThrow('contact count');
    const inputs = createLiveCohortRecorder7(paper, 'per-frame', 1);
    for (let input = 0; input < MAX_GEOMETRY_7; input++) inputs.accept(drain());
    expect(() => inputs.accept(drain())).toThrow('retained inputs');
    expect(() => inputs.snapshot()).toThrow('closed');
  });
});
