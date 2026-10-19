import { beforeAll, describe, expect, it, vi } from 'vitest';
import { appendSmoothSegments } from '../../web/src/lib/drawing/strokeMath.ts';
import { createContactCohort } from '../../experiments/native-architecture/src/drawing/contactCohort.ts';
import {
  addStrokes,
  createHistory,
  emptyDrawing,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import {
  adoptPaper,
  LEGACY_PAPER,
  paperProjection,
  paperProjectionView,
  semanticWidth,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { legacyDrawing } from './native-paper-fixtures.mjs';
import { paintAppearance } from '../../experiments/native-architecture/src/drawing/palette.ts';
import { CRAYON_COLOR_MIX } from '../../experiments/native-architecture/src/drawing/crayon.ts';
import { orderedOps } from '../../experiments/native-architecture/src/drawing/inkOps.ts';

// The incremental live-ink contract (ADR-0178): live ink painted frame by frame, the committed
// layer the cohort leaves, a replay of the saved drawing, and a capture of it are the same pixels.
// Skia's own web API over CanvasKit stands in for its native module, as in the painter tests.

// Awaited so this import settles before the static imports start: a concurrent import can take
// Vitest's pending-mock queue, and a slow mock resolve then lets the painter load real Skia.
const runtime = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module');
  return { skia: null, require: createRequire(import.meta.url) };
});

vi.mock('@shopify/react-native-skia', () => ({
  ...runtime.require('@shopify/react-native-skia/lib/commonjs/skia/types'),
  get Skia() {
    return runtime.skia;
  },
}));

const { PaintStyle, StrokeCap, StrokeJoin } = await import('@shopify/react-native-skia');
const { createInkScene } =
  await import('../../experiments/native-architecture/src/drawing/skiaInkScene.ts');
const { createInkLayer } =
  await import('../../experiments/native-architecture/src/drawing/skiaInkLayer.ts');

let skia;
beforeAll(async () => {
  const CanvasKitInit = runtime.require('canvaskit-wasm');
  const { JsiSkApi } = runtime.require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia');
  runtime.skia = skia = JsiSkApi(await CanvasKitInit());
});

const PLANE = { width: 320, height: 240 };
const PAPER = adoptPaper(PLANE.width, PLANE.height, 1);
const PROJECTION = paperProjection(PAPER);

function context({ theme = 'light', pageId = 'blank' } = {}) {
  return {
    paper: PAPER,
    projection: PROJECTION,
    theme,
    pageId,
    tiles: { byKey: new Map(), uris: [] },
    bookFill: null,
  };
}

function sceneInput(strokes, ink = context(), plane = PLANE) {
  return { strokes, size: plane, pixels: plane, key: ink.theme, context: ink };
}

function pixelsOf(image) {
  const read = { width: image.width(), height: image.height(), colorType: 4, alphaType: 2 };
  const pixels = image.readPixels(0, 0, read);
  image.dispose();
  return pixels;
}

function differing(a, b) {
  let count = 0;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) count += 1;
  return count;
}

// A cohort drawn the way the ink view draws one: samples arrive, and once per display frame the
// scene flushes them into ops, paints them and presents a picture. `script` lists each frame's
// events; a contact's last frame ends it, which first paints everything sampled (the responder's
// settle). `onFrame` may change the session's history, appearance or plane between frames, as
// Undo, a theme change or a resize would. `paper` is the reference a contact commits with.
// Returns the session the cohort left.
function drawCohort({
  scene,
  history,
  script,
  ink = context(),
  plane = PLANE,
  paper = PAPER,
  onFrame = () => {},
}) {
  const cohort = createContactCohort();
  const session = { history, ink, plane };
  const commit = (completed) => {
    if (!completed) return;
    session.history = addStrokes(session.history, completed, paper);
    scene.sync(
      sceneInput(session.history.drawing.strokes, session.ink, session.plane),
      cohort.live()
    );
  };
  scene.sync(sceneInput(history.drawing.strokes, ink, plane), cohort.live());
  for (const [index, events] of script.entries()) {
    for (const event of events) {
      if (event.start)
        cohort.start(
          event.start,
          event.color ?? 'Blue',
          event.brush ?? 'pen',
          event.at,
          session.history.drawing,
          event.width ?? 'medium',
          () => paper
        );
      else if (event.sample) cohort.sample(event.sample, event.at);
      else if (event.end) {
        scene.flush(cohort);
        commit(cohort.finish(event.end));
      } else if (event.interrupt) {
        scene.flush(cohort);
        commit(cohort.interrupt());
      }
    }
    scene.flush(cohort);
    scene.present(() => {});
    onFrame(index, cohort, session);
  }
  return { cohort, ...session };
}

