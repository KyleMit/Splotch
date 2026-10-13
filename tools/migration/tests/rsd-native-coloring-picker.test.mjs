import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { records, host, root, mount } from './rsd-native-selection-host.mjs';
import {
  RsdColoringBookPicker,
  TILE_SWAP_GUARD_MS,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdColoringBookPicker.tsx';
import { STATUS_LINE_HEIGHT } from '../../../experiments/native-architecture/src/rsdDrawing/RsdColoringSection.tsx';
import { LibraryProvider } from '../../../experiments/native-architecture/src/offlineLibrary/LibraryScope.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { catalogPack } from '../../../experiments/native-architecture/src/offlineLibrary/catalog.ts';
import { OFFLINE_BOOKS } from '../../../experiments/native-architecture/src/offlineLibrary/books.generated.ts';
import { offlinePageId } from '../../../experiments/native-architecture/src/offlineLibrary/identity.ts';
import { createOfflineLibrary } from '../../../experiments/native-architecture/src/offlineLibrary/controller.ts';
import {
  BUNDLED_FARM_COVERS,
  BUNDLED_FARM_SELECTORS,
} from '../../../experiments/native-architecture/src/drawing/bundledFarm/pickerImages.ts';
import { FARM_PAGE_IDS } from '../../../experiments/native-architecture/src/drawing/bundledBooks.ts';
import { COLORING_PAGES } from '../../../experiments/native-architecture/src/drawing/pages.ts';
import { scale } from '../../../web/src/lib/design/tokens.ts';
import {
  CARD_HEIGHT_CAP_FRACTION,
  COLORING_HEADER_GAP_PX,
  COLORING_MAX_WIDTH_PX,
  COLORING_NARROW_MAX_WIDTH_PX,
  COLORING_PADDING_PX,
  COLORING_PHONE_MAX_WIDTH_PX,
} from '../../../experiments/native-architecture/src/rsdDrawing/modalGeometry.ts';
import {
  BOOK_GRID_COLUMNS,
  BOOK_GRID_FOLD_SLACK_PX,
  BOOK_GRID_FOUR_COLUMN_MIN_WIDTH_PX,
  BOOK_GRID_MAX_WIDTH_PX,
  BOOK_GRID_ROWS_IN_VIEW,
  BOOK_GRID_TALL_PORTRAIT_MAX_ASPECT,
  COLORING_GRID_GAP_PX,
  COVER_CAPTION_HEIGHT_PX,
  PAGE_GRID_COLUMNS,
  PAGE_TILE_ASPECT,
  TILE_ART_INSET_PX,
} from '../../../experiments/native-architecture/src/rsdDrawing/coloringGrid.ts';
import {
  TILE_BORDER_PX,
  TILE_HOVER_LIFT_PX,
  TILE_HOVER_SHADOW,
  TILE_PRESSED_SCALE,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdColoringTile.tsx';
import {
  ACTIVE_PAGE_CLEAR_PADDING_PX,
  ACTIVE_PAGE_CLEAR_PX,
  ACTIVE_PAGE_NAME_HIDDEN_MAX_WIDTH_PX,
  ACTIVE_PAGE_NAME_MAX_CH,
  ACTIVE_PAGE_THUMBNAIL_PX,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdActivePageChip.tsx';
import { COLORING_SECTION_COPY } from '../../../experiments/native-architecture/src/settings/coloringSection.ts';
import { rgba } from '../../../experiments/native-architecture/src/rsdDrawing/colorMix.ts';
import { DRAWING_BRAND } from '../../../experiments/native-architecture/src/drawing/theme.ts';

const dinosaurs = catalogPack('dinosaur', 'full');
const space = catalogPack('space', 'full');
const owner = createOfflineLibrary({ uri: (path) => `file:///private/library/${path}` }, 'full');
const PHONE = { width: 390, height: 844, scale: 1, fontScale: 1 };
const TABLET_LANDSCAPE = { width: 1366, height: 1024, scale: 1, fontScale: 1 };
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
  it('ignores the rest of a tap burst that swapped the grid, then picks normally', async () => {
    const { tree, onChoose } = picker({ state: inventory([dinosaurs]) });
    await mount(tree);
    await press('Farm coloring book');
    clock += TILE_SWAP_GUARD_MS - 1;
    await press('Cat coloring page');
    expect(onChoose).not.toHaveBeenCalled();
    clock += 1;
    await press('Cat coloring page');
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('farm/cat');
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
    expect(title()).toBe('Farm');
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
    await press('Back');
    expect(tileNames(' coloring book')).toEqual(['Farm coloring book', 'Dinosaurs coloring book']);
  });

  it('holds nothing from a failed inventory or Retry’s interim ready, then lists the recovered one', async () => {
    const loading = { ...owner.snapshot(), status: 'loading', installed: [] };
    await mount(picker({ state: loading }).tree);
    for (const state of [
      { ...loading, status: 'failed', fault: 'unavailable' },
      { ...loading, status: 'ready', fault: null },
    ])
      await act(async () => root.render(picker({ state }).tree));
    expect(control('Back')).toBeNull();
    await act(async () => root.render(picker({ state: inventory([dinosaurs]) }).tree));
    await press('Back');
    expect(control('Dinosaurs coloring book')).not.toBeNull();
  });
});

const read = (path) => readFileSync(join(import.meta.dirname, '../../..', path), 'utf8');
const style = (path) =>
  /<style>([\s\S]*)<\/style>/.exec(read(path))[1].replace(/\/\*[\s\S]*?\*\//g, '');
const PICKER = style('web/src/lib/components/ColoringBook.svelte');
const TILE = style('web/src/lib/components/ColoringTile.svelte');
const CHIP = style('web/src/lib/components/ActivePageChip.svelte');
const SECTION = 'web/src/lib/components/settings/ColoringSection.svelte';
const px = (value) => {
  const token = /^var\(--space-(\d)\)$/.exec(value.trim());
  return Number.parseFloat(token ? scale[`space${token[1]}`] : value);
};
// The declarations of the first `selector {` rule after `from` (a media query, say).
function rule(source, selector, from = '') {
  const start = source.indexOf(from);
  expect(start, from).toBeGreaterThanOrEqual(0);
  const open = source.indexOf(`${selector} {`, start);
  expect(open, `${from} ${selector}`).toBeGreaterThanOrEqual(0);
  return source.slice(open, source.indexOf('}', open));
}
function declaration(block, property) {
  const value = new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;]+);`).exec(block)?.[1];
  expect(value, property).toBeDefined();
  return value.replace(/\s+/g, ' ').trim();
}

describe('the picker geometry matches the shipping Coloring Book Picker', () => {
  it('sizes and pads the card as ColoringBook.svelte does', () => {
    const card = rule(PICKER, '.coloring-book-modal');
    expect(declaration(card, 'max-width')).toBe(`${COLORING_MAX_WIDTH_PX}px`);
    expect(declaration(card, '--coloring-book-modal-max-height')).toBe(
      `${CARD_HEIGHT_CAP_FRACTION * 100}vh`
    );
    expect(px(declaration(rule(PICKER, '.coloring-book-content'), 'padding'))).toBe(
      COLORING_PADDING_PX.roomy
    );
    const phone = `@media (max-width: ${COLORING_PHONE_MAX_WIDTH_PX}px)`;
    const [block, inline] = declaration(rule(PICKER, '.coloring-book-content', phone), 'padding')
      .split(' ')
      .map(px);
    expect({ block, inline }).toEqual({
      block: COLORING_PADDING_PX.phoneBlock,
      inline: COLORING_PADDING_PX.phoneInline,
    });
    const narrow = `@media (max-width: ${COLORING_NARROW_MAX_WIDTH_PX}px)`;
    expect(px(declaration(rule(PICKER, '.coloring-book-content', narrow), 'padding-inline'))).toBe(
      COLORING_PADDING_PX.narrowInline
    );
    expect(declaration(rule(PICKER, '.coloring-book-header h2', narrow), 'font-size')).toBe(
      'var(--font-size-md)'
    );
    expect(px(declaration(rule(PICKER, '.coloring-book-header'), 'margin-bottom'))).toBe(
      COLORING_HEADER_GAP_PX
    );
  });

  it('lays out the Book Grid and Coloring Page Grid on the shipping columns', () => {
    const books = rule(PICKER, '.coloring-books-grid');
    expect(Number(declaration(books, '--book-cols'))).toBe(BOOK_GRID_COLUMNS.wide);
    expect(declaration(books, '--book-grid-max-width')).toBe(`${BOOK_GRID_MAX_WIDTH_PX}px`);
    const orphan = rule(
      PICKER,
      '.coloring-books-grid.book-grid-has-orphan',
      `@media (min-width: ${BOOK_GRID_FOUR_COLUMN_MIN_WIDTH_PX}px)`
    );
    expect(Number(declaration(orphan, '--book-cols'))).toBe(BOOK_GRID_COLUMNS.orphan);
    const tablet = `@media (max-width: ${BOOK_GRID_FOUR_COLUMN_MIN_WIDTH_PX - 1}px)`;
    expect(Number(declaration(rule(PICKER, '.coloring-books-grid', tablet), '--book-cols'))).toBe(
      BOOK_GRID_COLUMNS.tablet
    );
    const phone = `@media (max-width: ${COLORING_PHONE_MAX_WIDTH_PX}px)`;
    expect(Number(declaration(rule(PICKER, '.coloring-books-grid', phone), '--book-cols'))).toBe(
      BOOK_GRID_COLUMNS.phone
    );
    expect(px(declaration(rule(PICKER, '.coloring-grid', phone), 'gap'))).toBe(
      COLORING_GRID_GAP_PX.phone
    );
    expect(px(declaration(rule(PICKER, '.coloring-grid'), 'gap'))).toBe(COLORING_GRID_GAP_PX.roomy);
    const [numerator, denominator] = [4, 5];
    expect(numerator / denominator).toBe(BOOK_GRID_TALL_PORTRAIT_MAX_ASPECT);
    const tall = rule(
      PICKER,
      '.coloring-books-grid,\n    .coloring-books-grid.book-grid-has-orphan',
      `@media (max-aspect-ratio: ${numerator} / ${denominator}) and (min-width: ${BOOK_GRID_FOUR_COLUMN_MIN_WIDTH_PX}px)`
    );
    expect(Number(declaration(tall, '--book-cols'))).toBe(BOOK_GRID_COLUMNS.tallPortrait);
    expect(Number(declaration(tall, '--book-grid-rows-in-view'))).toBe(BOOK_GRID_ROWS_IN_VIEW);
    expect(declaration(tall, '--book-grid-chrome')).toMatch(/\+ var\(--space-4\) \)$/);
    expect(scale.space4).toBe(`${BOOK_GRID_FOLD_SLACK_PX}px`);
    expect(Number(declaration(rule(PICKER, '.coloring-pages-grid'), '--page-cols'))).toBe(
      PAGE_GRID_COLUMNS.landscape
    );
    expect(
      Number(declaration(rule(PICKER, '.coloring-pages-grid.portrait-pages'), '--page-cols'))
    ).toBe(PAGE_GRID_COLUMNS.portrait);
    expect(
      Number(declaration(rule(PICKER, '.coloring-pages-grid.portrait-pages', phone), '--page-cols'))
    ).toBe(PAGE_GRID_COLUMNS.phonePortrait);
  });

  it('draws the Coloring Tile and Active Page Chip with the shipping literals', () => {
    const tile = rule(TILE, '.coloring-tile');
    expect(declaration(tile, 'border')).toBe(`${TILE_BORDER_PX}px solid var(--border-warm-strong)`);
    expect(declaration(tile, 'border-radius')).toBe('var(--radius-md)');
    expect(declaration(rule(TILE, '.coloring-tile:global(.activation-pending)'), 'transform')).toBe(
      `scale(${TILE_PRESSED_SCALE})`
    );
    const hover = rule(TILE, '.coloring-tile.hover-armed:hover');
    expect(declaration(hover, 'transform')).toBe(`translateY(-${TILE_HOVER_LIFT_PX}px)`);
    expect(declaration(hover, 'box-shadow')).toBe(
      '0 4px 12px color-mix(in srgb, var(--brand) 25%, transparent)'
    );
    expect(TILE_HOVER_SHADOW).toBe(`0 4px 12px ${rgba(DRAWING_BRAND, 0.25)}`);
    expect(px(declaration(rule(TILE, '.coloring-tile img'), 'padding'))).toBe(TILE_ART_INSET_PX);
    expect(declaration(rule(TILE, '.coloring-book-tile'), '--cover-caption-height')).toBe(
      `${COVER_CAPTION_HEIGHT_PX}px`
    );
    for (const [orientation, ratio] of [
      ['landscape', '3 / 2'],
      ['portrait', '2 / 3'],
    ])
      expect(declaration(rule(TILE, `.coloring-tile.page-${orientation}`), 'aspect-ratio')).toBe(
        ratio
      );
    expect(PAGE_TILE_ASPECT).toEqual({ landscape: 3 / 2, portrait: 2 / 3 });
    const chip = rule(CHIP, '.active-page-chip');
    expect(declaration(chip, '--active-page-thumbnail-size')).toBe(`${ACTIVE_PAGE_THUMBNAIL_PX}px`);
    expect(declaration(chip, '--active-page-clear-size')).toBe(`${ACTIVE_PAGE_CLEAR_PX}px`);
    expect(px(declaration(rule(CHIP, '.active-page-clear'), 'padding'))).toBe(
      ACTIVE_PAGE_CLEAR_PADDING_PX
    );
    expect(declaration(rule(CHIP, '.active-page-name'), 'max-width')).toBe(
      `${ACTIVE_PAGE_NAME_MAX_CH}ch`
    );
    expect(CHIP).toContain(`@media (max-width: ${ACTIVE_PAGE_NAME_HIDDEN_MAX_WIDTH_PX}px)`);
  });

  it('holds tiles for the shipping launch guard and words Settings › Coloring as shipping does', () => {
    expect(read('web/src/lib/actions/launchGuard.ts')).toContain(
      `export const LAUNCH_ZONE_DURATION_MS = ${TILE_SWAP_GUARD_MS};`
    );
    const section = read(SECTION);
    expect(
      declaration(rule(style(SECTION), '.pack-summary p,\n  .remove-error'), 'line-height')
    ).toBe(String(STATUS_LINE_HEIGHT));
    for (const copy of Object.values(COLORING_SECTION_COPY))
      expect(section.replaceAll(/\s+/g, ' '), copy).toContain(copy);
  });
});
