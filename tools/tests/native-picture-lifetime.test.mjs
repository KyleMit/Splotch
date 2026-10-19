import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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

// The ink view releases each picture as soon as the native view holds the next one
// (skiaViewPicture.ts). That is safe only because the patched native view orders its picture's
// replacement on the JS thread with the copy its render thread draws; unpatched, dropping a
// replaced picture's last reference could free it mid-draw ("Pure virtual function called!").

const ROOT = join(fileURLToPath(import.meta.url), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const PATCH = 'patches/@shopify__react-native-skia@2.6.2.patch';
const VIEW_HEADER = 'node_modules/@shopify/react-native-skia/cpp/rnskia/RNSkPictureView.h';

// One renderer method, by its signature, from the installed header.
function rendererMethod(header, signature) {
  const start = header.indexOf(signature);
  if (start === -1) return null;
  let depth = 0;
  for (let index = header.indexOf('{', start); index < header.length; index++) {
    if (header[index] === '{') depth += 1;
    if (header[index] === '}' && --depth === 0) return header.slice(start, index + 1);
  }
  return null;
}

// Negative control: the unpatched header copies `_picture` in performDraw and assigns it in
// setPicture without the lock, and the first test fails on it.
describe('the patched react-native-skia picture view', () => {
  const header = read(VIEW_HEADER);

  it('replaces and copies its picture under one lock', () => {
    expect(header).toMatch(/mutable std::mutex _pictureMutex;/);
    const set = rendererMethod(header, 'void setPicture(sk_sp<SkPicture> picture)');
    expect(set).toMatch(
      /std::lock_guard<std::mutex> lock\(_pictureMutex\);\s*_picture\.swap\(picture\);/
    );
    const get = rendererMethod(header, 'sk_sp<SkPicture> getPicture() const');
    expect(get).toMatch(/std::lock_guard<std::mutex> lock\(_pictureMutex\);\s*return _picture;/);
    const draw = rendererMethod(header, 'bool performDraw(');
    expect(draw).toMatch(/sk_sp<SkPicture> picture = getPicture\(\);/);
    expect(draw).not.toMatch(/=\s*_picture;/);
  });

  it('is applied from the registered patch on every install', () => {
    expect(read('pnpm-workspace.yaml')).toContain(`'@shopify/react-native-skia@2.6.2': ${PATCH}`);
    expect(read(PATCH)).toContain('+      _picture.swap(picture);');
    expect(read('experiments/native-architecture/src/drawing/skiaViewPicture.ts')).toContain(
      'react-native-skia patch'
    );
  });
});

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

beforeAll(async () => {
  const CanvasKitInit = runtime.require('canvaskit-wasm');
  const { JsiSkApi } = runtime.require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia');
  runtime.skia = JsiSkApi(await CanvasKitInit());
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

// The native view as the scene sees it: each picture it is handed must still be live, and the
// one it held before must not have been released ahead of the hand-over.
function createView() {
  const released = new Set();
  let current = null;
  const shown = [];
  return {
    show(picture) {
      expect(released.has(picture)).toBe(false);
      if (current) expect(released.has(current)).toBe(false);
      const dispose = picture.dispose.bind(picture);
      picture.dispose = () => {
        expect(released.has(picture)).toBe(false);
        released.add(picture);
        dispose();
      };
      current = picture;
      shown.push(picture);
    },
    current: () => current,
    shown,
    released,
  };
}

describe('the ink scene and its native view', () => {
  // A long scribble of bursty frames, crayon passes, Undo rebuilds and a dispose. Negative
  // controls: releasing the previous picture before the hand-over fails the view's first swap;
  // never releasing it fails the count after the scribble.
  it('releases each picture once, only after the view holds the next', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const scene = createInkScene();
    const view = createView();
    const show = (picture) => view.show(picture);
    let history = createHistory({ ...emptyDrawing(), paper: PAPER });
    scene.sync(input(history.drawing.strokes), []);
    scene.present(show);
    for (let strokeIndex = 0; strokeIndex < 12; strokeIndex++) {
      const cohort = createContactCohort();
      let x = 100 + random() * 800;
      let y = 100 + random() * 550;
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
        scene.present(show);
        expect(view.released.has(view.current())).toBe(false);
      }
      scene.flush(cohort);
      history = addStrokes(history, cohort.finish('a'), PAPER);
      // Every fourth stroke is undone at once, which replays the layer.
      const committed =
        strokeIndex % 4 === 3 ? history.undo.at(-1).strokes : history.drawing.strokes;
      scene.sync(input(committed), cohort.live());
      scene.present(show);
    }
    expect(view.shown.length).toBeGreaterThan(100);
    expect(view.shown.slice(0, -1).every((picture) => view.released.has(picture))).toBe(true);
    expect(view.released.has(view.current())).toBe(false);
    scene.dispose();
    expect(view.shown.every((picture) => view.released.has(picture))).toBe(true);
  });
});
