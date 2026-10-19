import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContactCohort } from '../../experiments/native-architecture/src/drawing/contactCohort.ts';
import {
  addStrokes,
  createHistory,
  emptyDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import {
  adoptPaper,
  paperProjection,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';

// The ink view's pictures reach a native view that swaps its picture on the JS thread while its
// render thread copies it, unsynchronized (skiaViewPicture.ts). Native threads cannot race here;
// this holds the rule that keeps the race harmless: a picture handed to the view is never released
// while the view holds it, nor within RETIRED_PICTURE_MS of leaving it.

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

const { createInkScene } =
  await import('../../experiments/native-architecture/src/drawing/skiaInkScene.ts');
const { createPictureRetirement, RETIRED_PICTURE_MS } =
  await import('../../experiments/native-architecture/src/drawing/skiaViewPicture.ts');

beforeAll(async () => {
  const CanvasKitInit = runtime.require('canvaskit-wasm');
  const { JsiSkApi } = runtime.require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia');
  runtime.skia = JsiSkApi(await CanvasKitInit());
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
});

const PLANE = { width: 320, height: 240 };
const PAPER = adoptPaper(PLANE.width, PLANE.height, 1);
const CONTEXT = {
  paper: PAPER,
  projection: paperProjection(PAPER),
  theme: 'light',
  pageId: 'blank',
  tiles: { byKey: new Map(), uris: [] },
  bookFill: null,
};
const input = (strokes) => ({
  strokes,
  size: PLANE,
  pixels: PLANE,
  key: 'light',
  context: CONTEXT,
});

// A picture that records when it was released.
function tracked(name) {
  return {
    name,
    disposedAt: null,
    dispose() {
      this.disposedAt = performance.now();
    },
  };
}

// The native view: holds the picture it was last given and notes when each one left it.
function createView() {
  const left = new Map();
  let current = null;
  return {
    show(picture) {
      expect(picture.disposedAt).toBeNull();
      if (current) {
        expect(current.disposedAt).toBeNull();
        left.set(current, performance.now());
      }
      current = picture;
    },
    unmount() {
      if (current) left.set(current, performance.now());
      current = null;
    },
    current: () => current,
    left,
  };
}

function expectRetiredSafely(view, pictures) {
  for (const picture of pictures) {
    if (picture === view.current()) {
      expect(picture.disposedAt).toBeNull();
      continue;
    }
    const leftAt = view.left.get(picture);
    if (picture.disposedAt !== null) {
      expect(leftAt).toBeDefined();
      expect(picture.disposedAt - leftAt).toBeGreaterThanOrEqual(RETIRED_PICTURE_MS);
    }
  }
}

describe('createPictureRetirement', () => {
  // Negative control: releasing a picture as it is retired, as the scene once released the
  // picture before each new one, fails the first expectation.
  it('releases a retired picture only once it has been retired for RETIRED_PICTURE_MS', () => {
    const retirement = createPictureRetirement();
    const first = tracked('first');
    const second = tracked('second');
    retirement.retire(first);
    expect(first.disposedAt).toBeNull();
    vi.advanceTimersByTime(RETIRED_PICTURE_MS / 2);
    retirement.retire(second);
    expect(first.disposedAt).toBeNull();
    vi.advanceTimersByTime(RETIRED_PICTURE_MS / 2);
    expect(first.disposedAt).toBe(RETIRED_PICTURE_MS);
    expect(second.disposedAt).toBeNull();
    // No retirement follows; the sweep releases the last one.
    vi.advanceTimersByTime(RETIRED_PICTURE_MS * 2);
    expect(second.disposedAt).not.toBeNull();
    expect(second.disposedAt - RETIRED_PICTURE_MS / 2).toBeGreaterThanOrEqual(RETIRED_PICTURE_MS);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the ink scene and its native view', () => {
  // A long scribble of bursty frames, rebuilds and an unmount, with every picture the scene makes
  // handed to the view as the ink view hands it. Negative control: releasing the previous picture
  // when the next is recorded fails the view's first swap.
  it('never releases a picture the view holds or left less than RETIRED_PICTURE_MS ago', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const scene = createInkScene();
    const view = createView();
    const pictures = [];
    const realPicture = scene.picture;
    scene.picture = () => {
      const picture = realPicture();
      if (!picture) return null;
      const dispose = picture.dispose.bind(picture);
      picture.disposedAt = null;
      picture.dispose = () => {
        picture.disposedAt = performance.now();
        dispose();
      };
      pictures.push(picture);
      return picture;
    };
    let history = createHistory({ ...emptyDrawing(), paper: PAPER });
    scene.sync(input(history.drawing.strokes), []);
    for (let strokeIndex = 0; strokeIndex < 12; strokeIndex++) {
      const cohort = createContactCohort();
      let x = 20 + random() * 280;
      let y = 20 + random() * 200;
      cohort.start(
        'a',
        'Blue',
        strokeIndex % 3 === 0 ? 'crayon' : 'pen',
        { x, y },
        history.drawing,
        'medium',
        () => PAPER
      );
      for (let frame = 0; frame < 30; frame++) {
        for (let sample = Math.floor(random() * 4); sample >= 0; sample--) {
          x = Math.min(1000, Math.max(10, x + (random() - 0.5) * 80));
          y = Math.min(750, Math.max(10, y + (random() - 0.5) * 80));
          cohort.sample('a', { x, y });
        }
        scene.flush(cohort);
        const picture = scene.picture();
        if (picture) view.show(picture);
        vi.advanceTimersByTime(2 + Math.floor(random() * 14));
        expectRetiredSafely(view, pictures);
      }
      scene.flush(cohort);
      history = addStrokes(history, cohort.finish('a'), PAPER);
      // Every fourth stroke is undone at once, which replays the layer.
      const committed =
        strokeIndex % 4 === 3 ? history.undo.at(-1).strokes : history.drawing.strokes;
      scene.sync(input(committed), cohort.live());
      const picture = scene.picture();
      if (picture) view.show(picture);
      expectRetiredSafely(view, pictures);
    }
    scene.dispose();
    view.unmount();
    expectRetiredSafely(view, pictures);
    vi.advanceTimersByTime(RETIRED_PICTURE_MS * 3);
    expectRetiredSafely(view, pictures);
    expect(pictures.length).toBeGreaterThan(100);
    expect(pictures.every((picture) => picture.disposedAt !== null)).toBe(true);
  });
});
