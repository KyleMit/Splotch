import { beforeAll, describe, expect, it, vi } from 'vitest';
import { legacyDrawing, LEGACY_PAPER } from './native-paper-fixtures.mjs';
import { paintStroke } from '../../experiments/native-architecture/src/drawing/skiaInkPainter.ts';
import { paperProjection } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { createCrayonTileResources } from '../../experiments/native-architecture/src/drawing/crayonTiles.ts';
import { createContactCohort } from '../../experiments/native-architecture/src/drawing/contactCohort.ts';
import { crayonPasses } from '../../experiments/native-architecture/src/drawing/crayon.ts';
import {
  addStrokes,
  createHistory,
} from '../../experiments/native-architecture/src/drawing/model.ts';

// Awaited so this import settles before the static imports start: a concurrent import can take
// Vitest's pending-mock queue, and a slow mock resolve then lets the painter load real Skia.
const runtime = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module');
  return { skia: null, require: createRequire(import.meta.url) };
});

// Skia's own web API over CanvasKit stands in for its native module, which Node cannot load.
vi.mock('@shopify/react-native-skia', () => ({
  ...runtime.require('@shopify/react-native-skia/lib/commonjs/skia/types'),
  get Skia() {
    return runtime.skia;
  },
}));

let skia;
beforeAll(async () => {
  const CanvasKitInit = runtime.require('canvaskit-wasm');
  const { JsiSkApi } = runtime.require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia');
  runtime.skia = skia = JsiSkApi(await CanvasKitInit());
});

// The legacy paper at a quarter scale: every stroke's geometry and texture, few pixels to compare.
const PAPER_SCALE = 0.25;
const SURFACE = { width: 1024 * PAPER_SCALE, height: 768 * PAPER_SCALE };
const SAMPLES_PER_PACKET = 7;

function pixels(strokes) {
  const surface = skia.Surface.Make(SURFACE.width, SURFACE.height);
  const canvas = surface.getCanvas();
  canvas.scale(PAPER_SCALE, PAPER_SCALE);
  const context = {
    paper: LEGACY_PAPER,
    projection: paperProjection(LEGACY_PAPER),
    theme: 'light',
    pageId: 'blank',
    tiles: createCrayonTileResources()(strokes, 'light'),
    bookFill: null,
  };
  for (const stroke of strokes) paintStroke(canvas, stroke, context);
  surface.flush();
  return surface.makeImageSnapshot().readPixels(0, 0, {
    ...SURFACE,
    colorType: 4,
    alphaType: 2,
  });
}

// The cohort's append before contacts owned their buffers: a fresh copy of the stroke per kept
// sample, every sample an endpoint (contactResponder), so only an exact repeat is dropped.
function copyingCohort() {
  const active = new Map();
  let strokes = [];
  return {
    start(identifier, stroke) {
      active.set(identifier, strokes.length);
      strokes = [...strokes, stroke];
    },
    sample(identifier, point) {
      const index = active.get(identifier);
      const stroke = strokes[index];
      const last = stroke.points.at(-1);
      if (last.x === point.x && last.y === point.y) return;
      strokes = strokes.map((item, position) =>
        position === index ? { ...stroke, points: [...stroke.points, point] } : item
      );
    },
    finish(identifier) {
      active.delete(identifier);
      if (active.size > 0) return null;
      const completed = strokes;
      strokes = [];
      return completed;
    },
    drafts: () => strokes,
  };
}

// A looping scribble with exact repeats and sub-pixel moves, as a digitizer reports them.
function scribble(cx, cy, count, phase) {
  return Array.from({ length: count }, (_, index) => {
    const step = index % 11 === 4 ? index - 1 : index;
    const angle = phase + step * 0.21;
    const radius = 60 + 50 * Math.sin(step * 0.07);
    const jitter = index % 5 === 2 ? 0.3 : 0;
    return {
      x: Math.round((cx + radius * Math.cos(angle) + jitter) * 100) / 100,
      y: Math.round((cy + radius * Math.sin(angle * 1.3)) * 100) / 100,
    };
  });
}

