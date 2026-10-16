import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { host, mount, records, root } from './rsd-native-selection-host.mjs';
import {
  BACK_BLOB_PX,
  BACK_ICON_PX,
  CRAYON_LABELS,
  NOT_FOUND_COPY,
  NOT_FOUND_MARK_PX,
  NOT_FOUND_MARK_TURN_DEG,
  PAGE_FRAMED_MAX_WIDTH_PX,
  PAGE_GUTTER,
  PAGE_SHEET_MAX_WIDTH_PX,
  RsdNotFoundPage,
  RsdPageSheet,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdNotFoundPage.tsx';

import { PHONE_MAX_WIDTH_PX, SHORT_PAGE_HEIGHT_PX } from '../../../web/src/lib/breakpoints.ts';
import { scale, themes } from '../../../web/src/lib/design/tokens.ts';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';

const REPOSITORY = join(import.meta.dirname, '../../..');
const read = (path) => readFileSync(join(REPOSITORY, path), 'utf8').replace(/\s+/g, ' ');
const SHORT_NOT_FOUND_MARK_PX = Number(
  read('web/src/lib/components/page/NotFoundPage.svelte')
    .split(`@media (max-height: ${SHORT_PAGE_HEIGHT_PX}px)`)[1]
    .match(/width: (\d+)px/)[1]
);

describe("the web export's not-found page", () => {
  it('keeps the copy and literals NotFoundPage and PageShell declare', () => {
    const page = read('web/src/lib/components/page/NotFoundPage.svelte');
    expect(page).toContain(`<title>${NOT_FOUND_COPY.documentTitle}</title>`);
    expect(page).toContain(`title="${NOT_FOUND_COPY.title}"`);
    expect(page).toContain(`{#snippet lede()}${NOT_FOUND_COPY.lede}{/snippet}`);
    for (const label of [
      NOT_FOUND_COPY.startDrawing,
      NOT_FOUND_COPY.changelog,
      NOT_FOUND_COPY.privacy,
    ])
      expect(page).toContain(`>${label}</Button>`);
    expect(page).toContain(
      `width: ${NOT_FOUND_MARK_PX}px; height: ${NOT_FOUND_MARK_PX}px; transform: rotate(${NOT_FOUND_MARK_TURN_DEG}deg);`
    );
    expect(read('web/src/lib/components/page/backLabel.ts')).toContain(
      `COLD_VISIT_LABEL: BackLabel = '${NOT_FOUND_COPY.startDrawing}';`
    );
    const shell = read('web/src/lib/components/page/PageShell.svelte');
    const { minPx, viewportWidthPercent, maxPx } = PAGE_GUTTER;
    expect(shell).toContain(
      `--page-gutter: clamp(${minPx}px, ${viewportWidthPercent}vw, ${maxPx}px);`
    );
    expect(shell).toContain(`max-width: ${PAGE_SHEET_MAX_WIDTH_PX}px;`);
    expect(shell).toContain(`@media (max-width: ${PAGE_FRAMED_MAX_WIDTH_PX}px)`);
    const back = read('web/src/lib/components/page/BackLink.svelte');
    expect(back).toContain(`width: ${BACK_BLOB_PX}px;`);
    expect(back).toContain(`width: ${BACK_ICON_PX}px;`);
    const strip = read('web/src/lib/components/CrayonStrip.svelte');
    expect(strip).toContain(
      `const CRAYON_LABELS: PaletteLabel[] = [ ${CRAYON_LABELS.map((label) => `'${label}',`).join(' ')} ];`
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
  const [topbar, hero] = sheet.children;
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

it('pins the shipping short-height sheet, compact hero and optional lede disclosure', () => {
  const shell = read('web/src/lib/components/page/PageShell.svelte');
  const short = shell.slice(shell.lastIndexOf(`@media (max-height: ${SHORT_PAGE_HEIGHT_PX}px)`));
  expect(short).toContain('.sheet { padding: 0 var(--space-7) 36px; }');
  expect(short).toContain('.topbar { padding: 10px 0; }');
  expect(short).toContain('.hero { padding: var(--space-1) 0 var(--space-4); }');
  expect(short).toContain(
    'font-size: var(--font-size-xl); line-height: 1.2; letter-spacing: -0.01em;'
  );
  expect(shell).toContain('About this page');
  expect(short).toContain('.lede-toggle { display: inline-flex; }');
  expect(short).toContain('.lede.collapsed { display: none; }');
  expect(short).toContain('.page { padding-left: 0; padding-right: 0; }');
  expect(read('web/src/lib/components/page/NotFoundPage.svelte')).toContain(
    'collapsibleLede={false}'
  );
  const back = read('web/src/lib/components/page/BackLink.svelte');
  expect(back.slice(back.lastIndexOf(`@media (max-height: ${SHORT_PAGE_HEIGHT_PX}px)`))).toContain(
    '.back { margin-block: -10px; } .back-blob { width: 36px; height: 36px; }'
  );
});

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
  { height: SHORT_PAGE_HEIGHT_PX, mark: SHORT_NOT_FOUND_MARK_PX, gap: 'space4' },
  { height: SHORT_PAGE_HEIGHT_PX + 1, mark: NOT_FOUND_MARK_PX, gap: 'space6' },
])(
  'uses shipping’s not-found mascot and body gap at height $height',
  async ({ height, mark, gap }) => {
    const shipping = read('web/src/lib/components/page/NotFoundPage.svelte');
    const compact = shipping.slice(
      shipping.lastIndexOf(`@media (max-height: ${SHORT_PAGE_HEIGHT_PX}px)`)
    );
    expect(compact).toContain(
      `width: ${SHORT_NOT_FOUND_MARK_PX}px; height: ${SHORT_NOT_FOUND_MARK_PX}px;`
    );
    expect(compact).toContain('gap: var(--space-4);');
    records.dimensions = { width: 844, height, scale: 1, fontScale: 1 };
    records.journalHostProps = true;
    await mount(createElement(RsdNotFoundPage));
    const body = host.querySelector('[data-testid="information-page-body"]').firstElementChild;
    const mascot = body.firstElementChild.querySelector('svg');
    expect(mascot.getAttribute('width')).toBe(String(mark));
    expect(mascot.getAttribute('height')).toBe(String(mark));
    expect(sheetStyle(body).gap).toBe(Number.parseFloat(scale[gap]));
  }
);

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
