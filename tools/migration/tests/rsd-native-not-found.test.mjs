import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { host, mount, records, root } from './rsd-native-selection-host.mjs';
import {
  BACK_BLOB_PX,
  CRAYON_LABELS,
  NOT_FOUND_COPY,
  RsdNotFoundPage,
  RsdPageSheet,
} from '../../../src/rsdDrawing/RsdNotFoundPage.tsx';

import {
  BREAKPOINT_EPSILON_PX,
  NARROW_PHONE_MIN_WIDTH_PX,
  PHONE_MAX_WIDTH_PX,
  SHORT_PAGE_HEIGHT_PX,
} from '../../../src/lib/breakpoints.ts';
import { scale, themes } from '../../../src/lib/design/tokens.ts';
import { DrawingAppearanceProvider } from '../../../src/drawing/DrawingAppearance.tsx';

const REPOSITORY = join(import.meta.dirname, '../../..');
const read = (path) => readFileSync(join(REPOSITORY, path), 'utf8').replace(/\s+/g, ' ');

describe("the web export's not-found page", () => {
  it('keeps the copy and literals NotFoundPage and PageShell declare', () => {
    expect(read('src/lib/components/page/backLabel.ts')).toContain(
      `COLD_VISIT_LABEL: BackLabel = '${NOT_FOUND_COPY.startDrawing}';`
    );
  });

  // Negative control: a page padded by its breakpoint spacing alone puts the masthead under the
  // status bar.
  it('pads every breakpoint by the safe area, as PageShell does', async () => {
    const insets = { top: 47, right: 0, bottom: 34, left: 0 };
    const flat = (style) =>
      Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style;
    const padding = () => {
      const page = records.props
        .map((props) => flat(props.style))
        .findLast(
          (style) => style?.flexGrow === 1 && style.alignItems === 'center' && 'paddingTop' in style
        );
      return [page.paddingTop, page.paddingRight, page.paddingBottom, page.paddingLeft];
    };
    records.insets = insets;
    records.dimensions = { width: 402, height: 874, scale: 1, fontScale: 1 };
    await mount(createElement(RsdNotFoundPage));
    expect(padding()).toEqual([47, 0, 34, 0]);
    records.dimensions = { width: 1366, height: 1024, scale: 1, fontScale: 1 };
    records.insets = { top: 24, right: 0, bottom: 20, left: 0 };
    records.props.length = 0;
    await mount(createElement(RsdNotFoundPage));
    expect(padding()).toEqual([32 + 24, 16, 72 + 20, 16]);
  });

  it('offers the way back to drawing under the shipping title', async () => {
    await mount(createElement(RsdNotFoundPage));
    expect(host.textContent).toContain(NOT_FOUND_COPY.title);
    expect(host.textContent).toContain(NOT_FOUND_COPY.lede);
    const starts = [...host.querySelectorAll('button')].filter((node) =>
      node.textContent.includes(NOT_FOUND_COPY.startDrawing)
    );
    expect(starts).toHaveLength(2);
    expect(host.textContent).toContain(NOT_FOUND_COPY.wordmark);
  });
});

const sheetStyle = (node) => JSON.parse(node.getAttribute('data-committed-props')).style;
const pageTree = (theme = 'light', props = {}) =>
  createElement(
    DrawingAppearanceProvider,
    { preference: theme },
    createElement(
      RsdPageSheet,
      { title: 'Privacy policy', lede: 'The complete privacy introduction.', ...props },
      createElement('div', { 'data-testid': 'reading-content' }, 'Reading content')
    )
  );
const pageParts = () => {
  const page = host.querySelector('[data-testid="information-page-scroll"]').firstElementChild;
  const sheet = page.firstElementChild;
  const [topbar, heroHost] = sheet.children;
  const hero = heroHost.firstElementChild;
  const title = hero.querySelector('[role="heading"]');
  const heroText = title.parentElement;
  return {
    page,
    sheet,
    topbar,
    hero,
    heroText,
    title,
    lede: heroText.lastElementChild,
    toggle: [...heroText.querySelectorAll('button')].find(
      (node) => node.textContent === 'About this page'
    ),
  };
};

it.each([
  { width: 360, crayons: false },
  { width: NARROW_PHONE_MIN_WIDTH_PX - BREAKPOINT_EPSILON_PX, crayons: false },
  { width: NARROW_PHONE_MIN_WIDTH_PX - BREAKPOINT_EPSILON_PX / 2, crayons: true },
  { width: NARROW_PHONE_MIN_WIDTH_PX, crayons: true },
  { width: 1024, crayons: true },
])('keeps shipping’s masthead decoration at width $width', async ({ width, crayons }) => {
  records.dimensions = { width, height: 874, scale: 1, fontScale: 1 };
  await mount(pageTree('light', { backLabel: 'Back to drawing' }));
  const brand = pageParts().topbar.lastElementChild;
  expect(brand.textContent).toBe(NOT_FOUND_COPY.wordmark);
  expect(brand.childElementCount).toBe(crayons ? 2 : 1);
  expect(brand.firstElementChild.childElementCount).toBe(crayons ? CRAYON_LABELS.length : 0);
  expect(pageParts().topbar.firstElementChild.textContent).toBe('Back to drawing');
});

