// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentExportScale } from '../../web/src/lib/drawing/exportScale.ts';
import { paintExportPaper } from '../../web/src/lib/drawing/exportCompositor.ts';
import { PAPER_COLORS } from '../../web/src/lib/theme.ts';
import {
  adoptPaper,
  LEGACY_PAPER,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { pictureExport } from '../../experiments/native-architecture/src/drawing/pictureExport.ts';
import { composePicture as composeWebPicture } from '../../experiments/native-architecture/src/drawing/pictureCompose.web.ts';

const skia = vi.hoisted(() => ({ log: [], grainFails: false }));
// Metro hands the web export the grain as { uri, width, height }, which it reads as is
// (platform/webAsset.ts); the native apps resolve the bundled grain through React Native.
const { GRAIN } = vi.hoisted(() => ({
  GRAIN: { uri: '/assets/paper/handmade-paper.webp', width: 148, height: 148 },
}));
vi.mock('../../experiments/native-architecture/assets/paper/handmade-paper.webp', () => ({
  default: GRAIN,
}));
vi.mock('react-native', () => ({
  Image: { resolveAssetSource: (source) => ({ uri: `resolved:${source.uri}` }) },
}));
vi.mock('@shopify/react-native-skia', () => {
  const instance = (name, methods = {}) => ({
    ...methods,
    dispose: () => skia.log.push(['dispose', name]),
  });
  const image = (name, width, height) =>
    instance(name, {
      width: () => width,
      height: () => height,
      makeShaderCubic: (...args) => ({ shader: name, args }),
      encodeToBase64: (...args) => {
        skia.log.push(['encode', ...args]);
        return 'native-composed';
      },
    });
  return {
    ImageFormat: { PNG: 'png' },
    TileMode: { Repeat: 'repeat' },
    Skia: {
      Color: (value) => `color:${value}`,
      XYWHRect: (x, y, width, height) => ({ x, y, width, height }),
      Matrix: () => {
        const matrix = { ops: [] };
        matrix.scale = (x, y) => {
          matrix.ops.push(['scale', x, y]);
          return matrix;
        };
        return matrix;
      },
      Paint: () => instance('paint', { setShader: (shader) => skia.log.push(['shader', shader]) }),
      Data: {
        fromBase64: (base64) => ({ base64 }),
        fromURI: async (uri) => {
          skia.log.push(['fromURI', uri]);
          if (skia.grainFails) throw new Error('missing grain');
          return { uri };
        },
      },
      Image: {
        MakeImageFromEncoded: (data) =>
          data.base64 ? image('layer', 1557, 3072) : image('grain', 148, 148),
      },
      Surface: {
        Make: (width, height) => {
          skia.log.push(['surface', width, height]);
          const canvas = new Proxy(
            {},
            {
              get:
                (_, key) =>
                (...args) =>
                  skia.log.push([key, ...args]),
            }
          );
          return instance('surface', {
            getCanvas: () => canvas,
            flush: () => skia.log.push(['flush']),
            makeImageSnapshot: () => image('snapshot', width, height),
          });
        },
      },
    },
  };
});

const REPOSITORY = join(import.meta.dirname, '../..');
const read = (path) => readFileSync(join(REPOSITORY, path));
// The display ratios a shipping export meets: a zoomed-out browser, desktop, the DPR-2 iPad and
// browser, an Android phone's fractional ratio, and the DPR-3 iPhone.
const PIXEL_RATIOS = [0.5, 1, 1.5, 2, 2.625, 3];
// A phone's portrait paper, the DPR-3 iPhone's on its 1/3-point layout grid, an Android phone's
// on its fractional grid, and a tablet's landscape paper.
const PAPERS = [
  { width: 390, height: 769 },
  { width: 402, height: 787 + 2 / 3 },
  { width: 411.4286, height: 805.7143 },
  { width: 1366, height: 949.5 },
];

// The shipping engine's export grid (engine.ts): the paper's CSS rect backed at the render scale
// (backingSizeOf), snapshotted back into CSS pixels at the export scale (snapshotStrokes).
function shippingExportSize(css, pixelRatio) {
  vi.stubGlobal('devicePixelRatio', pixelRatio);
  const renderScale = Math.min(pixelRatio || 1, 2);
  const scale = currentExportScale();
  const side = (length) => Math.round((Math.round(length * renderScale) / renderScale) * scale);
  return { size: { width: side(css.width), height: side(css.height) }, scale };
}

function recordingContext(log) {
  return new Proxy(
    {},
    {
      get:
        (_, key) =>
        (...args) => {
          log.push([key, ...args]);
          return key === 'createPattern' ? { pattern: args[0], repeat: args[1] } : undefined;
        },
      set: (_, key, value) => {
        log.push(['set', key, value]);
        return true;
      },
    }
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the saved picture keeps the shipping export contract', () => {
  it('pins the shipping engine lines the export grid is derived from', () => {
    const engine = read('web/src/lib/drawing/engine.ts').toString();
    expect(engine).toContain('const MAX_RENDER_SCALE = 2;');
    expect(engine).toContain(
      'renderScale = Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE);'
    );
    expect(engine).toContain(
      'return { w: Math.round(rect.width * renderScale), h: Math.round(rect.height * renderScale) };'
    );
    expect(engine).toContain(
      'const width = Math.round((paper.pxW / renderScale) * snapshotScale);'
    );
    expect(engine).toContain(
      'const height = Math.round((paper.pxH / renderScale) * snapshotScale);'
    );
    expect(engine).toContain('const scale = currentExportScale();');
  });

  it.each(PIXEL_RATIOS)('saves at the shipping grid and scale on a %sx display', (pixelRatio) => {
    for (const css of PAPERS) {
      const paper = adoptPaper(css.width, css.height, pixelRatio);
      const shipping = shippingExportSize(css, pixelRatio);
      expect(pictureExport(paper, 'light', pixelRatio)).toMatchObject(shipping);
    }
  });

  it('saves the 390x844 phone picture at the 780x1538 shipping grid', () => {
    const paper = adoptPaper(390, 769, 1);
    expect(pictureExport(paper, 'light', 1).size).toEqual({ width: 780, height: 1538 });
  });

  it('saves a canonical-sheet picture at one CSS pixel per unit', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    expect(pictureExport(LEGACY_PAPER, 'dark', 3)).toMatchObject({
      size: { width: 1024 * currentExportScale(), height: 768 * currentExportScale() },
      scale: currentExportScale(),
    });
  });

  it.each(['light', 'dark'])('paints the shipping %s paper color', (theme) => {
    expect(pictureExport(adoptPaper(390, 769, 1), theme, 1).paper).toBe(PAPER_COLORS[theme]);
  });

  it('bundles the very grain file the shipping export tiles', () => {
    const exporter = read('web/src/lib/drawing/exportDrawing.ts').toString();
    const [, texture] = exporter.match(/img\.src = '(\/icons\/[^']+\.webp)';/) ?? [];
    expect(texture).toBe('/icons/handmade-paper.webp');
    expect(
      read('experiments/native-architecture/assets/paper/handmade-paper.webp').equals(
        read(`web/static${texture}`)
      )
    ).toBe(true);
  });
});

