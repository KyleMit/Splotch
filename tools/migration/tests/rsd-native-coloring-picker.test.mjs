import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { records, host, root, mount } from './rsd-native-selection-host.mjs';
import { RsdColoringBookPicker } from '../../../src/rsdDrawing/RsdColoringBookPicker.tsx';
import { TAP_ZONE_DURATION_MS, TAP_ZONE_RADIUS_PX } from '../../../src/rsdDrawing/tapZone.ts';

import { LibraryProvider } from '../../../src/offlineLibrary/LibraryScope.tsx';
import { DrawingAppearanceProvider } from '../../../src/drawing/DrawingAppearance.tsx';
import { catalogPack } from '../../../src/offlineLibrary/catalog.ts';
import { OFFLINE_BOOKS } from '../../../src/offlineLibrary/books.generated.ts';
import { offlinePageId } from '../../../src/offlineLibrary/identity.ts';
import { createOfflineLibrary } from '../../../src/offlineLibrary/controller.ts';
import {
  BUNDLED_FARM_COVERS,
  BUNDLED_FARM_SELECTORS,
} from '../../../src/drawing/bundledFarm/pickerImages.ts';
import { FARM_PAGE_IDS } from '../../../src/drawing/bundledBooks.ts';
import { COLORING_PAGES } from '../../../src/drawing/pages.ts';
import { scale } from '../../../src/lib/design/tokens.ts';
import { trailingRowCutHeight } from '../../../src/lib/actions/scrollCue.ts';
import {
  CARD_HEIGHT_CAP_FRACTION,
  COLORING_HEADER_GAP_PX,
  COLORING_PADDING_PX,
  MODAL_CONTROL_SIZE_PX,
  MODAL_SCRIM_PLAIN,
} from '../../../src/rsdDrawing/modalGeometry.ts';
import {
  BOOK_GRID_FOLD_SLACK_PX,
  BOOK_GRID_TALL_PORTRAIT_MAX_ASPECT,
  COLORING_GRID_GAP_PX,
  PAGE_GRID_COLUMNS,
  PAGE_TILE_ASPECT,
} from '../../../src/rsdDrawing/coloringGrid.ts';
import { TILE_HOVER_SHADOW } from '../../../src/rsdDrawing/RsdColoringTile.tsx';

import { rgba } from '../../../src/rsdDrawing/colorMix.ts';
import { DRAWING_BRAND } from '../../../src/drawing/theme.ts';

const dinosaurs = catalogPack('dinosaur', 'full');
const space = catalogPack('space', 'full');
const owner = createOfflineLibrary({ uri: (path) => `file:///private/library/${path}` }, 'full');
const PHONE = { width: 390, height: 844, scale: 1, fontScale: 1 };
const TABLET_LANDSCAPE = { width: 1366, height: 1024, scale: 1, fontScale: 1 };
// The iPhone 17 Pro, where shipping's cut shortens the starter book's card.
const IPHONE = { width: 402, height: 874, scale: 1, fontScale: 1 };
const FARM_PAGE_NAMES = FARM_PAGE_IDS.map(
  (pageId) => `${COLORING_PAGES[pageId].label} coloring page`
);

let clock = 0;
vi.spyOn(Date, 'now').mockImplementation(() => clock);
afterEach(() => {
  clock = 0;
});

function inventory(installed, change = {}) {
  return { ...owner.snapshot(), status: 'ready', installed, inventoried: true, ...change };
}

function element(component, { state, remove = vi.fn(async () => {}), preference = 'system' }) {
  return createElement(
    LibraryProvider,
    { owner, state, remove },
    createElement(DrawingAppearanceProvider, { preference }, component)
  );
}

function picker({ state = inventory([]), selected = 'blank', orientation = 'portrait', ...rest }) {
  const onChoose = rest.onChoose ?? vi.fn();
  return {
    onChoose,
    tree: element(
      createElement(RsdColoringBookPicker, {
        selected,
        orientation,
        visible: true,
        onDismiss() {},
        onChoose,
        onClose() {},
      }),
      { state, preference: rest.preference }
    ),
  };
}

// A control by its accessible name, or a text button by its label.
const control = (label) =>
  host.querySelector(`[aria-label="${label}"]`) ??
  [...host.querySelectorAll('button')].find((node) => node.textContent === label) ??
  null;