function line(from, to, steps) {
  return Array.from({ length: steps + 1 }, (_, index) => ({
    x: Math.round((from.x + ((to.x - from.x) * index) / steps) * 100) / 100,
    y: Math.round((from.y + ((to.y - from.y) * index) / steps) * 100) / 100,
  }));
}

// One contact drawn along `points`, `perFrame` samples to a frame.
function stroke(id, points, perFrame, style = {}) {
  const frames = [];
  for (let index = 0; index < points.length; index += perFrame) {
    const events = points
      .slice(index, index + perFrame)
      .map((at, offset) =>
        index + offset === 0 ? { start: id, at, ...style } : { sample: id, at }
      );
    frames.push(events);
  }
  frames.at(-1).push({ end: id });
  return frames;
}

function merge(...scripts) {
  const length = Math.max(...scripts.map((script) => script.length));
  return Array.from({ length }, (_, index) => scripts.flatMap((script) => script[index] ?? []));
}

function rebuilt(strokes, ink = context(), live = [], plane = PLANE) {
  const scene = createInkScene();
  scene.sync(sceneInput(strokes, ink, plane), live);
  const pixels = pixelsOf(scene.snapshot());
  scene.dispose();
  return pixels;
}

function decodePng(base64) {
  const image = skia.Image.MakeImageFromEncoded(skia.Data.fromBase64(base64));
  return pixelsOf(image);
}

function pixelAt(pixels, x, y) {
  const offset = (Math.round(y) * PLANE.width + Math.round(x)) * 4;
  return [...pixels.slice(offset, offset + 4)];
}

// A paper point's device pixel on the plane.
function device(point, projection = PROJECTION) {
  const view = paperProjectionView(projection, PLANE);
  return { x: view.left + point.x * view.scale, y: view.top + point.y * view.scale };
}

const across = line({ x: 100, y: 384 }, { x: 924, y: 384 }, 40);
const down = line({ x: 512, y: 100 }, { x: 512, y: 668 }, 30);

function expectIdentity({
  script,
  ink = context(),
  history = createHistory(emptyDrawing()),
  paper = PAPER,
}) {
  const scene = createInkScene();
  const midCohort = [];
  const drawn = drawCohort({
    scene,
    history,
    script,
    ink,
    paper,
    onFrame(index, cohort, session) {
      if (index % 7 !== 3 || cohort.live().length === 0) return;
      const live = pixelsOf(scene.snapshot());
      midCohort.push(differing(live, rebuilt(session.history.drawing.strokes, ink, cohort.live())));
    },
  });
  const committed = drawn.history.drawing.strokes;
  const live = pixelsOf(scene.snapshot());
  const replay = rebuilt(committed, ink);
  const captured = decodePng(scene.capture(ink.projection, PLANE));
  scene.dispose();
  return { live, replay, captured, midCohort, committed };
}

