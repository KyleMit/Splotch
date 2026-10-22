// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
          data.base64
            ? { ...image('layer', 1557, 3072), source: data.base64 }
            : image('grain', 148, 148),
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

const PAPERS = [
  { width: 390, height: 769 },
  { width: 402, height: 787 + 2 / 3 },
  { width: 411.4286, height: 805.7143 },
  { width: 1366, height: 949.5 },
];
const EXPORT_GRIDS = [
  {
    ratio: 0.5,
    scale: 2,
    grids: [
      [780, 1540],
      [804, 1576],
      [824, 1612],
      [2732, 1900],
    ],
  },
  {
    ratio: 1,
    scale: 2,
    grids: [
      [780, 1538],
      [804, 1576],
      [822, 1612],
      [2732, 1900],
    ],
  },
  {
    ratio: 1.5,
    scale: 2,
    grids: [
      [780, 1539],
      [804, 1576],
      [823, 1612],
      [2732, 1899],
    ],
  },
  {
    ratio: 2,
    scale: 2,
    grids: [
      [780, 1538],
      [804, 1575],
      [823, 1611],
      [2732, 1899],
    ],
  },
  {
    ratio: 2.625,
    scale: 2.625,
    grids: [
      [1024, 2019],
      [1055, 2067],
      [1080, 2114],
      [3586, 2492],
    ],
  },
  {
    ratio: 3,
    scale: 3,
    grids: [
      [1170, 2307],
      [1206, 2363],
      [1235, 2417],
      [4098, 2849],
    ],
  },
];

describe('the saved picture keeps the shipping export contract', () => {
  it.each(EXPORT_GRIDS)(
    'saves the expected grid and scale on a $ratio display',
    ({ ratio, scale, grids }) => {
      for (const [index, css] of PAPERS.entries()) {
        const [width, height] = grids[index];
        expect(
          pictureExport(adoptPaper(css.width, css.height, ratio), 'light', ratio)
        ).toMatchObject({
          size: { width, height },
          scale,
        });
      }
    }
  );

  it('saves a canonical-sheet picture at one CSS pixel per unit on a 3x display', () => {
    expect(pictureExport(LEGACY_PAPER, 'dark', 3)).toMatchObject({
      size: { width: 3072, height: 2304 },
      scale: 3,
    });
  });

  it('saves the 390x844 phone picture at the 780x1538 shipping grid', () => {
    const paper = adoptPaper(390, 769, 1);
    expect(pictureExport(paper, 'light', 1).size).toEqual({ width: 780, height: 1538 });
  });

  it.each(['light', 'dark'])('paints the shipping %s paper color', (theme) => {
    expect(pictureExport(adoptPaper(390, 769, 1), theme, 1).paper).toBe(PAPER_COLORS[theme]);
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
      await expect(composeWebPicture(['layer'], picture)).resolves.toBe('web-composed');
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
      expect(log.slice(drawn + 1)).toEqual([
        ['set', 'imageSmoothingEnabled', true],
        ['set', 'imageSmoothingQuality', 'high'],
        ['setTransform', 2, 0, 0, 2, 0, 0],
        ['set', 'globalCompositeOperation', 'destination-over'],
        ['createPattern', grain, 'repeat'],
        ['set', 'fillStyle', { pattern: grain, repeat: 'repeat' }],
        ['fillRect', 0, 0, 390, 769],
        ['set', 'fillStyle', PAPER_COLORS[theme]],
        ['fillRect', 0, 0, 390, 769],
        ['set', 'globalCompositeOperation', 'source-over'],
        ['resetTransform'],
      ]);
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
    await expect(composePicture(['ios-layer'], picture)).resolves.toBe('native-composed');
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
    await expect(composePicture(['layer'], picture)).resolves.toBe('native-composed');
    expect(skia.log.some(([key]) => key === 'drawPaint')).toBe(false);
    skia.log.length = 0;
    skia.grainFails = false;
    await composePicture(['layer'], picture);
    expect(skia.log.filter(([key]) => key === 'fromURI')).toHaveLength(1);
    expect(skia.log.some(([key]) => key === 'drawPaint')).toBe(true);
  });

  it('stretches each layer onto the grid in order, the ink beneath the line art', async () => {
    const { composePicture } =
      await import('../../experiments/native-architecture/src/drawing/pictureCompose.ts');
    const picture = pictureExport(adoptPaper(390, 769, 1), 'light', 1);
    await expect(composePicture(['ink', 'outline'], picture)).resolves.toBe('native-composed');
    const drawn = skia.log.filter(([key]) => key === 'drawImageRectCubic');
    expect(drawn.map(([, layer]) => layer.source)).toEqual(['ink', 'outline']);
    for (const [, , , target] of drawn)
      expect(target).toEqual({ x: 0, y: 0, width: 780, height: 1538 });
    expect(skia.log.filter(([key, name]) => key === 'dispose' && name === 'layer')).toHaveLength(2);
  });

  it('omits paper grain from an AI upload while keeping the export pixel grid', async () => {
    vi.resetModules();
    const { composePicture } =
      await import('../../experiments/native-architecture/src/drawing/pictureCompose.ts');
    const picture = pictureExport(adoptPaper(390, 769, 1), 'light', 1);
    await expect(composePicture(['layer'], picture, false)).resolves.toBe('native-composed');
    expect(skia.log).toContainEqual(['surface', 780, 1538]);
    expect(skia.log.some(([key]) => key === 'drawPaint')).toBe(false);
    expect(skia.log.some(([key]) => key === 'fromURI')).toBe(false);
  });
});
it.each([
  [0.5, 1600, 2000],
  [1, 1600, 2000],
  [1.5, 1600, 2000],
  [2, 1600, 2000],
  [2.625, 2100, 2625],
  [3, 2400, 3000],
])(
  'exports the current extent at DPR %s while retaining the first basis',
  (ratio, width, height) => {
    const paper = adoptPaper(400, 800, 2);
    expect(pictureExport(paper, 'light', ratio, { width: 800, height: 1000 }).size).toEqual({
      width,
      height,
    });
    expect(paper).toEqual({ kind: 'adopted', cssWidth: 400, cssHeight: 800, backingScale: 2 });
  }
);