async function press(label) {
  const node = control(label);
  expect(node, label).not.toBeNull();
  await act(async () => node.click());
}
const tileNames = (suffix) =>
  [...host.querySelectorAll('[aria-label]')]
    .map((node) => node.getAttribute('aria-label'))
    .filter((label) => label.endsWith(suffix));
const title = () => host.querySelector('[role="heading"], h2')?.textContent;
// The image URIs the latest render drew, in order.
function images() {
  const seen = [];
  for (const props of records.props)
    if (props.source?.uri && !seen.includes(props.source.uri)) seen.push(props.source.uri);
  return seen;
}
function flat(style) {
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style;
}
const tileBox = (label) =>
  flat(
    records.props.findLast(
      (props) => props['aria-label'] === label || props.accessibilityLabel === label
    ).style
  );

describe('the Coloring Book Picker', () => {
  it('opens a starter-only library straight to tall, captionless Farm page tiles', async () => {
    records.dimensions = PHONE;
    const { tree, onChoose } = picker({});
    await mount(tree);
    expect(title()).toBe('Farm');
    expect(control('Back')).toBeNull();
    expect(tileNames(' coloring book')).toEqual([]);
    expect(tileNames(' coloring page')).toEqual(FARM_PAGE_NAMES);
    expect(control('Cat coloring page').textContent).toBe('');
    expect(images()).toEqual(
      FARM_PAGE_IDS.map((pageId) => BUNDLED_FARM_SELECTORS[pageId].portrait.light)
    );
    // 390 less two 16px gutters and the narrow phone's two 8px paddings, two columns 8px apart.
    expect(tileBox('Cat coloring page')).toMatchObject({ width: 167, height: 250.5 });
    await press('Dog coloring page');
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('farm/dog');
  });

  // app.css drops the picker's backdrop blur on a coarse pointer, which every native screen is.
  it('dims the screen behind with the plain scrim and no blur', async () => {
    await mount(picker({}).tree);
    expect(host.querySelector('[data-testid="modal-backdrop-blur"]')).toBeNull();
    const scrim = records.props.findLast((props) => props.testID === 'modal-scrim');
    expect(flat(scrim.style).backgroundColor).toBe(MODAL_SCRIM_PLAIN);
  });

  // Shipping's cutTrailingRow budgets the card so its fold lands half a tile into a row, and its
  // ScrollCue fades that row. Negative control: a card left at the 85% cap folds between two rows
  // here, its last whole row reading as the end of the book, and without the cue the cut row
  // ends in a hard edge.
  it('cuts the card through a row of tiles and fades the cut row, as shipping does', async () => {
    records.dimensions = IPHONE;
    await mount(picker({}).tree);
    const header = COLORING_PADDING_PX.phoneBlock + MODAL_CONTROL_SIZE_PX + COLORING_HEADER_GAP_PX;
    const card = () =>
      flat(records.props.findLast((props) => props.testID === 'modal-surface').style);
    const cap = IPHONE.height * CARD_HEIGHT_CAP_FRACTION;
    expect(card().maxHeight).toBeCloseTo(cap);
    const headerBox = records.props.findLast((props) => props.testID === 'coloring-picker-header');
    await act(async () =>
      headerBox.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 370, height: header } } })
    );
    const tile = tileBox('Cat coloring page');
    const gap = COLORING_GRID_GAP_PX.phone;
    const rows = Math.ceil(FARM_PAGE_IDS.length / PAGE_GRID_COLUMNS.phonePortrait);
    const cut = trailingRowCutHeight({
      gridTop: header,
      rowHeight: tile.height,
      rowGap: gap,
      rowCount: rows,
      viewportHeight: cap,
      contentHeight:
        header + rows * tile.height + (rows - 1) * gap + COLORING_PADDING_PX.phoneBlock,
    });
    expect(cut).toBeLessThan(cap);
    expect(card().maxHeight).toBe(cut);
    const intoRow = (cut - header) % (tile.height + gap);
    expect(intoRow).toBeCloseTo(tile.height / 2);
    expect(host.querySelector('[data-testid="scroll-cue"]')).not.toBeNull();
    expect(records.viewports.at(-1).contentContainerStyle).toMatchObject({
      paddingTop: 0,
      paddingBottom: COLORING_PADDING_PX.phoneBlock,
      paddingLeft: COLORING_PADDING_PX.phoneInline,
      paddingRight: COLORING_PADDING_PX.phoneInline,
    });
  });

  it('shows landscape paper wide tiles two to a row', async () => {
    records.dimensions = TABLET_LANDSCAPE;
    await mount(picker({ orientation: 'landscape' }).tree);
    expect(images()).toEqual(
      FARM_PAGE_IDS.map((pageId) => BUNDLED_FARM_SELECTORS[pageId].landscape.light)
    );
    // The 920px card less 32px padding, two columns 12px apart.
    expect(tileBox('Cat coloring page')).toMatchObject({ width: 422 });
    expect(tileBox('Cat coloring page').height).toBeCloseTo(422 / 1.5);
  });

  it.each(['light', 'dark'])(
    'lists a downloaded book on the %s Book Grid, with captions, and Back in the header',
    async (theme) => {
      records.scheme = theme;
      records.dimensions = PHONE;
      await mount(picker({ state: inventory([dinosaurs]) }).tree);
      expect(title()).toBe('Coloring Books');
      expect(control('Back')).toBeNull();
      expect(tileNames(' coloring book')).toEqual([
        'Farm coloring book',
        'Dinosaurs coloring book',
      ]);
      expect(control('Dinosaurs coloring book').textContent).toBe('Dinosaurs');
      expect(images()).toEqual([
        BUNDLED_FARM_COVERS[theme],
        owner.cover(dinosaurs, theme === 'dark'),
      ]);
      records.props.length = 0;
      await press('Dinosaurs coloring book');
      expect(title()).toBe('Dinosaurs');
      const pages = OFFLINE_BOOKS.find((book) => book.id === 'dinosaur').pages;
      expect(tileNames(' coloring page')).toEqual(
        pages.map((page) => `${page.label} coloring page`)
      );
      expect(images()).toEqual(
        pages.map((page) => owner.selector(dinosaurs, page.slug, 'portrait', theme === 'dark'))
      );
      await press('Back');
      expect(title()).toBe('Coloring Books');
    }
  );

  // Negative control: without the guard, the press that lands on the freshly painted page tile
  // picks it and closes the picker.
  // A finger press at a page point, as React Native reports it to the tile's Pressable.
  async function tap(label, x, y) {
    const props = records.props.findLast(
      (entry) => entry.accessibilityLabel === label && entry.onPress
    );
    expect(props, label).toBeDefined();
    await act(async () => props.onPress({ nativeEvent: { pageX: x, pageY: y } }));
  }

  // Negative control: without the zone, the burst's second press picks the page painted under it.
  it('ignores the rest of a tap burst on the spot that swapped the grid, then picks normally', async () => {
    const { tree, onChoose } = picker({ state: inventory([dinosaurs]) });
    await mount(tree);
    await tap('Farm coloring book', 100, 200);
    clock += TAP_ZONE_DURATION_MS - 1;
    await tap('Cat coloring page', 100 + TAP_ZONE_RADIUS_PX, 200);
    expect(onChoose).not.toHaveBeenCalled();
    clock += 1;
    await tap('Cat coloring page', 100, 200);
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('farm/cat');
  });

  it('lets a deliberate tap elsewhere through the zone at once', async () => {
    const { tree, onChoose } = picker({ state: inventory([dinosaurs]) });
    await mount(tree);
    await tap('Farm coloring book', 100, 200);
    await tap('Dog coloring page', 100 + TAP_ZONE_RADIUS_PX + 1, 200);
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('farm/dog');
  });

  it('never guards a keyboard or assistive activation, which has no tap point', async () => {
    const { tree, onChoose } = picker({ state: inventory([dinosaurs]) });
    await mount(tree);
    await tap('Farm coloring book', 100, 200);
    await press('Cat coloring page');
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('farm/cat');
  });

  it('guards the spot Back was tapped at, as a cover tap does', async () => {
    await mount(picker({ state: inventory([dinosaurs]) }).tree);
    await press('Farm coloring book');
    await tap('Back', 40, 60);
    await tap('Dinosaurs coloring book', 40, 60);
    expect(title()).toBe('Coloring Books');
  });

  it('clears the applied page from the Active Page Chip in the header', async () => {
    records.dimensions = PHONE;
    const { tree, onChoose } = picker({ selected: 'farm/dog' });
    await mount(tree);
    const chip = control('Clear active coloring page: Dog');
    expect(chip.textContent).toBe('Dog');
    expect(images()).toContain(BUNDLED_FARM_SELECTORS['farm/dog'].portrait.light);
    await press('Clear active coloring page: Dog');
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('blank');
  });

  it('shows the chip only for an applied page, and drops its name on the narrowest phones', async () => {
    await mount(picker({}).tree);
    expect(host.querySelector('[aria-label^="Clear active coloring page"]')).toBeNull();
    records.dimensions = { width: 360, height: 740, scale: 1, fontScale: 1 };
    const id = offlinePageId(dinosaurs, 'trex');
    await act(async () =>
      root.render(picker({ state: inventory([dinosaurs]), selected: id }).tree)
    );
    expect(control('Clear active coloring page: T. Rex').textContent).toBe('');
  });

  it('carries no parent controls and no explanatory copy', async () => {
    await mount(picker({ state: inventory([dinosaurs]), selected: 'farm/cat' }).tree);
    for (const copy of ['Your drawing stays', 'Blank paper', 'More pages', 'download', 'Retry'])
      expect(host.textContent.toLowerCase()).not.toContain(copy.toLowerCase());
  });
});