// Issue 3108: at Android font scale 1.6 the back label left the mark too little room, and its
// word broke as "SPLOTC / H"; at 2.0 it stacked one letter per line.
it.each(['ios', 'android'])(
  'moves the %s masthead mark to its own trailing row rather than breaking its word',
  async (os) => {
    records.os = os;
    records.dimensions = { width: 384, height: 874, scale: 1, fontScale: 2 };
    records.journalHostProps = true;
    await mount(pageTree('light', { backLabel: 'Back to drawing' }));
    const { topbar } = pageParts();
    const brand = topbar.lastElementChild;
    expect(brand.textContent).toBe(NOT_FOUND_COPY.wordmark);
    expect(sheetStyle(topbar)).toMatchObject({ flexWrap: 'wrap', justifyContent: 'space-between' });
    expect(sheetStyle(brand).marginStart).toBe('auto');
    expect(sheetStyle(topbar.firstElementChild).flexShrink).toBe(0);
  }
);

it.each(
  ['light', 'dark'].flatMap((theme) => [
    {
      theme,
      width: 402,
      height: SHORT_PAGE_HEIGHT_PX,
      padding: [59, 0, 58, 0],
      gutter: 20.1,
      sheetTop: 0,
      sheetBottom: 36,
      bar: 10,
      title: 22,
    },
    {
      theme,
      width: 844,
      height: SHORT_PAGE_HEIGHT_PX,
      padding: [59, 33, 58, 31],
      gutter: 32,
      sheetTop: 0,
      sheetBottom: 36,
      bar: 10,
      title: 22,
    },
    {
      theme,
      width: 1366,
      height: SHORT_PAGE_HEIGHT_PX,
      padding: [59, 33, 58, 31],
      gutter: 32,
      sheetTop: 0,
      sheetBottom: 36,
      bar: 10,
      title: 22,
    },
    {
      theme,
      width: 402,
      height: SHORT_PAGE_HEIGHT_PX + 1,
      padding: [47, 9, 34, 7],
      gutter: 20.1,
      sheetTop: 0,
      sheetBottom: 40,
      bar: 18,
      title: 34,
    },
    {
      theme,
      width: 844,
      height: SHORT_PAGE_HEIGHT_PX + 1,
      padding: [71, 33, 58, 31],
      gutter: 34,
      sheetTop: 12,
      sheetBottom: 36,
      bar: 18,
      title: 44.008,
    },
    {
      theme,
      width: 1366,
      height: SHORT_PAGE_HEIGHT_PX + 1,
      padding: [79, 25, 106, 23],
      gutter: 34,
      sheetTop: 0,
      sheetBottom: 40,
      bar: 18,
      title: 46,
    },
  ])
)('uses the shipping reading frame at $width × $height in $theme', async (expected) => {
  records.dimensions = { width: expected.width, height: expected.height, scale: 1, fontScale: 1 };
  records.insets = { top: 47, right: 9, bottom: 34, left: 7 };
  records.journalHostProps = true;
  await mount(pageTree(expected.theme));
  const { page, sheet, topbar, title, toggle } = pageParts();
  const pageStyle = sheetStyle(page);
  expect([
    pageStyle.paddingTop,
    pageStyle.paddingRight,
    pageStyle.paddingBottom,
    pageStyle.paddingLeft,
  ]).toEqual(expected.padding);
  expect(sheetStyle(sheet)).toMatchObject({
    paddingTop: expected.sheetTop,
    paddingLeft: expected.gutter,
    paddingRight: expected.gutter,
    paddingBottom: expected.sheetBottom,
  });
  expect(sheetStyle(topbar)).toMatchObject({
    paddingTop: expected.bar,
    paddingBottom: expected.bar,
  });
  expect(sheetStyle(title).fontSize).toBeCloseTo(expected.title);
  expect(sheetStyle(title).lineHeight).toBeCloseTo(
    expected.title * (expected.height <= SHORT_PAGE_HEIGHT_PX ? 1.2 : 1.08)
  );
  const back = topbar.firstElementChild;
  expect(sheetStyle(back).minHeight).toBe(BACK_BLOB_PX);
  expect(sheetStyle(back.firstElementChild).width).toBe(
    expected.height <= SHORT_PAGE_HEIGHT_PX ? 36 : BACK_BLOB_PX
  );
  expect(toggle).toBeDefined();
  expect(sheetStyle(toggle.firstElementChild)).toMatchObject({
    fontSize: Number.parseFloat(scale.fontSizeSm),
    fontWeight: scale.fontWeightBold,
    color: themes[expected.theme].brandText,
  });
});

