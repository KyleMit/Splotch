import { canonicalPaper } from './native-paper-fixtures.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import {
  BUNDLED_FARM_DIR,
  BUNDLED_FARM_FILL_DIR,
  WEB_IMAGES_FILE,
  WEB_PICKER_IMAGES_FILE,
  bundledFarmImageFiles,
  generateBundledFarm,
  imageFilePaths,
} from '../migration/gen-bundled-farm.mjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUNDLED_BOOKS,
  FARM_PAGE_IDS,
  STARTER_BOOK_ID,
  isFarmPageId,
} from '../../experiments/native-architecture/src/drawing/bundledBooks.ts';
import {
  COLORING_PAGES,
  PAGE_IDS,
  SAMPLE_PAGE_IDS,
  isPageId,
} from '../../experiments/native-architecture/src/drawing/pages.ts';
import {
  addStrokes,
  changePage,
  clearDrawing,
  createHistory,
  emptyDrawing,
  parseDrawing,
  strokeStyle,
  undoDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { createPngCapture } from '../../experiments/native-architecture/src/drawing/interactions.ts';
import { BUNDLED_FARM_IMAGES } from '../../experiments/native-architecture/src/drawing/bundledFarm/images.ts';
import {
  BUNDLED_FARM_COVERS,
  BUNDLED_FARM_SELECTORS,
} from '../../experiments/native-architecture/src/drawing/bundledFarm/pickerImages.ts';
import { BUNDLED_BOOK_OUTLINES } from '../../experiments/native-architecture/src/drawing/bundledOutlines.ts';
import {
  reopenPicture,
  savePicture,
} from '../../experiments/native-architecture/src/platform/drawingFiles.web.ts';

function paintedPage(pageId) {
  const selected = changePage(createHistory(emptyDrawing(3)), pageId);
  const points = [
    { x: 200.5, y: 300.25 },
    { x: 400, y: 500 },
  ];
  return addStrokes(
    selected,
    [
      { ...strokeStyle('pen', '#123ABC', selected.drawing, 'thin'), points },
      { ...strokeStyle('crayon', '#FEDCBA', selected.drawing, 'thick'), points },
      { ...strokeStyle('magic', 'Purple', selected.drawing), points },
      { ...strokeStyle('eraser', 'Green', selected.drawing), points },
    ],
    canonicalPaper()
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('bundled Farm book and saved page identity', () => {
  it('exposes the six real Farm pages as one book and retains the original sample identities', () => {
    expect(STARTER_BOOK_ID).toBe('farm');
    expect(FARM_PAGE_IDS).toEqual([
      'farm/cat',
      'farm/cow',
      'farm/dog',
      'farm/duck',
      'farm/horse',
      'farm/pig',
    ]);
    expect(BUNDLED_BOOKS).toEqual({ farm: { label: 'Farm', pageIds: FARM_PAGE_IDS } });
    expect(SAMPLE_PAGE_IDS).toEqual(['blank', 'sunshine', 'flower', 'turtle']);
    expect(PAGE_IDS).toEqual([...SAMPLE_PAGE_IDS, ...FARM_PAGE_IDS]);
    expect(new Set(PAGE_IDS).size).toBe(PAGE_IDS.length);
    expect(FARM_PAGE_IDS.map((pageId) => COLORING_PAGES[pageId].label)).toEqual([
      'Cat',
      'Cow',
      'Dog',
      'Duck',
      'Horse',
      'Pig',
    ]);
  });

  it.each(FARM_PAGE_IDS)(
    'switches existing mixed ink to %s as one reversible operation',
    (pageId) => {
      const original = paintedPage('flower');
      const selected = changePage(original, pageId);
      expect(selected.drawing).toEqual({ ...original.drawing, pageId });
      expect(selected.drawing.strokes).toBe(original.drawing.strokes);
      expect(selected.undo.at(-1)).toBe(original.drawing);
      expect(undoDrawing(selected).drawing).toBe(original.drawing);
      expect(changePage(selected, pageId)).toBe(selected);
      expect(isFarmPageId(pageId)).toBe(true);
      expect(isPageId(pageId)).toBe(true);
    }
  );

  it.each(PAGE_IDS)(
    'round-trips %s with custom paint, Magic, eraser and exact widths and adopted paper in v7',
    (pageId) => {
      const original = paintedPage(pageId).drawing;
      const restored = parseDrawing(JSON.parse(JSON.stringify(original)));
      expect(restored).toEqual(original);
      expect(restored.version).toBe(7);
      expect(restored.paper).toEqual(canonicalPaper());
      expect(restored.pageId).toBe(pageId);
      expect(restored.strokes[0]).toMatchObject({ brush: 'pen', color: '#123ABC', width: 4 });
      expect(restored.strokes[1]).toMatchObject({ brush: 'crayon', color: '#FEDCBA', width: 14 });
      expect(restored.strokes[2]).toMatchObject({ brush: 'magic', rainbow: 3 });
      expect(restored.strokes[3].brush).toBe('eraser');
    }
  );

  it.each(FARM_PAGE_IDS)(
    'preserves %s through Clear and restores its painted composition with Undo',
    (pageId) => {
      const painted = paintedPage(pageId);
      const cleared = clearDrawing(painted, false);
      expect(cleared.drawing).toEqual(emptyDrawing(4, pageId));
      expect(undoDrawing(cleared).drawing).toBe(painted.drawing);
      const blank = changePage(painted, 'blank');
      expect(blank.drawing.strokes).toBe(painted.drawing.strokes);
      expect(undoDrawing(blank).drawing).toBe(painted.drawing);
    }
  );

  it.each(PAGE_IDS)('saves and reopens %s through the real browser adapter', async (pageId) => {
    const values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    });
    const original = paintedPage(pageId).drawing;
    const saved = await savePicture(original);
    expect(JSON.parse(values.get(`splotch-picture:${saved.id}`))).toEqual(original);
    await expect(reopenPicture(saved.id)).resolves.toEqual(original);
  });

  it.each(FARM_PAGE_IDS)(
    'freezes %s and its mixed ink while a later page changes during export',
    async (pageId) => {
      const original = paintedPage(pageId);
      const capture = createPngCapture().begin(original.drawing);
      const later = changePage(original, 'sunshine');
      expect(capture.drawing).toBe(original.drawing);
      expect(capture.drawing.pageId).toBe(pageId);
      expect(capture.drawing.strokes).toBe(original.drawing.strokes);
      expect(later.drawing.pageId).toBe('sunshine');
      expect(capture.complete('fixture-export-snapshot')).toBe(true);
      await expect(capture.promise).resolves.toBe('fixture-export-snapshot');
    }
  );

  it.each([
    'farm',
    'cat',
    'Farm/cat',
    'farm/Cat',
    'farm/kitten',
    'farm/cat/',
    'farm//cat',
    '/farm/cat',
    'farm/cat/extra',
    'farm/../cat',
    'farm\\cat',
    'farm/cat?theme=dark',
    'farm/cat\n',
    'farm/toString',
    'farm/__proto__',
    'toString',
    '__proto__',
    '',
    null,
    undefined,
    {},
    [],
    1,
  ])('refuses unknown or malformed nested page identity %#', (pageId) => {
    expect(isFarmPageId(pageId)).toBe(false);
    expect(isPageId(pageId)).toBe(false);
    expect(() => parseDrawing({ ...emptyDrawing(), pageId })).toThrow(
      'This saved picture contains an invalid coloring page.'
    );
  });

  it('refuses an unknown Farm page without rewriting the saved record', async () => {
    const id = 'picture-123-fixture';
    const serialized = JSON.stringify({
      ...paintedPage('farm/cat').drawing,
      pageId: 'farm/kitten',
    });
    const values = new Map([[`splotch-picture:${id}`, serialized]]);
    const write = vi.fn((key, value) => values.set(key, value));
    vi.stubGlobal('localStorage', { getItem: (key) => values.get(key) ?? null, setItem: write });
    await expect(reopenPicture(id)).rejects.toThrow(
      'This saved picture contains an invalid coloring page.'
    );
    expect(values.get(`splotch-picture:${id}`)).toBe(serialized);
    expect(write).not.toHaveBeenCalled();
  });
});

const SHIPPED_ART_EXPECTATIONS = [
  {
    pageId: 'farm/cat',
    theme: 'light',
    viewBox: '0 0 1536 1024',
    outlineKinds: ['path', 'path', 'path', 'ellipse', 'ellipse', 'path', 'path', 'path', 'path'],
    pathSha256: '1570f947bb567d099533af67d60221420fdb4a24252c68671f313f7d9e41ddad',
    selector: '020977b84f4909fc348fdb8506e336cbc1e160ad0ecf1b7e04351b728fcda94b',
    nodeGeometrySha256: 'a14bc7fb558c2d7b2de00f64c2331afc49bec9f94fc9e700f48b4f803c98b6b9',
    ink: '#000',
  },
  {
    pageId: 'farm/cat',
    theme: 'dark',
    viewBox: '0 0 1536 1024',
    outlineKinds: [
      'path',
      'path',
      'path',
      'ellipse',
      'ellipse',
      'path',
      'ellipse',
      'ellipse',
      'path',
      'path',
      'path',
      'rect',
      'path',
    ],
    pathSha256: 'b9950f0cf7097a5bee10a0f598ac518527873064772b3b01070bfd9e8e1804e2',
    selector: '164ce47063ba28afa0d671b6934d6f8fc744e9eb20e39d1f528fed544ff53bcc',
    nodeGeometrySha256: '86507b8be42ef863fd38a5c67b03aef4d05253bcb783c2f6c603aa189fb6221c',
    ink: '#fff',
  },
  {
    pageId: 'farm/cow',
    theme: 'light',
    viewBox: '0 0 1536 1024',
    outlineKinds: ['path', 'path', 'path', 'rect', 'rect', 'rect', 'path', 'path', 'path'],
    pathSha256: '00770148dc33fba42fc68ddddc05d40b7613cb58f4992ecfef5cef4d1b0e1090',
    selector: '7fa2944de9da170979269dc7b24727c8a6b0f03bc0ea80f718bb6e7ad8fac238',
    nodeGeometrySha256: 'e358377381c80fd491920296d81bba68f875aff2fdb010a5e6d9d042702ec90a',
    ink: '#000',
  },
  {
    pageId: 'farm/cow',
    theme: 'dark',
    viewBox: '0 0 1536 1024',
    outlineKinds: [
      'path',
      'path',
      'path',
      'rect',
      'rect',
      'rect',
      'path',
      'path',
      'rect',
      'path',
      'path',
    ],
    pathSha256: '0a96079c3aaedc552fa79995d8ca5636e500638303331ce42028542821074611',
    selector: '5c57ddd0c4dafb7b57946baee0a0312c9e79cf3744b7a1cbcb93ceb5fb1b594b',
    nodeGeometrySha256: '249dd0c02a68215be4db5b47774d20c8a423648c936b63f1375e29b74d9e1da5',
    ink: '#fff',
  },
  {
    pageId: 'farm/dog',
    theme: 'light',
    viewBox: '0 0 1536 1024',
    outlineKinds: ['path', 'path'],
    pathSha256: '546ce390189fa0b2b6d08fc8889fa06caa352e7b91b3d17afe8a6035e076245b',
    selector: 'a8db866619ff4c54307d906663daba5d464b7ac8f9971c09043773c9d899184f',
    nodeGeometrySha256: '5cae478f7138e2283bfbda92dfd0786dc92209b7e0af6864402c7ca1cdc0a22c',
    ink: '#000',
  },
  {
    pageId: 'farm/dog',
    theme: 'dark',
    viewBox: '0 0 1536 1024',
    outlineKinds: ['path', 'path', 'ellipse', 'ellipse', 'path', 'path'],
    pathSha256: '8540d42d38e9527626964b8585d0ed99251278cd3b993a1b9962a6d236aed1b4',
    selector: '6e5e04c49c43ee44a6163c9bdf6e9545cb82757ec665b65f271304f686d7560e',
    nodeGeometrySha256: '732021bd77892bb356921e315b51dab984ef09203506a94bc080c829ef179202',
    ink: '#fff',
  },
  {
    pageId: 'farm/duck',
    theme: 'light',
    viewBox: '0 0 1536 1024',
    outlineKinds: ['path', 'path', 'ellipse', 'path', 'path', 'path', 'ellipse', 'path', 'path'],
    pathSha256: '53684c7170b31bb91e4f72baa685f24a2892c1b9d0fad252d592d54e97bb8521',
    selector: 'cad45ae1f4007d8567ee0e00a2d8c62866674c2353225adb616d536b237d8125',
    nodeGeometrySha256: '8fe472fd608295b57e330f7ebd247353b287e5dd36fe79a850cde68c060c8dc0',
    ink: '#000',
  },
  {
    pageId: 'farm/duck',
    theme: 'dark',
    viewBox: '0 0 1536 1024',
    outlineKinds: [
      'path',
      'path',
      'path',
      'ellipse',
      'ellipse',
      'path',
      'path',
      'path',
      'rect',
      'ellipse',
      'path',
      'path',
    ],
    pathSha256: 'f8cace266ed642c9246a7323805c8d27b31698d466724089997b9e1b6e3e8309',
    selector: '0ab52aa8931db280914902bd9a5538abb49495aee9b89e897ba259c3a684e37e',
    nodeGeometrySha256: 'e46bcf76623f39fb61dcfd7d0b904be3c4f11b053382db11e307dac36110b3ed',
    ink: '#fff',
  },
  {
    pageId: 'farm/horse',
    theme: 'light',
    viewBox: '0 0 1536 1024',
    outlineKinds: [
      'path',
      'path',
      'path',
      'ellipse',
      'ellipse',
      'rect',
      'rect',
      'rect',
      'rect',
      'rect',
      'path',
      'path',
      'path',
      'path',
    ],
    pathSha256: '4b08a32271d9b68f5c02eb75c275ea31877a365fb1f60b067b3a54644b3bc367',
    selector: 'a5a8e007363ef69fb1b501d2ccad8302f419742bbb191307d14fb5644cbc64a9',
    nodeGeometrySha256: '54135bb599f8eea5387194c27a0981ec718b02cd97c97f52c8185d9bf4055454',
    ink: '#000',
  },
  {
    pageId: 'farm/horse',
    theme: 'dark',
    viewBox: '0 0 1536 1024',
    outlineKinds: [
      'path',
      'path',
      'path',
      'ellipse',
      'path',
      'ellipse',
      'ellipse',
      'rect',
      'rect',
      'rect',
      'rect',
      'rect',
      'path',
      'path',
      'path',
      'path',
    ],
    pathSha256: '434ed0068923908393dff0d80c7e2ac2707786eb2652f0fd7e7ebfe6a591b35e',
    selector: '977edc98e84daf971f785faf032a135078b6ba3823c68bf2a1cb3cfec1b6c01e',
    nodeGeometrySha256: 'f180e8910f40977dd04f4e47196acffb9ff1518ae80e8325b6a7f146eb00d011',
    ink: '#fff',
  },
  {
    pageId: 'farm/pig',
    theme: 'light',
    viewBox: '0 0 1536 1024',
    outlineKinds: ['path', 'path', 'path', 'path', 'path', 'path'],
    pathSha256: '6437ed9cd547b77fe8b5565842b1074622e330b0543041ad3f9025c9b2c72b1d',
    selector: '58f46662d0cd4ba9e55e3895b04aae3f256f843c4b918451ad32fb8c68435e5f',
    nodeGeometrySha256: '06758292ce9508a87763bf1c1c2e1fdd4e95fbc8f55df3d289b760954fb0347b',
    ink: '#000',
  },
  {
    pageId: 'farm/pig',
    theme: 'dark',
    viewBox: '0 0 1536 1024',
    outlineKinds: ['path', 'path', 'path', 'ellipse', 'path', 'path', 'path', 'ellipse', 'path'],
    pathSha256: '5130f53f181952ef470cb14fc1231d8ed1fe5b3ffc1a3b121440c2043d5bcdaa',
    selector: '1c5037f7774bb8f3fc11c08391328cb8a052ad5c1fc68e3ebd8dc9064ab04c6f',
    nodeGeometrySha256: '45b19fa6ff6287a7fe5a2431a22227bd5a8e6b127a75a7f92fa6670b4ee5af41',
    ink: '#fff',
  },
];

const SHIPPED_COVER_EXPECTATIONS = [
  {
    theme: 'light',
    sha256: '4c8df2a549e3abf5567a8524ff31341a05d1d438f219a498dd569710389c942b',
  },
  {
    theme: 'dark',
    sha256: '5b019ed67dc3779e15424466ae91f1722048d5ffd6f71d851902930b15d44a90',
  },
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function webpBytes(uri) {
  expect(uri).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/);
  return Buffer.from(uri.slice('data:image/webp;base64,'.length), 'base64');
}

const ART_VARIANTS = FARM_PAGE_IDS.flatMap((pageId) =>
  [
    ['landscape', 'wide', '0 0 1536 1024'],
    ['portrait', 'tall', '0 0 1024 1536'],
  ].flatMap(([orientation, slug, viewBox]) =>
    [
      ['light', 'light'],
      ['dark', 'night'],
    ].map(([theme, fill]) => ({ pageId, orientation, slug, viewBox, theme, fill }))
  )
);

describe('bundled art preserves shipped Farm provenance', () => {
  it('provides distinct real art for every catalog page, both orientations and both themes', () => {
    expect(Object.keys(BUNDLED_BOOK_OUTLINES)).toEqual([...FARM_PAGE_IDS]);
    expect(Object.keys(BUNDLED_FARM_IMAGES)).toEqual([...FARM_PAGE_IDS]);
    expect(SHIPPED_ART_EXPECTATIONS).toHaveLength(FARM_PAGE_IDS.length * 2);
    const fills = ART_VARIANTS.map(
      ({ pageId, orientation, theme }) => BUNDLED_FARM_IMAGES[pageId][orientation][theme]
    );
    expect(new Set(fills).size).toBe(FARM_PAGE_IDS.length * 4);
  });

  it('pins the committed modules to the current shipping overlays, fills and selectors', async () => {
    expect(await generateBundledFarm(['--check'])).toEqual({
      pages: FARM_PAGE_IDS.length,
      modules: FARM_PAGE_IDS.length + 4,
    });
  });

  it('serves the web export the same shipped files the native apps carry as data URIs', () => {
    const read = (file) => readFileSync(`${BUNDLED_FARM_DIR}${file}`, 'utf8');
    const web = read(WEB_IMAGES_FILE);
    const picker = read(WEB_PICKER_IMAGES_FILE);
    for (const source of [web, picker]) expect(source).not.toContain('data:image/');
    const { pages, selectors, covers } = bundledFarmImageFiles();
    const oriented = (files, images) =>
      ART_VARIANTS.map(({ pageId, orientation, theme }) => [
        files[pageId][orientation][theme],
        images[pageId][orientation][theme],
      ]);
    const slots = [
      ...oriented(pages, BUNDLED_FARM_IMAGES).map((slot) => [web, ...slot]),
      ...oriented(selectors, BUNDLED_FARM_SELECTORS).map((slot) => [picker, ...slot]),
      ...['light', 'dark'].map((theme) => [picker, covers[theme], BUNDLED_FARM_COVERS[theme]]),
    ];
    expect(slots).toHaveLength(FARM_PAGE_IDS.length * 8 + 2);
    for (const [module, path, native] of slots) {
      expect(module).toContain(` from '${relative(BUNDLED_FARM_DIR, path)}';`);
      expect(webpBytes(native).equals(readFileSync(path))).toBe(true);
    }
    // The paper's fills module, on the startup path, carries none of the picker's images.
    for (const path of [...Object.values(covers), ...imageFilePaths(selectors)])
      expect(web).not.toContain(relative(BUNDLED_FARM_DIR, path));
  });

  it.each(SHIPPED_ART_EXPECTATIONS)(
    'preserves $pageId $theme canonical wide geometry and exact shipped selector bytes',
    (source) => {
      const art = BUNDLED_BOOK_OUTLINES[source.pageId].landscape[source.theme];
      expect(art.viewBox).toBe(source.viewBox);
      expect(art.ink).toBe(source.ink);
      expect(sha256(JSON.stringify(art.outline))).toBe(source.nodeGeometrySha256);
      expect(art.outline.map(({ kind }) => kind)).toEqual(source.outlineKinds);
      const paths = art.outline
        .filter(({ kind }) => kind === 'path')
        .map(({ d }) => d)
        .join('\n');
      expect(sha256(paths)).toBe(source.pathSha256);
      expect(sha256(webpBytes(BUNDLED_FARM_SELECTORS[source.pageId].landscape[source.theme]))).toBe(
        source.selector
      );
    }
  );

  it.each(ART_VARIANTS)(
    'bundles $pageId $orientation $theme on its own frame with the compact shipped fill bytes',
    ({ pageId, orientation, slug, viewBox, theme, fill }) => {
      const art = BUNDLED_BOOK_OUTLINES[pageId][orientation][theme];
      expect(art.viewBox).toBe(viewBox);
      expect(art.ink).toBe(theme === 'dark' ? '#fff' : '#000');
      const shipped = readFileSync(
        `${BUNDLED_FARM_FILL_DIR}${pageId.split('/')[1]}-${slug}.${fill}.webp`
      );
      expect(webpBytes(BUNDLED_FARM_IMAGES[pageId][orientation][theme]).equals(shipped)).toBe(true);
    }
  );

  it.each(SHIPPED_COVER_EXPECTATIONS)(
    'preserves the original $theme Farm cover bytes',
    (source) => {
      expect(sha256(webpBytes(BUNDLED_FARM_COVERS[source.theme]))).toBe(source.sha256);
    }
  );
});