// Two contacts at once, then a later one: Pen and Crayon overlapping, then Magic and the Eraser.
const CONTACTS = [
  { id: 'pen', brush: 'pen', color: 'Purple', from: 0, points: scribble(300, 300, 210, 0) },
  { id: 'crayon', brush: 'crayon', color: 'Red', from: 40, points: scribble(380, 330, 150, 1) },
];
const LATER = [
  { id: 'magic', brush: 'magic', color: 'Green', from: 0, points: scribble(600, 400, 90, 2) },
  { id: 'eraser', brush: 'eraser', color: 'Green', from: 10, points: scribble(330, 310, 60, 3) },
];

// Drives both cohorts sample by sample and publishes after every packet, as paperInputOwner does.
function drive(cohort, copying, contacts, drawing, onPacket) {
  const length = Math.max(...contacts.map((contact) => contact.from + contact.points.length));
  let completed = null;
  let copied = null;
  for (let tick = 0; tick < length; tick++) {
    for (const contact of contacts) {
      const index = tick - contact.from;
      const point = contact.points[index];
      if (index === 0) {
        cohort.start(contact.id, contact.color, contact.brush, point, drawing);
        const started = cohort.drafts().at(-1);
        copying.start(contact.id, { ...started, points: [point] });
      } else if (point) {
        cohort.sample(contact.id, point, true);
        copying.sample(contact.id, point);
      }
      if (index === contact.points.length - 1) {
        completed = cohort.finish(contact.id) ?? completed;
        copied = copying.finish(contact.id) ?? copied;
      }
    }
    if (tick % SAMPLES_PER_PACKET === SAMPLES_PER_PACKET - 1 || tick === length - 1)
      onPacket(cohort.drafts(), copying.drafts());
  }
  return { completed, copied };
}

describe('a live stroke appended in place', () => {
  // The old path is the oracle: the same samples through a copy per sample. The appended path is
  // painted when each packet publishes, as the ink view records it, so crayon pass segmentation
  // resumes across packets; the copies are painted afterwards. Negative control: the oracle with
  // one sample missing paints different pixels, so the comparison sees a single sample.
  it('paints every packet and commits every stroke the copying path did', () => {
    const cohort = createContactCohort();
    const copying = copyingCohort();
    const appended = [];
    const copies = [];
    const published = [];
    const { completed, copied } = drive(
      cohort,
      copying,
      CONTACTS,
      legacyDrawing(),
      (drafts, copy) => {
        published.push(drafts);
        expect(JSON.stringify(drafts)).toBe(JSON.stringify(copy));
        appended.push(pixels(drafts));
        copies.push(copy);
      }
    );
    expect(appended).toHaveLength(30);
    // Every packet that kept a sample publishes a new list with a new Stroke in it; the last one
    // publishes the drained, empty list.
    expect(published.at(-1)).toEqual([]);
    const unchanged = published.slice(1, -1).filter((drafts, index) => {
      const previous = published[index];
      return drafts === previous || drafts.every((stroke, at) => stroke === previous[at]);
    });
    expect(unchanged).toEqual([]);
    for (const [index, copy] of copies.entries())
      expect(Buffer.compare(appended[index], pixels(copy))).toBe(0);

    expect(completed).toHaveLength(2);
    expect(JSON.stringify(completed)).toBe(JSON.stringify(copied));
    const history = addStrokes(createHistory(legacyDrawing()), completed);
    const committed = pixels(history.drawing.strokes);
    expect(Buffer.compare(committed, pixels(copied))).toBe(0);

    const [pen, crayon] = copied;
    const missing = { ...pen, points: pen.points.filter((_, index) => index !== 100) };
    expect(Buffer.compare(committed, pixels([missing, crayon]))).not.toBe(0);
  });

  it('never writes a stroke again once its contact ends', () => {
    const cohort = createContactCohort();
    const { completed } = drive(cohort, copyingCohort(), CONTACTS, legacyDrawing(), () => {});
    const snapshot = JSON.stringify(completed);
    const lengths = completed.map((stroke) => stroke.points.length);
    const later = drive(cohort, copyingCohort(), LATER, legacyDrawing(), () => {}).completed;
    expect(later).toHaveLength(2);
    expect(JSON.stringify(completed)).toBe(snapshot);
    expect(completed.map((stroke) => stroke.points.length)).toEqual(lengths);
    for (const stroke of later)
      expect(completed.some((earlier) => earlier.points === stroke.points)).toBe(false);
  });

  // A contact that lifts while another is down keeps its stroke in the drafts; the other's samples
  // must not reach it.
  it('leaves a lifted contact’s stroke alone while another contact draws', () => {
    const cohort = createContactCohort();
    const drawing = legacyDrawing();
    const points = scribble(200, 200, 20, 0);
    const first = points.filter((_, index) => index % 2 === 0);
    const second = points.filter((_, index) => index % 2 === 1);
    cohort.start('a', 'Red', 'pen', first[0], drawing);
    cohort.start('b', 'Blue', 'pen', second[0], drawing);
    for (const point of first.slice(1)) cohort.sample('a', point, true);
    expect(cohort.finish('a')).toBeNull();
    const lifted = cohort.drafts()[0];
    const kept = JSON.stringify(lifted);
    for (const point of second.slice(1)) cohort.sample('b', point, true);
    cohort.sample('a', { x: 1, y: 1 }, true);
    const drawn = cohort.drafts();
    expect(drawn[0]).toBe(lifted);
    expect(JSON.stringify(lifted)).toBe(kept);
    expect(cohort.finish('b')).toBe(drawn);
  });
});