describe('composing the saved picture on the web', () => {
  let log;
  beforeEach(() => {
    log = [];
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        decode() {
          return Promise.resolve();
        }
      }
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
      log.push(['canvas', this.width, this.height]);
      return recordingContext(log);
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,web-composed'
    );
  });

  it.each(['light', 'dark'])(
    'stretches the picture onto the grid, then paints the shipping %s paper beneath it',
    async (theme) => {
      const picture = pictureExport(adoptPaper(390, 769, 1), theme, 1);
      await expect(composeWebPicture('layer', picture)).resolves.toBe('web-composed');
      const drawn = log.findIndex(([key]) => key === 'drawImage');
      const layer = log[drawn][1];
      const grain = log.find(([key]) => key === 'createPattern')[1];
      expect(layer.src).toBe('data:image/png;base64,layer');
      expect(grain.src).toBe(GRAIN.uri);
      expect(log.slice(0, drawn + 1)).toEqual([
        ['canvas', 780, 1538],
        ['set', 'imageSmoothingEnabled', true],
        ['set', 'imageSmoothingQuality', 'high'],
        ['drawImage', layer, 0, 0, 780, 1538],
      ]);
      const shipping = [];
      paintExportPaper(recordingContext(shipping), {
        width: 390,
        height: 769,
        scale: 2,
        paperColor: PAPER_COLORS[theme],
        texture: grain,
      });
      expect(log.slice(drawn + 1)).toEqual(shipping);
    }
  );
});

describe('composing the saved picture on Android and iOS', () => {
  beforeEach(() => {
    skia.log.length = 0;
    skia.grainFails = false;
  });

  it('paints the paper, the grain at the export scale, then the picture onto the exact grid', async () => {
    const { composePicture } =
      await import('../../experiments/native-architecture/src/drawing/pictureCompose.ts');
    const picture = pictureExport(adoptPaper(402, 787 + 2 / 3, 3), 'dark', 3);
    await expect(composePicture('ios-layer', picture)).resolves.toBe('native-composed');
    const { width, height } = picture.size;
    const grain = skia.log.find(([key]) => key === 'shader')[1];
    expect(grain.args.slice(0, 2)).toEqual(['repeat', 'repeat']);
    expect(grain.args[4].ops).toEqual([['scale', 3, 3]]);
    expect(skia.log.filter(([key]) => !['fromURI', 'dispose'].includes(key))).toEqual([
      ['surface', width, height],
      ['drawColor', `color:${PAPER_COLORS.dark}`],
      ['shader', grain],
      ['drawPaint', expect.anything()],
      [
        'drawImageRectCubic',
        expect.anything(),
        { x: 0, y: 0, width: 1557, height: 3072 },
        { x: 0, y: 0, width, height },
        1 / 3,
        1 / 3,
      ],
      ['flush'],
      ['encode', 'png', 100],
    ]);
    expect(skia.log.find(([key]) => key === 'fromURI')[1]).toBe(`resolved:${GRAIN.uri}`);
    expect(skia.log.filter(([key]) => key === 'dispose').map(([, name]) => name)).toEqual([
      'snapshot',
      'paint',
      'surface',
      'layer',
    ]);
  });

  it('keeps the plain paper color when the grain will not load, and retries it next time', async () => {
    vi.resetModules();
    const { composePicture } =
      await import('../../experiments/native-architecture/src/drawing/pictureCompose.ts');
    const picture = pictureExport(adoptPaper(390, 769, 1), 'light', 1);
    skia.grainFails = true;
    await expect(composePicture('layer', picture)).resolves.toBe('native-composed');
    expect(skia.log.some(([key]) => key === 'drawPaint')).toBe(false);
    skia.log.length = 0;
    skia.grainFails = false;
    await composePicture('layer', picture);
    expect(skia.log.filter(([key]) => key === 'fromURI')).toHaveLength(1);
    expect(skia.log.some(([key]) => key === 'drawPaint')).toBe(true);
  });
});
