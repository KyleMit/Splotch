import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const INPUTS = new URL('./fixtures/shipping-crayon7/', import.meta.url);
const OWNERS = {
  'shipping-crayonPassTracker.ts':
    '89d8ae2f51f6fb2fcc99f7d17c53bc3f663a332eb4674e1513ef92a97e511e02',
  'shipping-crayonPassBoundaries.ts':
    '6eaff19f97f97f21a93b6e1634fdd62bf72a7ba844ee8bc6e6c533236a1305b9',
  'shipping-strokeRasterQueue.ts':
    '3682c746e66e3b1d3615756b7b1b1f47f2e7c9e31388c90d548fb514d5f1a367',
  'shipping-engine.ts': '2aa9457e9a165556d8e7a790aa733b5dc97559fdadfec3dae7e17f6928a7518c',
};
function owner(name) {
  const source = readFileSync(new URL(`${name}.txt`, INPUTS), 'utf8');
  if (createHash('sha256').update(source).digest('hex') !== OWNERS[name])
    throw new Error(`Shipping owner changed: ${name}`);
  return source;
}
function evaluate(source, modules = {}) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require(name) {
        if (!Object.hasOwn(modules, name)) throw new Error(`Unexpected shipping import: ${name}`);
        return modules[name];
      },
    }
  );
  return exports;
}
export function shippingTracker7() {
  return evaluate(owner('shipping-crayonPassTracker.ts')).CrayonPassTracker;
}
function section(source, before, after) {
  const start = source.indexOf(before);
  const end = source.indexOf(after, start + before.length);
  if (start < 0 || end < 0) throw new Error('Shipping function boundary missing.');
  return source.slice(start, end);
}
export function shippingRecorderOracle7(styles, granularity, events, texel, scale) {
  const tracker = evaluate(owner('shipping-crayonPassTracker.ts'));
  const boundaries = evaluate(owner('shipping-crayonPassBoundaries.ts'), {
    './crayonPassTracker': tracker,
  });
  const queue = evaluate(owner('shipping-strokeRasterQueue.ts'), {
    './perf': { PERF_MARKS: false },
  });
  const engine = owner('shipping-engine.ts');
  const functions = [
    section(engine, 'function renderStrokeStart(', '// One quadratic segment'),
    section(engine, 'function strokeSmoothSegments(', 'export interface HarnessStrokeReplay'),
    section(engine, 'function stopDrawing(', 'function finishPenCanvasExit('),
  ].join('\n');
  const factory = evaluate(`
    export function create(deps) {
      const { createCrayonPassBoundaries, createStrokeRasterQueue } = deps;
      const activePointers = new Map();
      const ops = [];
      const renderTiledOp = () => {};
      const recordTiledOp = (op) => ops.push(op);
      const crayonPasses = createCrayonPassBoundaries({renderOp: renderTiledOp, recordOp: recordTiledOp});
      const beginStrokeGroup = () => {};
      const callbacks = {};
      const strokeStyleOf = (ps) => ({ crayon: ps.crayon, erase: ps.erase, magic: ps.magic, seed: ps.seed });
      const releaseCaptureSafe = () => {};
      const commitEdgeSwipe = () => { throw new Error('Edge admission is outside this fixture'); };
      const idleEmptyScan = {schedule() {}};
      const finishGroupWhenCanvasIdle = () => {};
      ${functions}
      const rasterQueue = createStrokeRasterQueue({
        activePointers, crayonOpGranularity: deps.granularity,
        paperMinEdge: () => 768,
        pointerWasResumed: () => false, restartStrokeIfResumed: () => {},
        strokeSpeed: () => 0, strokeSegments, onFlushed: () => {},
      });
      return {
        start(id, at, width, crayon, erase, magic) {
          const pass = crayonPasses.openStroke({crayon, at, lineWidth: width});
          const ps = {id, x:at.x, y:at.y, midX:at.x, midY:at.y,
            lineWidth:width, crayon, erase, magic, pendingRaster:[], lastTime:0, ...pass};
          activePointers.set(id, ps); renderStrokeStart(ps);
        },
        move(id, points) {activePointers.get(id).pendingRaster.push({points, at:1});},
        drain() {rasterQueue.flushAll();},
        end(id) {stopDrawing({pointerId:id, type:'pointerup'});},
        ops,
      };
    }`).create;
  const reference = factory({ ...boundaries, ...queue, granularity });
  const convert = (p) => ({ x: p.x / texel, y: p.y / texel });
  for (const event of events) {
    if (event.kind === 'drain') reference.drain();
    else if (event.kind === 'start') {
      const style = styles[event.contact];
      reference.start(
        event.contact,
        convert(event.samples[0]),
        style.width / scale / texel,
        style.brush === 'crayon',
        style.brush === 'eraser',
        style.brush === 'magic'
      );
    } else if (event.kind === 'move') reference.move(event.contact, event.samples.map(convert));
    else reference.end(event.contact);
  }
  let latestContact = 0;
  const starts = events.filter((event) => event.kind === 'start');
  let nextStart = 0;
  return reference.ops.map((op) => {
    if (op.kind === 'crayonFlush') return { kind: 'crayonFlush' };
    if (op.kind === 'dot') {
      latestContact = starts[nextStart++].contact;
      const base = {
        kind: op.crayon ? 'crayonDot' : 'dot',
        contact: latestContact,
        at: { x: op.x * texel, y: op.y * texel },
      };
      return op.crayon ? { ...base, seed: op.seed } : base;
    }
    const base = {
      kind: op.crayon ? 'crayonPath' : 'path',
      contact: op.pid,
      start: { x: op.startX * texel, y: op.startY * texel },
      segments: op.segs.map((s) => ({
        cx: s.cx * texel,
        cy: s.cy * texel,
        x: s.x * texel,
        y: s.y * texel,
      })),
    };
    return op.crayon ? { ...base, seed: op.seed } : base;
  });
}
