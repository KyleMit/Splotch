import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { adoptPaper, paperScale, textureScale } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { createCohortRecorder7 } from '../../experiments/native-architecture/src/drawing/cohortRecorder7.ts';
import { CrayonTracker7 } from '../../experiments/native-architecture/src/drawing/crayonTracker7.ts';
import { parseRecordedDrawing7 } from '../../experiments/native-architecture/src/drawing/recordedDrawing7.ts';
import { admitRecordedBounds7 } from '../../experiments/native-architecture/src/drawing/recordedBounds7.ts';
import { MAX_CONTACTS_7, MAX_GEOMETRY_7, MAX_RETAINED_INPUTS_7, MAX_RETAINED_OPS_7, MAX_SAVED_BYTES_7 } from '../../experiments/native-architecture/src/drawing/recordedTypes7.ts';
import { shippingTracker7 } from './native-recorded-crayon7-oracle.mjs';

const CAP_CONTROL_TIMEOUT_MS = 30_000;
const style = () => ({brush:'crayon',color:'Red',width:2});
const start = () => ({kind:'start',contact:0,samples:[{x:100,y:100}]});
const end = () => ({kind:'end',contact:0,samples:[]});
const drain = () => ({kind:'drain'});
function drawing() {
  const paper = adoptPaper(512,384,1);
  const recorder = createCohortRecorder7(paper,[style()],'per-move',1);
  recorder.accept(start());
  recorder.accept(end());
  const result = recorder.finish();
  return {version:7,paper,pageId:'blank',rainbow:0,seedCursor:result.seedCursor,commands:[result.command]};
}
function sentinelArray(length) {
  let visits = 0;
  const values = new Array(length);
  Object.defineProperty(values, 0, {enumerable:true, get() {visits++; throw new Error('LATE_PAYLOAD_VISITED');}});
  return {values, visits:() => visits};
}
function mutant(before, after) {
  const source = readFileSync(new URL('../../experiments/native-architecture/src/drawing/crayonTracker7.ts',import.meta.url),'utf8');
  if (!source.includes(before)) throw new Error('Tracker mutant target missing.');
  const exports = {};
  runInNewContext(ts.transpileModule(source.replace(before,after), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText,{exports});
  return exports.CrayonTracker7;
}
function trackerState(Tracker, points, shipping = false) {
  const texel = 2;
  const tracker = shipping ? new Tracker(50,50,2) : new Tracker(100,100,4,texel);
  for (const p of points) tracker.advance(shipping ? {x:p.x/texel,y:p.y/texel} : p);
  return {
    dirStep:tracker.dirStep * (shipping ? texel : 1),
    proximity:tracker.proximity * (shipping ? texel : 1),
    anchorSpacing:tracker.anchorSpacing * (shipping ? texel : 1),
    excludeArc:tracker.excludeArc * (shipping ? texel : 1),
    anchors:tracker.anchors.map((a) => ({x:a.x*(shipping?texel:1),y:a.y*(shipping?texel:1),arc:a.arc*(shipping?texel:1)})),
  };
}

describe('v7 admission bounds before normalization and replay', () => {
  it('retains 64 empty drains without crediting 64 delivered moves', () => {
    const paper = adoptPaper(512,384,1);
    const recorder = createCohortRecorder7(paper,[style()],'per-move',1);
    recorder.accept(start());
    for (let i=0;i<64;i++) recorder.accept(drain());
    recorder.accept(end());
    const result = recorder.finish();
    expect(result.command.moves).toHaveLength(66);
    expect(result.seedCursor).toBe(2);
    expect(result.command.ops.filter((op) => op.kind === 'crayonFlush')).toHaveLength(1);
  });
  it('admits the exact retained input cap and poisons the next drain before inspecting it', () => {
    const recorder = createCohortRecorder7(adoptPaper(512,384,1),[style()],'per-move',1);
    for (let i=0;i<MAX_RETAINED_INPUTS_7;i++) recorder.accept(drain());
    let visits=0;
    const overflow={get kind(){visits++;return 'drain';}};
    expect(() => recorder.accept(overflow)).toThrow('too many retained inputs');
    expect(visits).toBe(0);
    expect(() => recorder.accept(start())).toThrow('sealed');
    expect(() => recorder.finish()).toThrow();
  },CAP_CONTROL_TIMEOUT_MS);
  it.each([
    ['styles',MAX_CONTACTS_7+1,'contacts'],
    ['moves',MAX_RETAINED_INPUTS_7+1,'inputs'],
    ['ops',MAX_RETAINED_OPS_7+1,'ops'],
  ])('rejects oversized %s before visiting its first payload', (field,length,budget) => {
    const value=drawing();
    const sentinel=sentinelArray(length);
    value.commands[0][field]=sentinel.values;
    expect(() => parseRecordedDrawing7(value)).toThrow(budget);
    expect(sentinel.visits()).toBe(0);
  });
  it('rejects aggregate sample geometry before touching the late sample array', () => {
    const value=drawing();
    const sentinel=sentinelArray(MAX_GEOMETRY_7);
    value.commands[0].moves.splice(1,0,{kind:'move',contact:0,samples:sentinel.values});
    expect(() => parseRecordedDrawing7(value)).toThrow('geometry');
    expect(sentinel.visits()).toBe(0);
  });
  it('rejects a live sample batch larger than the remaining geometry budget before cloning', () => {
    const recorder=createCohortRecorder7(adoptPaper(512,384,1),[style()],'per-move',1);
    recorder.accept(start());
    const sentinel=sentinelArray(MAX_GEOMETRY_7-1);
    expect(() => recorder.accept({kind:'move',contact:0,samples:sentinel.values})).toThrow('move group');
    expect(sentinel.visits()).toBe(0);
    expect(() => recorder.finish()).toThrow();
  });
  it('rejects one oversized declared path before visiting any segment', () => {
    const value=drawing();
    const sentinel=sentinelArray(MAX_GEOMETRY_7);
    value.commands[0].ops=[{kind:'crayonPath',contact:0,seed:1,start:{x:100,y:100},segments:sentinel.values}];
    expect(() => parseRecordedDrawing7(value)).toThrow('geometry');
    expect(sentinel.visits()).toBe(0);
  });
  it('shares the geometry budget across commands before normalization', () => {
    const value=drawing();
    const first=value.commands[0];
    const second=drawing().commands[0];
    second.firstSeed=2;value.seedCursor=3;
    const sentinel=sentinelArray(MAX_GEOMETRY_7-2);
    second.ops=[{kind:'crayonPath',contact:0,seed:2,start:{x:100,y:100},segments:sentinel.values}];
    value.commands=[first,second];
    expect(() => parseRecordedDrawing7(value)).toThrow('geometry');
    expect(sentinel.visits()).toBe(0);
  });
  it('bounds bytes before replay or late point fields', () => {
    const value=drawing();
    let lateVisits=0;
    Object.defineProperty(value.commands[0].moves[0].samples[0],'x',{
      enumerable:true,get(){lateVisits++;throw new Error('LATE_POINT_VISITED');},
    });
    value.pageId='x'.repeat(MAX_SAVED_BYTES_7);
    expect(() => parseRecordedDrawing7(value)).toThrow('byte budget');
    expect(lateVisits).toBe(0);
  },CAP_CONTROL_TIMEOUT_MS);
  it('counts canonical JSON bytes including escapes and Unicode without allocating JSON output', () => {
    const value=drawing();
    value.pageId='é😀\n\t\u0001\ud800"\\';
    expect(admitRecordedBounds7(value)).toBe(new TextEncoder().encode(JSON.stringify(value)).byteLength);
  });
  it('admits a complete cohort at the exact retained input cap', () => {
    const recorder=createCohortRecorder7(adoptPaper(512,384,1),[style()],'per-move',1);
    recorder.accept(start());
    for(let i=0;i<MAX_RETAINED_INPUTS_7-2;i++) recorder.accept(drain());
    recorder.accept(end());
    const result=recorder.finish();
    expect(result.command.moves).toHaveLength(MAX_RETAINED_INPUTS_7);
    expect(result.seedCursor).toBe(2);
  },CAP_CONTROL_TIMEOUT_MS);
  it('does not invoke untrusted array map, iterator or toJSON methods', () => {
    const value=drawing();
    let calls=0;
    value.commands.map=()=>{calls++;throw new Error('UNTRUSTED_MAP');};
    value.commands[Symbol.iterator]=()=>{calls++;throw new Error('UNTRUSTED_ITERATOR');};
    Object.defineProperty(value.commands,'toJSON',{value(){calls++;throw new Error('UNTRUSTED_TOJSON');}});
    expect(parseRecordedDrawing7(value).version).toBe(7);
    expect(calls).toBe(0);
  });
  it('refuses accessors and sparse input arrays before accessing their entries', () => {
    const value=drawing();
    const sentinel=sentinelArray(2);
    value.commands[0].moves=sentinel.values;
    expect(() => parseRecordedDrawing7(value)).toThrow('data entries');
    expect(sentinel.visits()).toBe(0);
    value.commands[0].moves=new Array(2);
    expect(() => parseRecordedDrawing7(value)).toThrow('data entries');
  });
  it.each([1,2])('retains actual shipping floor and anchor state at backing scale %s', (backing) => {
    const paper=adoptPaper(512,384,backing);
    const texel=textureScale(paper);
    const width=2/paperScale(paper);
    const Shipping=shippingTracker7();
    const shipping=new Shipping(100/texel,100/texel,width/texel);
    const current=new CrayonTracker7(100,100,width,texel);
    expect([current.dirStep,current.proximity,current.anchorSpacing,current.excludeArc]).toEqual(
      [shipping.dirStep,shipping.proximity,shipping.anchorSpacing,shipping.excludeArc].map((n)=>n*texel));
  });
  it.each([
    ['MIN_DIR_STEP_PX * texel','0'],
    ['MIN_PROXIMITY_PX * texel','0'],
    ['MIN_ANCHOR_SPACING_PX * texel','0'],
    ['MIN_EXCLUDE_ARC_DIR_STEPS = 3','MIN_EXCLUDE_ARC_DIR_STEPS = 0'],
  ])('detects tracker floor/exclusion mutation %s', (before,after) => {
    expect(trackerState(mutant(before,after),[])).not.toEqual(trackerState(shippingTracker7(),[],true));
  });
  it.each([
    ['this.anchors[this.anchors.length - 1]','{x:this.lastX,y:this.lastY,arc:this.arc}'],
    ['this.anchors.push({ x: p.x, y: p.y, arc: this.arc });','this.anchors = [{ x: p.x, y: p.y, arc: this.arc }];'],
  ])('detects loss of global last-anchor spacing/history %s', (before,after) => {
    const points=Array.from({length:8},(_,i)=>({x:101+i,y:100}));
    expect(trackerState(CrayonTracker7,points)).toEqual(trackerState(shippingTracker7(),points,true));
    expect(trackerState(mutant(before,after),points)).not.toEqual(trackerState(shippingTracker7(),points,true));
  });
});
