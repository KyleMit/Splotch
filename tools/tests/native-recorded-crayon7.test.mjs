import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { adoptPaper, paperScale, textureScale } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { CrayonTracker7 } from '../../experiments/native-architecture/src/drawing/crayonTracker7.ts';
import { createCohortRecorder7 } from '../../experiments/native-architecture/src/drawing/cohortRecorder7.ts';
import { parseRecordedDrawing7, serializeRecordedDrawing7 } from '../../experiments/native-architecture/src/drawing/recordedDrawing7.ts';
import { parseDrawing, emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
import { MAX_CRAYON_SEED } from '../../experiments/native-architecture/src/drawing/brushes.ts';
import { shippingTracker7, shippingRecorderOracle7 } from './native-recorded-crayon7-oracle.mjs';

const start = (contact, x = 100, y = 100) => ({kind:'start', contact, samples:[{x,y}]});
const move = (contact, samples) => ({kind:'move', contact, samples});
const end = (contact) => ({kind:'end', contact, samples:[]});
const drain = () => ({kind:'drain'});
const style = (width = 2) => ({brush:'crayon', color:'Red', width});
function record(styles, events, granularity = 'per-move', backing = 1, firstSeed = 1) {
  const paper = adoptPaper(512, 384, backing);
  const recorder = createCohortRecorder7(paper, styles, granularity, firstSeed);
  for (const event of events) recorder.accept(event);
  return {paper, ...recorder.finish()};
}
function drawing(result) {
  return {version:7, paper:result.paper, pageId:'blank', rainbow:0,
    seedCursor:result.seedCursor, commands:[result.command]};
}
function zigzag(count) {
  return Array.from({length:count}, (_, i) => move(0, [{x:i % 2 ? 100 : 300, y:100}]));
}
function track(Tracker, points, width, texel, shipping = false) {
  let previous = points[0];
  let tracker = shipping
    ? new Tracker(previous.x / texel, previous.y / texel, width / texel)
    : new Tracker(previous.x, previous.y, width, texel);
  return points.slice(1).map((point) => {
    const p = shipping ? {x:point.x / texel, y:point.y / texel} : point;
    const decision = tracker.advance(p);
    if (decision === 'split') {
      tracker = shipping
        ? new Tracker(previous.x / texel, previous.y / texel, width / texel)
        : new Tracker(previous.x, previous.y, width, texel);
      tracker.advance(p);
    }
    previous = point;
    return decision;
  });
}
function trackerMutant(before, after) {
  const source = readFileSync(new URL('../../experiments/native-architecture/src/drawing/crayonTracker7.ts', import.meta.url), 'utf8');
  if (!source.includes(before)) throw new Error('Tracker mutation target absent.');
  const exports = {};
  runInNewContext(ts.transpileModule(source.replace(before, after), {
    compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022},
  }).outputText, {exports});
  return exports.CrayonTracker7;
}
const trackerScenes = [
  [{x:100,y:100},{x:102,y:100},{x:103,y:101},{x:105,y:100},{x:102,y:100},{x:100,y:100}],
  [{x:100,y:100},{x:120,y:100},{x:120,y:120},{x:100,y:120},{x:100,y:102},{x:120,y:100}],
  Array.from({length:80}, (_,i) => ({x:100+i, y:100+(i%3)/4})),
];