describe('the books an open picker holds', () => {
  it('holds the Book Grid steady while another pack finishes, then drops a removed book', async () => {
    await mount(picker({ state: inventory([dinosaurs]) }).tree);
    await act(async () => root.render(picker({ state: inventory([dinosaurs, space]) }).tree));
    expect(control('Space coloring book')).toBeNull();
    await act(async () => root.render(picker({ state: inventory([]) }).tree));
    expect(control('Dinosaurs coloring book')).toBeNull();
    expect(title()).toBe('Coloring Books');
  });

  it('lists downloaded books in catalog order, not the order they finished', async () => {
    await mount(picker({ state: inventory([space, dinosaurs]) }).tree);
    expect(tileNames(' coloring book')).toEqual([
      'Farm coloring book',
      'Dinosaurs coloring book',
      'Space coloring book',
    ]);
  });

  it('keeps the starter pages under the finger when the first inventory lands mid-open', async () => {
    const loading = { ...owner.snapshot(), status: 'loading', installed: [] };
    await mount(picker({ state: loading }).tree);
    expect(title()).toBe('Farm');
    await act(async () => root.render(picker({ state: inventory([dinosaurs]) }).tree));
    expect(title()).toBe('Farm');
    await act(async () => root.render(picker({ state: inventory([dinosaurs, space]) }).tree));
    expect(control('Back')).toBeNull();
    expect(tileNames(' coloring page')).toEqual(FARM_PAGE_NAMES);
    await act(async () => root.render(null));
    await act(async () => root.render(picker({ state: inventory([dinosaurs, space]) }).tree));
    expect(tileNames(' coloring book')).toEqual([
      'Farm coloring book',
      'Dinosaurs coloring book',
      'Space coloring book',
    ]);
  });

  it('keeps a failed inventory and Retry’s recovered books out of an already open picker', async () => {
    const loading = { ...owner.snapshot(), status: 'loading', installed: [] };
    await mount(picker({ state: loading }).tree);
    for (const state of [
      { ...loading, status: 'failed', fault: 'unavailable' },
      { ...loading, status: 'ready', fault: null },
    ])
      await act(async () => root.render(picker({ state }).tree));
    expect(control('Back')).toBeNull();
    await act(async () => root.render(picker({ state: inventory([dinosaurs]) }).tree));
    expect(control('Back')).toBeNull();
    expect(tileNames(' coloring page')).toEqual(FARM_PAGE_NAMES);
    await act(async () => root.render(null));
    await act(async () => root.render(picker({ state: inventory([dinosaurs]) }).tree));
    expect(control('Dinosaurs coloring book')).not.toBeNull();
  });
});

describe('the picker geometry matches the shipping Coloring Book Picker', () => {
  it('lays out the Book Grid and Coloring Page Grid on the shipping columns', () => {
    const [numerator, denominator] = [4, 5];
    expect(numerator / denominator).toBe(BOOK_GRID_TALL_PORTRAIT_MAX_ASPECT);
    expect(scale.space4).toBe(`${BOOK_GRID_FOLD_SLACK_PX}px`);
  });

  it('draws the Coloring Tile and Active Page Chip with the shipping literals', () => {
    expect(TILE_HOVER_SHADOW).toBe(`0 4px 12px ${rgba(DRAWING_BRAND, 0.25)}`);
    expect(PAGE_TILE_ASPECT).toEqual({ landscape: 3 / 2, portrait: 2 / 3 });
  });
});
