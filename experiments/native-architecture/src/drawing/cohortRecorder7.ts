import { MAX_CRAYON_SEED } from './brushes';
import { paperScale, textureScale, type AdoptedPaper } from './paperSpace';
import { input7, point7, style7, recorderConfiguration7, recorderReference7 } from './recordedGuards7';
import { freezeOp7, freezeCommand7, type RecorderSnapshot7 } from './recordedSnapshot7';
import { CrayonTracker7 } from './crayonTracker7';
import { createRasterRouter7, type Contact7 } from './crayonRaster7';
import {
  CHECKPOINT_MOVES_7, MAX_CONTACTS_7, MAX_GEOMETRY_7, MAX_RETAINED_INPUTS_7, MAX_RETAINED_OPS_7,
  type Point7, type Style7, type Input7, type Op7,
  type Granularity7, type Command7,
} from './recordedTypes7';

function command7(firstSeed: number, granularity: Granularity7, styles: readonly Style7[], moves: readonly Input7[], ops: readonly Op7[]): Command7 {
  return { firstSeed, granularity, styles: styles.map((style) => ({ ...style })), moves, ops };
}

function createInputGate7(styles: readonly Style7[], moves: readonly Input7[], remaining: () => number,
  acceptValidated: (input: Input7) => void) {
  let sealed = false;
  return {
    isSealed: () => sealed,
    poison: () => { sealed = true; },
    accept(value: unknown) {
      try {
        if (sealed) throw new Error('The v7 cohort is sealed.');
        if (moves.length >= MAX_RETAINED_INPUTS_7)
          throw new Error('The v7 cohort has too many retained inputs.');
        acceptValidated(input7(value, styles.length, remaining()));
      } catch (error) { sealed = true;throw error; }
    },
  };
}

function createRecorderBuffers7(styles: Style7[], mode: 'replay' | 'live') {
  const moves: Input7[] = [];
  const ops: Op7[] = [];
  let cached: RecorderSnapshot7 | null = null;
  return {
    moves,
    appendOp(op: Op7) {
      if (ops.length >= MAX_RETAINED_OPS_7) throw new Error('The v7 cohort has too many ops.');
      ops.push(mode === 'live' ? freezeOp7(op) : op);
    },
    command(firstSeed: number, granularity: Granularity7) {
      const command = command7(firstSeed, granularity, styles, moves, ops);
      return mode === 'live' ? freezeCommand7(command) : command;
    },
    snapshot(): RecorderSnapshot7 {
      if (cached && cached.styles.length === styles.length && cached.ops.length === ops.length) return cached;
      cached = Object.freeze({ styles: Object.freeze(styles.slice()), ops: Object.freeze(ops.slice()) });
      return cached;
    },
    clear() { moves.length = 0;ops.length = 0;styles.length = 0;cached = null; },
  };
}