describe('private v7 Crayon shipping core', () => {
  it.each([1, 2])('matches actual shipping tracker decisions at DPR %s for thin widths', (backing) => {
    const paper = adoptPaper(512,384,backing);
    const texel = textureScale(paper);
    const actual = [2,4].flatMap((width) => trackerScenes.map((points) =>
      track(CrayonTracker7, points, width / paperScale(paper), texel)));
    const expected = [2,4].flatMap((width) => trackerScenes.map((points) =>
      track(shippingTracker7(), points, width / paperScale(paper), texel, true)));
    expect(actual).toEqual(expected);
  });
  it('detects loss of the three-texel direction floor', () => {
    const points = [{x:100,y:100},{x:104,y:100},{x:102,y:100}];
    const mutant = trackerMutant('MIN_DIR_STEP_PX * texel', '0');
    expect(track(mutant, points, 4, 2)).not.toEqual(track(shippingTracker7(), points, 4, 2, true));
  });
  it.each(['per-move','per-frame'])('matches shipping midpoint, split, queue and endpoint owners for %s', (granularity) => {
    const styles = [style(2), {brush:'pen', color:'Blue', width:4}];
    const events = [start(0), move(0,[{x:120,y:100},{x:140,y:100}]),
      start(1,200,200), move(1,[{x:220,y:220}]), move(0,[{x:100,y:100}]),
      drain(), move(0,[{x:80,y:100}]), end(1), end(0)];
    const result = record(styles,events,granularity);
    expect(result.command.ops).toEqual(shippingRecorderOracle7(styles,granularity,events,
      textureScale(result.paper),paperScale(result.paper)));
  });
  it.each(['per-move','per-frame'])('credits 64 delivered groups rather than 256 samples in %s', (granularity) => {
    const groups = Array.from({length:64}, (_,i) => move(0,
      Array.from({length:4},(_,j) => ({x:101+i*4+j,y:100}))));
    const events = [start(0),...groups,drain(),end(0)];
    const result = record([style()],events,granularity);
    expect(result.seedCursor).toBe(3);
    expect(result.command.ops.filter((op) => op.kind === 'crayonFlush')).toHaveLength(2);
    expect(result.command.ops).toEqual(shippingRecorderOracle7([style()],granularity,events,
      textureScale(result.paper),paperScale(result.paper)));
  });
  it('does not treat 64 samples in one delivered move as 64 pointermoves', () => {
    const result = record([style()],[start(0),move(0,
      Array.from({length:64},(_,i) => ({x:101+i,y:100}))),end(0)]);
    expect(result.seedCursor).toBe(2);
    expect(result.command.ops.filter((op) => op.kind === 'crayonFlush')).toHaveLength(1);
  });
  it('allocates 42 passes and a distinct next-contact seed without affine collisions', () => {
    const first = record([style()],[start(0),...zigzag(42),end(0)]);
    const seeds = first.command.ops.filter((op) => 'seed' in op).map((op) => op.seed);
    const next = record([style()],[start(0),end(0)],'per-move',1,first.seedCursor);
    expect(new Set(seeds).size).toBe(42);
    expect(first.seedCursor).toBe(43);
    expect(next.command.ops[0].seed).toBe(43);
    expect(new Set([...seeds,next.command.ops[0].seed]).size).toBe(43);
  });
  it('reuses the same pass seed across separate ops and retains queued tail before final flush', () => {
    const result = record([style()],[start(0),move(0,[{x:120,y:100}]),drain(),
      move(0,[{x:140,y:100}]),end(0)]);
    expect(result.command.ops.filter((op) => 'seed' in op).map((op) => op.seed)).toEqual([1,1,1]);
    expect(result.command.ops.at(-2).segments.at(-1)).toEqual({cx:120,cy:100,x:130,y:100});
    expect(result.command.ops.at(-1)).toEqual({kind:'crayonFlush'});
    expect(result.command.ops.some((op) => op.segments?.some((s) => s.x === 140))).toBe(false);
  });
  it('drains simultaneous contacts in insertion order, rather than raw move arrival order', () => {
    const events = [start(0),start(1,200,100),move(1,[{x:220,y:100}]),
      move(0,[{x:120,y:100}]),drain(),end(0),end(1)];
    const result = record([style(),style()],events);
    expect(result.command.ops.filter((op) => op.kind === 'crayonPath').map((op) => op.contact)).toEqual([0,1]);
    expect(result.command.ops).toEqual(shippingRecorderOracle7([style(),style()], 'per-move', events,
      textureScale(result.paper),paperScale(result.paper)));
  });
  it('round trips v7 through the production parser while the empty drawing remains v6', () => {
    const result = record([style()],[start(0),move(0,[{x:120,y:100}]),end(0)]);
    const value = drawing(result);
    expect(parseRecordedDrawing7(JSON.parse(serializeRecordedDrawing7(value)))).toEqual(value);
    expect(emptyDrawing().version).toBe(6);
    expect(parseDrawing(JSON.parse(serializeRecordedDrawing7(value)))).toEqual(value);
  });
  it.each([
    ['missing field', (v) => {delete v.seedCursor;}],
    ['unknown field', (v) => {v.extra = true;}],
    ['nonfinite sample', (v) => {v.commands[0].moves[1].samples[0].x = NaN;}],
    ['unknown move kind', (v) => {v.commands[0].moves[1].kind = 'coalesced';}],
    ['extra drain field', (v) => {v.commands[0].moves.splice(1,0,{kind:'drain',contact:0});}],
    ['duplicate allocation', (v) => {v.commands[0].ops.find((op) => op.seed === 2).seed = 1;}],
    ['wrong phase', (v) => {v.commands[0].ops[1].seed = 50;}],
    ['invented endpoint', (v) => {v.commands[0].moves.at(-1).samples = [{x:100,y:100}];}],
    ['cursor reuse', (v) => {v.seedCursor = 1;}],
    ['missing op', (v) => {v.commands[0].ops.pop();}],
    ['unknown op field', (v) => {v.commands[0].ops[0].extra = 1;}],
    ['legacy style', (v) => {v.commands[0].styles[0].brush = 'marker';}],
    ['illegal width', (v) => {v.commands[0].styles[0].width = 3;}],
  ])('rejects %s at the v7 boundary', (_, mutate) => {
    const value = drawing(record([style()],[start(0),...zigzag(3),end(0)]));
    mutate(value);
    expect(() => parseRecordedDrawing7(value)).toThrow();
  });
  it('rejects removal of an observed native drain boundary without changing retained ops', () => {
    const value = drawing(record([style()], [start(0), move(0,[{x:120,y:100}]),
      drain(), move(0,[{x:140,y:100}]), end(0)], 'per-frame'));
    value.commands[0].moves = value.commands[0].moves.filter((event) => event.kind !== 'drain');
    expect(() => parseRecordedDrawing7(value)).toThrow();
  });
  it('rejects nonfinite retained geometry and wrong op contact independently of input', () => {
    const first = drawing(record([style()],[start(0),move(0,[{x:120,y:100}]),end(0)]));
    first.commands[0].ops[1].segments[0].cx = Infinity;
    const second = drawing(record([style()],[start(0),move(0,[{x:120,y:100}]),end(0)]));
    second.commands[0].ops[1].contact = 1;
    expect(() => parseRecordedDrawing7(first)).toThrow();
    expect(() => parseRecordedDrawing7(second)).toThrow();
  });
  it('refuses seed exhaustion rather than wrapping into an earlier phase', () => {
    const recorder = createCohortRecorder7(adoptPaper(512,384,1),[style()],'per-move',MAX_CRAYON_SEED + 1);
    expect(() => recorder.accept(start(0))).toThrow('exhausted');
    expect(() => recorder.finish()).toThrow();
  });
});
