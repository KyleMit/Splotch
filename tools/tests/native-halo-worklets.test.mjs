import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';

const app = join(import.meta.dirname, '../../experiments/native-architecture');
const require = createRequire(join(app, 'package.json'));
const babel = require('@babel/core');
const HALO_SIZE_PX = 12;

// The released transform: babel-preset-expo adds the worklets plugin, which rewrites each
// 'worklet' function into a value capturing its closure where it is declared.
function transform(file) {
  return babel.transformFileSync(file, {
    cwd: app,
    babelrc: false,
    configFile: false,
    presets: [require.resolve('babel-preset-expo')],
    caller: { name: 'metro', bundler: 'metro', platform: 'android', isDev: false },
  }).code;
}

function loadReleased(entry, skia) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const local = (specifier) => {
      if (specifier === '@shopify/react-native-skia')
        return { ...require('@shopify/react-native-skia/lib/commonjs/skia/types'), Skia: skia };
      if (specifier.startsWith('.')) return load(`${resolve(dirname(file), specifier)}.ts`);
      return require(specifier);
    };
    new Function('exports', 'require', 'module', transform(file))(module.exports, local, module);
    return module.exports;
  }
  return load(join(app, 'src/drawing', entry));
}

// The UI runtime rebuilds a worklet from its source text with only its captured closure and the
// language's own built-ins: no module scope, no host globals, and every captured function must
// itself be a worklet that existed when the capture happened.
function onUiRuntime(worklet, name = worklet.name) {
  if (typeof worklet !== 'function' || !worklet.__workletHash)
    throw new Error(`${name} is not a worklet`);
  const closure = Object.fromEntries(
    Object.entries(worklet.__closure).map(([key, value]) => {
      if (value === undefined) throw new Error(`${name} captured ${key} before it was defined`);
      return [key, typeof value === 'function' ? onUiRuntime(value, key) : value];
    })
  );
  const ui = runInContext(`(${worklet.__initData.code})`, createContext({}));
  return (...args) => ui.apply({ __closure: closure }, args);
}

let skia;
let halos;
let painter;
beforeAll(async () => {
  const CanvasKitInit = require('canvaskit-wasm');
  const { JsiSkApi } = require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia');
  skia = JsiSkApi(await CanvasKitInit());
  halos = loadReleased('haloModel.ts', skia);
  painter = loadReleased('skiaHaloPainter.ts', skia);
});

const SIZE = 96;
const RGBA_8888 = 4;
const PREMULTIPLIED = 2;
function pixels(paint, shown, now, reduced) {
  const surface = skia.Surface.Make(SIZE, SIZE);
  paint(surface.getCanvas(), shown, now, reduced);
  surface.flush();
  const info = { width: SIZE, height: SIZE, colorType: RGBA_8888, alphaType: PREMULTIPLIED };
  return [...surface.makeImageSnapshot().readPixels(0, 0, info)];
}

describe('native halo worklets on the UI runtime', () => {
  it('reaches only worklets captured after they exist', () => {
    expect(() => onUiRuntime(halos.haloPose)).not.toThrow();
    expect(() => onUiRuntime(painter.paintHalos)).not.toThrow();
  });

  it('poses each halo as the JS thread does through the grow-in and lift-off', () => {
    const pose = onUiRuntime(halos.haloPose);
    for (const lifting of [false, true])
      for (const now of [0, 30, 60, 90, 120, 140])
        for (const reduced of [false, true]) {
          const entry = { halo: { id: 1, kind: 'ring', x: 0, y: 0, size: 8 }, since: 0, lifting };
          expect(pose(entry, now, reduced)).toEqual(halos.haloPose(entry, now, reduced));
        }
  });

  it('paints ring, Magic band and eraser bubble exactly as the JS painter does', () => {
    const paint = onUiRuntime(painter.paintHalos);
    const shown = ['ring', 'magic', 'eraser'].map((kind, index) => ({
      halo: { id: index + 1, kind, x: 20 + index * 28, y: 48, size: HALO_SIZE_PX },
      since: 0,
      lifting: index === 2,
    }));
    for (const now of [0, 60, 200]) {
      const ui = pixels(paint, shown, now, false);
      expect(ui.some((channel) => channel > 0)).toBe(true);
      expect(ui).toEqual(pixels(painter.paintHalos, shown, now, false));
    }
  });
});