it('reveals the compact introduction and retains its state across the height boundary', async () => {
  records.dimensions = { width: 844, height: SHORT_PAGE_HEIGHT_PX, scale: 1, fontScale: 1 };
  records.journalHostProps = true;
  const onBodyOffset = vi.fn();
  const onScroll = vi.fn();
  const tree = () => pageTree('light', { onBodyOffset, onScroll });
  await mount(tree());
  const content = host.querySelector('[data-testid="reading-content"]');
  let parts = pageParts();
  expect(sheetStyle(parts.lede).display).toBe('none');
  expect(
    JSON.parse(parts.toggle.getAttribute('data-committed-props')).accessibilityState.expanded
  ).toBe(false);
  expect(sheetStyle(parts.hero)).toMatchObject({
    paddingTop: Number.parseFloat(scale.space1),
    paddingBottom: Number.parseFloat(scale.space4),
  });
  expect(sheetStyle(parts.heroText)).toMatchObject({
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  });
  records.dimensions = { ...records.dimensions, height: SHORT_PAGE_HEIGHT_PX + 1 };
  await act(async () => root.render(tree()));
  expect(sheetStyle(pageParts().lede).display).not.toBe('none');
  records.dimensions = { ...records.dimensions, height: SHORT_PAGE_HEIGHT_PX };
  await act(async () => root.render(tree()));
  parts = pageParts();
  expect(sheetStyle(parts.lede).display).toBe('none');
  await act(async () => parts.toggle.click());
  parts = pageParts();
  expect(sheetStyle(parts.lede).display).not.toBe('none');
  expect(
    JSON.parse(parts.toggle.getAttribute('data-committed-props')).accessibilityState.expanded
  ).toBe(true);
  expect(sheetStyle(parts.lede)).toMatchObject({
    fontSize: Number.parseFloat(scale.fontSizeMd),
    lineHeight: Number.parseFloat(scale.fontSizeMd) * 1.5,
  });
  expect(host.querySelector('[data-testid="reading-content"]')).toBe(content);
  records.dimensions = { ...records.dimensions, height: SHORT_PAGE_HEIGHT_PX + 1 };
  await act(async () => root.render(tree()));
  parts = pageParts();
  expect(sheetStyle(parts.toggle).display).toBe('none');
  expect(sheetStyle(parts.lede).display).not.toBe('none');
  records.dimensions = { ...records.dimensions, height: SHORT_PAGE_HEIGHT_PX };
  await act(async () => root.render(tree()));
  parts = pageParts();
  expect(sheetStyle(parts.lede).display).not.toBe('none');
  await act(async () => parts.toggle.click());
  expect(sheetStyle(pageParts().lede).display).toBe('none');
  expect(host.querySelector('[data-testid="reading-content"]')).toBe(content);
  expect(onBodyOffset).not.toHaveBeenCalled();
  expect(onScroll).not.toHaveBeenCalled();
});

it('keeps the not-found introduction expanded in the compact page shell', async () => {
  records.dimensions = { width: 844, height: SHORT_PAGE_HEIGHT_PX, scale: 1, fontScale: 1 };
  records.journalHostProps = true;
  await mount(createElement(RsdNotFoundPage));
  const { lede, toggle } = pageParts();
  expect(toggle).toBeUndefined();
  expect(lede.textContent).toBe(NOT_FOUND_COPY.lede);
  expect(sheetStyle(lede).display).not.toBe('none');
});

it.each([
  { width: PHONE_MAX_WIDTH_PX, basis: '100%' },
  { width: PHONE_MAX_WIDTH_PX + 1, basis: undefined },
])('retains the shipping not-found action row at width $width', async ({ width, basis }) => {
  records.dimensions = { width, height: 874, scale: 1, fontScale: 1 };
  records.journalHostProps = true;
  await mount(createElement(RsdNotFoundPage));
  const actions = host.querySelector('[data-testid="information-page-body"] [role="list"]');
  expect([...actions.children].map((node) => node.textContent)).toEqual([
    NOT_FOUND_COPY.startDrawing,
    NOT_FOUND_COPY.changelog,
    NOT_FOUND_COPY.privacy,
  ]);
  expect(sheetStyle(actions)).toMatchObject({
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Number.parseFloat(scale.space3),
  });
  expect(sheetStyle(actions.firstElementChild).flexBasis).toBe(basis);
  expect(host.querySelector('[aria-label="Splotch pages"]')).toBeNull();
  const title = pageParts().title;
  expect(title.style.getPropertyValue('text-wrap')).toBe('');
  expect(pageParts().lede.style.maxWidth).toBe('');
});

it.each([
  { height: SHORT_PAGE_HEIGHT_PX, mark: 56, gap: 'space4' },
  { height: SHORT_PAGE_HEIGHT_PX + 1, mark: 80, gap: 'space6' },
])(
  'uses shipping’s not-found mascot and body gap at height $height',
  async ({ height, mark, gap }) => {
    records.dimensions = { width: 844, height, scale: 1, fontScale: 1 };
    records.journalHostProps = true;
    await mount(createElement(RsdNotFoundPage));
    const body = host.querySelector('[data-testid="information-page-body"]').firstElementChild;
    const mascot = body.firstElementChild.querySelector('svg');
    expect(mascot.getAttribute('width')).toBe(String(mark));
    expect(mascot.getAttribute('height')).toBe(String(mark));
    expect(sheetStyle(body).gap).toBe(Number.parseFloat(scale[gap]));
    expect(sheetStyle(body.firstElementChild).display).toBe('flex');
  }
);