describe('native incremental ink', () => {
  it('paints two crossing pen contacts identically live, committed, replayed and captured', () => {
    const script = merge(
      stroke('a', across, 2, { color: 'Blue' }),
      stroke('b', down, 1, { color: 'Red' })
    );
    const { live, replay, captured, midCohort, committed } = expectIdentity({ script });
    expect(committed).toHaveLength(2);
    expect(committed.every((item) => item.ops.length > 2)).toBe(true);
    expect(midCohort.length).toBeGreaterThan(1);
    expect(midCohort).toEqual(midCohort.map(() => 0));
    expect(differing(live, replay)).toBe(0);
    expect(differing(live, captured)).toBe(0);
    expect(live.some((value) => value !== 0)).toBe(true);
  });

  // Negative control: painting the same committed strokes one whole stroke after another puts the
  // first contact's colour beneath the second's at the crossing.
  it('replays simultaneous contacts in the order they were drawn, not stroke order', () => {
    // Blue starts first but reaches the crossing after Red has passed it.
    const script = merge(
      stroke('a', across, 1, { color: 'Blue' }),
      stroke('b', down, 4, { color: 'Red' })
    );
    const { replay, committed } = expectIdentity({ script });
    const crossing = device({ x: 512, y: 384 });
    const blue = paintAppearance('Blue', 'light').hex;
    const hex = (pixel) =>
      '#' +
      pixel
        .slice(0, 3)
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('');
    expect(hex(pixelAt(replay, crossing.x, crossing.y))).toBe(blue.toLowerCase());
    const layer = createInkLayer(PLANE, PLANE, context());
    layer.paint(committed.flatMap((item) => item.ops.map((_, op) => ({ stroke: item, op }))));
    const strokeOrder = pixelsOf(layer.snapshot());
    layer.dispose();
    expect(hex(pixelAt(strokeOrder, crossing.x, crossing.y))).not.toBe(blue.toLowerCase());
    expect(orderedOps(committed).map(({ stroke: item }) => committed.indexOf(item))).not.toEqual(
      committed.flatMap((item, index) => item.ops.map(() => index))
    );
  });

  // Negative control: committing a version-5 picture's strokes without their ops replays the
  // cohort whole, in stroke order, so the crossing turns Red as the contacts lift.
  it('keeps the crossings of a version-5 picture as they were drawn once it commits', () => {
    const ink = { ...context(), paper: LEGACY_PAPER, projection: paperProjection(LEGACY_PAPER) };
    const script = merge(
      stroke('a', across, 1, { color: 'Blue' }),
      stroke('b', down, 4, { color: 'Red' })
    );
    const { live, replay, captured, midCohort, committed } = expectIdentity({
      script,
      ink,
      history: createHistory(legacyDrawing()),
      paper: LEGACY_PAPER,
    });
    expect(committed.every((item) => item.ops.length > 2)).toBe(true);
    expect(midCohort).toEqual(midCohort.map(() => 0));
    expect(differing(live, replay)).toBe(0);
    expect(differing(live, captured)).toBe(0);
    const crossing = device({ x: 512, y: 384 }, ink.projection);
    const [r, g, b] = pixelAt(live, crossing.x, crossing.y);
    expect(paintAppearance('Blue', 'light').hex.toLowerCase()).toBe(
      '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
    );
  });

  it('records one dot then one path op per painted frame, each continuing from the pen', () => {
    const script = stroke('a', across, 3, { color: 'Green' });
    const { live, committed } = expectIdentity({ script });
    const [pen] = committed;
    expect(pen.ops[0][0]).toBe(1);
    expect(pen.ops.length).toBe(Math.ceil(across.length / 3) + 1);
    // Shipping's op construction (engine.ts renderStrokeStart + strokeSmoothSegments): a dot at
    // the first point, then per frame a path from the pen's midpoint through the frame's points.
    const width = semanticWidth(pen.width, PAPER);
    const surface = skia.Surface.Make(PLANE.width, PLANE.height);
    const canvas = surface.getCanvas();
    const view = paperProjectionView(PROJECTION, PLANE);
    canvas.translate(view.left, view.top);
    canvas.scale(view.scale, view.scale);
    const paint = skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(skia.Color(paintAppearance('Green', 'light').hex));
    canvas.drawCircle(pen.points[0].x, pen.points[0].y, width / 2, paint);
    const stroked = paint.copy();
    stroked.setStyle(PaintStyle.Stroke);
    stroked.setStrokeWidth(width);
    stroked.setStrokeCap(StrokeCap.Round);
    stroked.setStrokeJoin(StrokeJoin.Round);
    const ps = {
      x: pen.points[0].x,
      y: pen.points[0].y,
      midX: pen.points[0].x,
      midY: pen.points[0].y,
    };
    let from = 1;
    for (const [end] of pen.ops.slice(1)) {
      const segs = [];
      const startX = ps.midX;
      const startY = ps.midY;
      appendSmoothSegments(ps, pen.points.slice(from, end), segs);
      const builder = skia.PathBuilder.Make().moveTo(startX, startY);
      for (const s of segs) builder.quadTo(s.cx, s.cy, s.x, s.y);
      canvas.drawPath(builder.detach(), stroked);
      from = end;
    }
    const shipping = pixelsOf(surface.makeImageSnapshot());
    expect(differing(live, shipping)).toBe(0);
  });

  it('erases committed ink beneath a live eraser and replays the same hole', () => {
    const first = drawCohort({
      scene: createInkScene(),
      history: createHistory(emptyDrawing()),
      script: stroke('a', across, 2, { color: 'Purple' }),
    });
    const erasing = stroke('e', down, 2, { brush: 'eraser' });
    const { live, replay, captured, midCohort } = expectIdentity({
      script: erasing,
      history: first.history,
    });
    expect(midCohort).toEqual(midCohort.map(() => 0));
    expect(differing(live, replay)).toBe(0);
    expect(differing(live, captured)).toBe(0);
    const crossing = device({ x: 512, y: 384 });
    const aside = device({ x: 300, y: 384 });
    expect(pixelAt(live, crossing.x, crossing.y)[3]).toBe(0);
    expect(pixelAt(live, aside.x, aside.y)[3]).toBe(255);
  });

  it('glazes a scribbling crayon over ink as one group per pass, live and replayed alike', () => {
    const backdrop = drawCohort({
      scene: createInkScene(),
      history: createHistory(emptyDrawing()),
      script: stroke('a', line({ x: 200, y: 300 }, { x: 824, y: 300 }, 30), 2, {
        color: 'Yellow',
        width: 'extraThick',
      }),
    });
    // Back and forth over the yellow: each reversal opens a new pass.
    const scribble = [
      ...line({ x: 260, y: 300 }, { x: 760, y: 320 }, 25),
      ...line({ x: 760, y: 320 }, { x: 280, y: 290 }, 25).slice(1),
      ...line({ x: 280, y: 290 }, { x: 740, y: 310 }, 25).slice(1),
    ];
    const { live, replay, captured, midCohort, committed } = expectIdentity({
      script: stroke('c', scribble, 2, { brush: 'crayon', color: 'Blue', width: 'extraThick' }),
      history: backdrop.history,
    });
    expect(committed.at(-1).brush).toBe('crayon');
    expect(midCohort.length).toBeGreaterThan(2);
    expect(midCohort).toEqual(midCohort.map(() => 0));
    expect(differing(live, replay)).toBe(0);
    expect(differing(live, captured)).toBe(0);
    // ADR-0065's glaze over the yellow: (1 - m)·S + m·min(S, D) on a fully covered texel.
    const blue = paintAppearance('Blue', 'light').hex;
    const yellow = paintAppearance('Yellow', 'light').hex;
    const rgb = (hex) =>
      [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
    const mixed = rgb(blue).map(
      (s, index) => (1 - CRAYON_COLOR_MIX) * s + CRAYON_COLOR_MIX * Math.min(s, rgb(yellow)[index])
    );
    let glazed = 0;
    for (let offset = 0; offset < live.length; offset += 4) {
      if (live[offset + 3] !== 255) continue;
      if ([0, 1, 2].every((channel) => Math.abs(live[offset + channel] - mixed[channel]) <= 1))
        glazed += 1;
    }
    expect(glazed).toBeGreaterThan(50);
  });

  it('shares one glaze group between simultaneous crayon contacts, live and replayed alike', () => {
    const script = merge(
      stroke('a', across, 2, { brush: 'crayon', color: 'Red', width: 'extraThick' }),
      stroke('b', down, 1, { brush: 'crayon', color: 'Green', width: 'extraThick' })
    );
    const { live, replay, captured, midCohort } = expectIdentity({ script });
    expect(midCohort).toEqual(midCohort.map(() => 0));
    expect(differing(live, replay)).toBe(0);
    expect(differing(live, captured)).toBe(0);
  });

  it('reveals a coloring page with Magic identically live and replayed', () => {
    const ink = context({ pageId: 'sunshine' });
    const script = merge(
      stroke('m', across, 2, { brush: 'magic' }),
      stroke('p', down, 3, { color: 'Black' })
    );
    const { live, replay, captured, midCohort } = expectIdentity({
      script,
      ink,
      history: createHistory(emptyDrawing(0, 'sunshine')),
    });
    expect(midCohort).toEqual(midCohort.map(() => 0));
    expect(differing(live, replay)).toBe(0);
    expect(differing(live, captured)).toBe(0);
  });
});

describe('live ink through the drawing’s lifecycle', () => {
  const sweep = line({ x: 150, y: 200 }, { x: 870, y: 560 }, 36);
  const scribble = [
    ...line({ x: 300, y: 500 }, { x: 700, y: 420 }, 18),
    ...line({ x: 700, y: 420 }, { x: 320, y: 470 }, 18).slice(1),
  ];

  function committedPurple() {
    return drawCohort({
      scene: createInkScene(),
      history: createHistory(emptyDrawing()),
      script: stroke('a', across, 2, { color: 'Purple' }),
    }).history;
  }

  // Negative control: dropping the live cohort from the rebuild loses the ink drawn before the
  // change, and the final layer no longer matches a replay of what was committed.
  it('rebases the live cohort onto Undo and a theme change mid-stroke', () => {
    const scene = createInkScene();
    const dark = context({ theme: 'dark' });
    const drawn = drawCohort({
      scene,
      history: committedPurple(),
      script: merge(
        stroke('b', sweep, 1, { color: 'Black' }),
        stroke('c', scribble, 1, { brush: 'crayon', color: 'Blue', width: 'extraThick' })
      ),
      onFrame(index, cohort, session) {
        if (index === 5) session.history = undoDrawing(session.history);
        if (index === 12) session.ink = dark;
        if (index === 5 || index === 12)
          scene.sync(sceneInput(session.history.drawing.strokes, session.ink), cohort.live());
      },
    });
    const strokes = drawn.history.drawing.strokes;
    expect(strokes.map((item) => item.brush)).toEqual(['pen', 'crayon']);
    expect(drawn.history.undo).toHaveLength(1);
    const live = pixelsOf(scene.snapshot());
    expect(differing(live, rebuilt(strokes, dark))).toBe(0);
    expect(differing(live, rebuilt(strokes))).toBeGreaterThan(0);
  });

  it('replays the live cohort at a new size when the paper resizes mid-stroke', () => {
    const scene = createInkScene();
    const wide = { width: 400, height: 300 };
    const drawn = drawCohort({
      scene,
      history: committedPurple(),
      script: stroke('b', sweep, 2, { color: 'Red' }),
      onFrame(index, cohort, session) {
        if (index !== 6) return;
        session.plane = wide;
        scene.sync(sceneInput(session.history.drawing.strokes, session.ink, wide), cohort.live());
      },
    });
    const live = pixelsOf(scene.snapshot());
    expect(live.length).toBe(wide.width * wide.height * 4);
    expect(differing(live, rebuilt(drawn.history.drawing.strokes, context(), [], wide))).toBe(0);
  });

  it('commits an interrupted cohort with the ink it painted, and refuses capture until then', () => {
    const scene = createInkScene();
    const script = stroke('b', sweep, 2, { color: 'Red' });
    script.at(-1).splice(-1, 1, { interrupt: true });
    let refused = 0;
    const drawn = drawCohort({
      scene,
      history: committedPurple(),
      script,
      onFrame(_index, cohort) {
        if (cohort.live().length === 0) return;
        expect(() => scene.capture(PROJECTION, PLANE)).toThrow('still being prepared');
        refused += 1;
      },
    });
    expect(refused).toBeGreaterThan(5);
    const strokes = drawn.history.drawing.strokes;
    expect(strokes).toHaveLength(2);
    expect(strokes[1].ops.at(-1)[0]).toBe(strokes[1].points.length);
    const live = pixelsOf(scene.snapshot());
    expect(differing(live, rebuilt(strokes))).toBe(0);
    expect(differing(live, decodePng(scene.capture(PROJECTION, PLANE)))).toBe(0);
  });
});