function createRecorderEngine7(
  validatedPaper: AdoptedPaper, styles: Style7[], granularity: Granularity7,
  firstSeed: number, mode: 'replay' | 'live'
) {
  const scale = paperScale(validatedPaper);
  const texel = textureScale(validatedPaper);
  const active = new Map<number, Contact7>();
  const buffers = createRecorderBuffers7(styles, mode);
  const { moves, appendOp } = buffers;
  let seedCursor = firstSeed;
  let movesSinceFlush = 0;
  let started = 0;
  let geometry = 0;

  function charge(count: number) {
    geometry += count;
    if (geometry > MAX_GEOMETRY_7) throw new Error('The v7 cohort is too large.');
  }
  function allocate() {
    if (seedCursor > MAX_CRAYON_SEED) throw new Error('The v7 seed space is exhausted.');
    return seedCursor++;
  }
  function tracker(at: Point7, style: Style7) {
    return new CrayonTracker7(at.x, at.y, style.width / scale, texel);
  }
  function flush() {
    appendOp({ kind: 'crayonFlush' });
    movesSinceFlush = 0;
  }
  function roll(state: Contact7) {
    flush();
    state.seed = allocate();
    state.tracker = tracker(state.last, state.style);
    return state.tracker;
  }
  function beforeForeign(state: Contact7) {
    if (!state.tracker && movesSinceFlush > 0) flush();
  }
  function credit(state: Contact7, count: number) {
    if (!state.tracker) return;
    movesSinceFlush += count;
    if (movesSinceFlush >= CHECKPOINT_MOVES_7) roll(state);
  }
  const drain = createRasterRouter7({ active, granularity, appendOp, charge, beforeForeign, roll, credit });
  function acceptValidated(input: Input7) {
    if (input.kind === 'drain') {
      moves.push({ kind: 'drain' });
      drain();
      return;
    }
    charge(input.samples.length);
    const samples = input.samples.map((p) => ({ x: p.x, y: p.y }));
    moves.push({ kind: input.kind, contact: input.contact, samples });
    if (input.kind === 'start') {
      if (input.contact !== started || !styles[input.contact] ||
          (started > 0 && active.size === 0)) throw new Error('Invalid v7 contact start.');
      const style = styles[input.contact];
      const at = samples[0];
      const state: Contact7 = {
        style, last: at, mid: at, pending: [],
        seed: style.brush === 'crayon' ? allocate() : 0,
        tracker: style.brush === 'crayon' ? tracker(at, style) : null,
      };
      active.set(input.contact, state);
      started++;
      beforeForeign(state);
      charge(1);
      appendOp(state.tracker
        ? { kind: 'crayonDot', contact: input.contact, seed: state.seed, at }
        : { kind: 'dot', contact: input.contact, at });
      return;
    }
    const state = active.get(input.contact);
    if (!state) throw new Error('Unknown v7 contact.');
    if (input.kind === 'move') {
      state.pending.push(samples);
      return;
    }
    drain();
    if (state.tracker) flush();
    active.delete(input.contact);
  }
  const gate = createInputGate7(styles, moves, () => MAX_GEOMETRY_7 - geometry, acceptValidated);
  function finish() {
    if (gate.isSealed() || active.size || started !== styles.length)
      throw new Error('The v7 cohort is incomplete.');
    gate.poison();
    const command = buffers.command(firstSeed, granularity);
    return { command, seedCursor, geometry };
  }
  function cancel() {
    gate.poison();active.clear();buffers.clear();
  }
  return { accept: gate.accept, finish, cancel, poison: gate.poison, snapshot: buffers.snapshot, allocationCursor: () => seedCursor }; 
}

export function createCohortRecorder7(
  paper: AdoptedPaper, styles: readonly Style7[], granularity: Granularity7, firstSeed: number
) {
  const configuration = recorderConfiguration7(paper, styles, granularity, firstSeed);
  const engine = createRecorderEngine7(configuration.paper, configuration.styles, granularity, firstSeed, 'replay');
  return { accept: engine.accept, finish: engine.finish, allocationCursor: engine.allocationCursor };
}

export function createLiveCohortRecorder7(paper: AdoptedPaper, granularity: Granularity7, firstSeed: number) {
  const reference = recorderReference7(paper, granularity, firstSeed);
  const styles: Style7[] = [];
  const engine = createRecorderEngine7(reference, styles, granularity, firstSeed, 'live');
  let state: 'open' | 'failed' | 'finished' | 'cancelled' = 'open';
  function check() {
    if (state !== 'open') throw new Error('The live v7 recorder is closed.');
  }
  return {
    allocationCursor: engine.allocationCursor,
    start(style: Style7, point: Point7): number {
      check();
      try {
        if (styles.length >= MAX_CONTACTS_7) throw new Error('Invalid v7 contact count.');
        const admittedStyle = Object.freeze(style7(style));
        const admittedPoint = point7(point);
        const contact = styles.length;
        styles.push(admittedStyle);
        engine.accept({ kind: 'start', contact, samples: [admittedPoint] });
        return contact;
      } catch (error) { state = 'failed';engine.poison();throw error; }
    },
    accept(value: unknown) {
      check();
      try { engine.accept(value); } catch (error) { state = 'failed';throw error; }
    },
    snapshot(): RecorderSnapshot7 {
      check();
      return engine.snapshot();
    },
    cancel() {
      if (state === 'finished' || state === 'cancelled') return;
      state = 'cancelled';engine.cancel();
    },
    finish() {
      check();
      try {
        if (!styles.length) throw new Error('The v7 cohort is incomplete.');
        const result = engine.finish();
        state = 'finished';
        return result;
      } catch (error) { state = 'failed';engine.poison();throw error; }
    },
  };
}