describe('crayon pass segmentation across a growing stroke', () => {
  const crayon = (points) => ({ brush: 'crayon', color: 'Red', width: 34, seed: 5, points });
  const fresh = (stroke) => crayonPasses({ ...stroke, points: [...stroke.points] }, 34);

  // Negative control: rescanning the whole stroke on every call makes the per-call hypot count
  // grow with the stroke instead of staying flat.
  it('reads only the samples appended since the last call', () => {
    const points = scribble(400, 400, 600, 0.5);
    const buffer = [points[0]];
    const stroke = crayon(buffer);
    const hypot = vi.spyOn(Math, 'hypot');
    const results = [];
    const work = [];
    for (const point of points.slice(1)) {
      buffer.push(point);
      const before = hypot.mock.calls.length;
      results.push(crayonPasses(stroke, 34));
      work.push(hypot.mock.calls.length - before);
    }
    hypot.mockRestore();
    for (const [index, passes] of results.entries())
      expect(passes).toEqual(crayonPasses(crayon(points.slice(0, index + 2)), 34));
    expect(results.at(-1).length).toBeGreaterThan(3);
    expect(Math.max(...work)).toBeLessThan(40);
  });

  it('rescans a buffer whose scanned samples changed, and a different stroke over the same points', () => {
    const points = scribble(400, 400, 120, 0.5);
    const buffer = points.slice(0, 80);
    const stroke = crayon(buffer);
    crayonPasses(stroke, 34);
    buffer[79] = { x: 10, y: 10 };
    expect(crayonPasses(stroke, 34)).toEqual(fresh(stroke));
    buffer.length = 40;
    expect(crayonPasses(stroke, 34)).toEqual(fresh(stroke));
    const reseeded = { ...stroke, seed: 9 };
    expect(crayonPasses(reseeded, 34)).toEqual(fresh(reseeded));
    expect(crayonPasses(stroke, 22)).toEqual(crayonPasses({ ...stroke, points: [...buffer] }, 22));
    expect(crayonPasses(stroke, 34, 2)).toEqual(
      crayonPasses({ ...stroke, points: [...buffer] }, 34, 2)
    );
  });
});
