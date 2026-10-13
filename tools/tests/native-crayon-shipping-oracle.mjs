import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PALETTE_COLORS } from '../../experiments/native-architecture/src/drawing/palette.ts';

const shippingSource = readFileSync(
  new URL('../../web/src/lib/drawing/crayonBrush.ts', import.meta.url),
  'utf8'
);

export function createShippingCrayonOracle() {
  const exports = {};
  const modules = {
    '../idle': { scheduleIdle: () => () => {} },
    '../palette': { PALETTE_COLORS },
  };
  runInNewContext(
    ts.transpileModule(shippingSource, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require(name) {
        if (!Object.hasOwn(modules, name)) throw new Error(`Unexpected oracle import: ${name}`);
        return modules[name];
      },
      document: {
        createElement(name) {
          if (name !== 'canvas') throw new Error('Unexpected oracle element');
          const canvas = { width: 0, height: 0, pixels: null };
          canvas.getContext = () => ({
            createImageData: (width, height) => ({
              data: new Uint8ClampedArray(width * height * 4),
            }),
            putImageData(image) {
              canvas.pixels = new Uint8ClampedArray(image.data);
            },
          });
          return canvas;
        },
      },
    }
  );
  return exports;
}

export function shippingCrayonTile(owner, hex, seed, band) {
  const pattern = owner.crayonPatternFor(
    {
      createPattern(canvas) {
        return {
          canvas,
          phase: null,
          setTransform(value) {
            this.phase = value;
          },
        };
      },
    },
    hex,
    seed,
    band
  );
  if (!pattern?.canvas.pixels || !pattern.phase) throw new Error('Shipping oracle did not paint');
  return {
    width: pattern.canvas.width,
    height: pattern.canvas.height,
    pixels: pattern.canvas.pixels,
    phase: { x: pattern.phase.e, y: pattern.phase.f },
  };
}

export function shippingCrayonPixels(owner, hex, band) {
  return shippingCrayonTile(owner, hex, 20, band).pixels;
}
