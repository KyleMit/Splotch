import '../../../experiments/native-architecture/src/rsdDrawing/RsdSidebarRow.props.test.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { host, mount, records, root } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { PAGE_CONTENTS } from '../../../experiments/native-architecture/src/rsdDrawing/RsdPageContents.tsx';
import { PRIVACY_LINK_GEOMETRY } from '../../../experiments/native-architecture/src/rsdDrawing/RsdPrivacyHeading.tsx';
import { scale } from '../../../web/src/lib/design/tokens.ts';
import { DRAWING_THEMES } from '../../../experiments/native-architecture/src/drawing/theme.ts';
import { RsdPrivacyContent } from '../../../experiments/native-architecture/src/rsdDrawing/RsdPrivacyContent.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import privacy from '../../../experiments/native-architecture/src/information/privacy.generated.json';
import { SECTIONS } from '../../../web/src/routes/privacy/contents.ts';
import { COPIED_DURATION_MS } from '../../../web/src/routes/privacy/sectionLink.ts';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { useCaller } from './rsd-native-ai-fixture.mjs';
import { PRIVACY_LAYOUT } from '../../../experiments/native-architecture/src/information/privacyLayout.ts';
const clipboard = vi.hoisted(() => ({
  copy: vi.fn(async () => true),
  replace: vi.fn(),
  launch: null,
}));
vi.mock('../../../experiments/native-architecture/src/platform/privacySectionLink.ts', () => ({
  copyPrivacySection: clipboard.copy,
  replacePrivacyFragment: clipboard.replace,
  privacySectionAtLaunch: () => clipboard.launch,
}));
afterEach(() => {
  vi.useRealTimers();
  clipboard.launch = null;
});
const props = (id) => records.props.findLast((entry) => entry.testID === id);
const layout = (id, y, height) => props(id).onLayout({ nativeEvent: { layout: { y, height } } });
const content = (scrollY, onLink = vi.fn(), onSectionLayout = vi.fn()) =>
  createElement(
    DrawingAppearanceProvider,
    { preference: 'light' },
    createElement(RsdPrivacyContent, {
      policy: privacy.native,
      onLink,
      onSectionLayout,
      scrollY,
    })
  );

it('reserves the shipping final-section scrollport and recalculates it after rotation', async () => {
  const policy = readFileSync(
    join(import.meta.dirname, '../../../web/src/routes/privacy/+page.svelte'),
    'utf8'
  );
  const shell = readFileSync(
    join(import.meta.dirname, '../../../web/src/lib/components/page/PageShell.svelte'),
    'utf8'
  );
  expect(policy).toContain('--page-tail: calc(var(--space-4) + var(--page-footer-reserve));');
  expect(policy).toContain('min-height: calc(100dvh - var(--spy-line) - var(--page-tail));');
  expect(shell).toContain(`--page-footer-reserve: ${PRIVACY_LAYOUT.footerReserve}px;`);
  records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
  await mount(content(0));
  expect(props('privacy-section-contact').style?.minHeight).toBe(540);
  expect(props('privacy-section-children').style?.minHeight).toBeUndefined();
  records.dimensions = { width: 844, height: 390, scale: 1, fontScale: 1 };
  await act(async () => root.render(content(0)));
  expect(props('privacy-section-contact').style?.minHeight).toBe(86);
  records.dimensions = { width: 1366, height: 1024, scale: 1, fontScale: 1 };
  await act(async () => root.render(content(0)));
  expect(props('privacy-section-contact').style?.minHeight).toBe(720);
});

it('pins the desktop contents below the safe top and tracks the section crossing the reading line', async () => {
  records.dimensions = { width: 1366, height: 1024, scale: 1, fontScale: 1 };
  records.insets = { top: 24, right: 0, bottom: 20, left: 0 };
  const jump = vi.fn();
  await mount(content(0, jump));
  expect(host.querySelector('[aria-expanded]')).toBeNull();
  const rail = host.querySelector('[data-testid="privacy-contents-rail"]');
  expect(rail.querySelectorAll('[data-testid="sidebar-row"]')).toHaveLength(SECTIONS.length);
  expect(props('privacy-contents-rail').style.width).toBe(PRIVACY_LAYOUT.railWidth);
  await act(async () => {
    layout('privacy-details', 400, 2000);
    layout('privacy-contents-rail', 0, 400);
    SECTIONS.forEach(({ id }, index) => layout(`privacy-section-${id}`, index * 300, 300));
  });
  await act(async () => root.render(content(600, jump)));
  expect(props('privacy-contents-rail').style.transform).toEqual([{ translateY: 248 }]);
  const activeRow = records.props.findLast(
    (entry) => entry.testID === 'sidebar-row' && entry.accessibilityLabel === SECTIONS[1].label
  );
  expect(activeRow.style.borderLeftWidth).toBe(3);
  await act(async () => rail.querySelectorAll('button')[2].click());
  expect(jump).toHaveBeenCalledWith('#counting');
  await act(async () => root.render(content(4000, jump)));
  expect(props('privacy-contents-rail').style.transform).toEqual([{ translateY: 1600 }]);
});

it('keeps compact contents closed and jumps after its measured collapse without a section resize', async () => {
  records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
  const jump = vi.fn();
  const sectionLayouts = vi.fn();
  await mount(content(0, jump, sectionLayouts));
  expect(props('page-contents-disclosure').style.marginBottom).toBe(PAGE_CONTENTS.inset);
  expect(host.querySelector('[data-testid="privacy-contents-rail"]')).toBeNull();
  const disclosure = host.querySelector('[aria-label="Privacy policy contents, 8 sections"]');
  expect(
    records.props.findLast((entry) => entry.accessibilityState?.expanded !== undefined)
      .accessibilityState.expanded
  ).toBe(false);
  expect(disclosure.textContent).toContain('Contents');
  expect(disclosure.textContent).toContain('8');
  expect(disclosure.textContent).toContain('sections');
  await act(async () => disclosure.click());
  const nav = host.querySelector('[aria-label="Privacy policy contents"]');
  expect(nav.querySelectorAll('[data-testid="sidebar-row"]')).toHaveLength(SECTIONS.length);
  await act(async () => {
    layout('privacy-details', 700, 2000);
    layout('page-contents-disclosure', 300, 386);
    SECTIONS.forEach(({ id }, index) => layout(`privacy-section-${id}`, index * 300, 300));
  });
  await act(async () => nav.querySelectorAll('[data-testid="sidebar-row"]')[5].click());
  expect(host.querySelector('[aria-label="Privacy policy contents"]')).toBeNull();
  expect(jump).not.toHaveBeenCalled();
  sectionLayouts.mockClear();
  await act(async () => {
    layout('page-contents-disclosure', 300, 86);
  });
  expect(sectionLayouts).toHaveBeenCalledWith('hosting', 300 + 86 + PAGE_CONTENTS.inset + 5 * 300);
  expect(jump).toHaveBeenCalledWith('#hosting');
  const targetReport = sectionLayouts.mock.calls.findIndex(([id]) => id === 'hosting');
  expect(sectionLayouts.mock.invocationCallOrder[targetReport]).toBeLessThan(
    jump.mock.invocationCallOrder[0]
  );
  await act(async () => root.render(content(700, jump)));
  expect(props('page-contents-disclosure').style.transform).toEqual([{ translateY: 400 }]);
  expect(
    host.querySelector('[aria-label="Privacy policy contents, Making an AI picture"]')
  ).not.toBeNull();
});

// Issue 3108: React Native ignores whiteSpace and textOverflow, so on Android the readout wrapped
// inside the fixed-height row, which clipped its second line ("What stays on your device").
it.each(['ios', 'android'])(
  'truncates the %s compact readout to one line in a row that grows with the OS font',
  async (os) => {
    records.os = os;
    records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 2 };
    records.journalHostProps = true;
    await mount(content(0));
    const readout = () => {
      const summary = host.querySelector('[aria-label^="Privacy policy contents, "]');
      const label = [...summary.querySelectorAll('span')].at(-2);
      return { text: label.textContent, ...JSON.parse(label.getAttribute('data-committed-props')) };
    };
    expect(readout()).toMatchObject({ text: 'sections', numberOfLines: 1 });
    const summary = records.props.findLast(
      (entry) => entry.accessibilityState?.expanded !== undefined
    ).style;
    expect(summary).toMatchObject({ minHeight: PAGE_CONTENTS.row, width: '100%' });
    expect(summary.height).toBeUndefined();
    await act(async () => {
      layout('privacy-details', 700, 2000);
      layout('page-contents-disclosure', 300, 86);
      SECTIONS.forEach(({ id }, index) => layout(`privacy-section-${id}`, index * 300, 300));
    });
    await act(async () => root.render(content(700)));
    expect(readout()).toMatchObject({ text: SECTIONS[1].label, numberOfLines: 1 });
  }
);

it('renders the shipping metadata row and compact contents geometry', async () => {
  const policy = readFileSync(
    join(import.meta.dirname, '../../../web/src/routes/privacy/+page.svelte'),
    'utf8'
  );
  const toc = readFileSync(
    join(import.meta.dirname, '../../../web/src/lib/components/nav/TocDisclosure.svelte'),
    'utf8'
  );
  const pageShell = readFileSync(
    join(import.meta.dirname, '../../../web/src/lib/components/page/PageShell.svelte'),
    'utf8'
  );
  const pageRule = readFileSync(
    join(import.meta.dirname, '../../../web/src/lib/components/page/RuleLabel.svelte'),
    'utf8'
  );
  expect(pageShell).toContain('line-height: 1.62;');
  expect(pageRule).toContain('padding-bottom: var(--space-5);');
  expect(policy).toContain('gap: 10px;');
  expect(policy).toContain('margin: calc(-1 * var(--space-4)) 0 var(--space-6);');
  expect(toc).toContain(`--toc-row-height: ${PAGE_CONTENTS.row}px;`);
  expect(toc).toContain(`--toc-shell-border-width: ${PAGE_CONTENTS.border}px;`);
  expect(toc).toContain(`--toc-panel-min: ${PAGE_CONTENTS.panelMin}px;`);
  expect(toc).toContain(`width: ${PAGE_CONTENTS.count}px;`);
  expect(toc).toContain(`height: ${PAGE_CONTENTS.mark}px;`);
  await mount(content(0));
  const meta = records.props.findLast((entry) => entry.testID === 'privacy-updated');
  expect(meta.style).toMatchObject({
    gap: 10,
    marginTop: -Number.parseFloat(scale.space4),
    marginBottom: Number.parseFloat(scale.space6),
  });
  const shell = records.props.findLast((entry) => entry.testID === 'page-contents-shell');
  expect(shell.style).toMatchObject({
    borderWidth: 2,
    borderRadius: Number.parseFloat(scale.radiusMd),
  });
  expect(props('privacy-updated-dot').style).toMatchObject({
    alignItems: 'center',
    justifyContent: 'center',
  });
  expect(props('privacy-short-version-label').style.paddingBottom).toBe(
    Number.parseFloat(scale.space5)
  );
  expect(props('privacy-details-label').style.paddingBottom).toBe(Number.parseFloat(scale.space5));
  expect(
    records.props.some(
      (entry) => entry.style?.fontSize === 16 && entry.style?.lineHeight === 16 * 1.62
    )
  ).toBe(true);
  expect(host.textContent).toContain(privacy.native.updated);
});

function expectForegroundGlyph(anchor) {
  const [mark, glyph] = anchor.children;
  const background = JSON.parse(mark.getAttribute('data-committed-props')).style;
  const foreground = JSON.parse(glyph.getAttribute('data-committed-props')).style;
  expect(background.position).toBe('absolute');
  expect(foreground.position).toBe('relative');
  expect(foreground.zIndex ?? 0).toBeGreaterThanOrEqual(background.zIndex ?? 0);
  return glyph;
}

it.each([
  ['light', 'compact', 390, 844],
  ['dark', 'compact', 390, 844],
  ['light', 'wide', 1366, 1024],
  ['dark', 'wide', 1366, 1024],
])(
  'keeps the %s %s section-link glyph above its blob through copying and timeout',
  async (theme, _, width, height) => {
    vi.useFakeTimers();
    records.journalHostProps = true;
    records.dimensions = { width, height, scale: 1, fontScale: 1 };
    clipboard.copy.mockClear().mockResolvedValue(true);
    clipboard.replace.mockClear();
    const jump = vi.fn();
    await mount(
      createElement(
        DrawingAppearanceProvider,
        { preference: theme },
        createElement(RsdPrivacyContent, {
          policy: privacy.native,
          onLink: jump,
          onSectionLayout: vi.fn(),
          scrollY: 0,
        })
      )
    );
    const anchor = host.querySelector(`[aria-label='Copy link to “${SECTIONS[0].label}”']`);
    const glyph = expectForegroundGlyph(anchor);
    expect(glyph.textContent).toBe('#');
    const palette = DRAWING_THEMES[theme];
    expect(anchor.querySelector('path').getAttribute('fill')).toBe(palette.brandWash);
    await act(async () => anchor.click());
    expect(clipboard.copy).toHaveBeenCalledOnce();
    expect(clipboard.copy).toHaveBeenCalledWith('on-device');
    expect(clipboard.replace).toHaveBeenCalledOnce();
    expect(clipboard.replace).toHaveBeenCalledWith('on-device');
    expect(jump).not.toHaveBeenCalled();
    expect(host.querySelector('[role="status"]').textContent).toBe(
      'Link to “What stays on your device” copied.'
    );
    expect(expectForegroundGlyph(anchor)).toBe(glyph);
    expect(glyph.textContent).toBe('');
    expect(anchor.querySelector('path').getAttribute('fill')).toBe(palette.successWash);
    await vi.waitFor(() =>
      expect(glyph.querySelector('svg[data-xml]').dataset.xml).toContain(palette.successText)
    );
    const check = glyph.querySelector('svg[data-xml]');
    expect([check.getAttribute('width'), check.getAttribute('height')]).toEqual([
      String(PRIVACY_LINK_GEOMETRY.icon),
      String(PRIVACY_LINK_GEOMETRY.icon),
    ]);
    await act(async () => vi.advanceTimersByTime(COPIED_DURATION_MS));
    expect(host.querySelector('[role="status"]').textContent).toBe('');
    expect(expectForegroundGlyph(anchor)).toBe(glyph);
    expect(glyph.textContent).toBe('#');
    expect(glyph.querySelector('svg[data-xml]')).toBeNull();
    expect(anchor.querySelector('path').getAttribute('fill')).toBe(palette.brandWash);
  }
);

it('keeps section navigation available when clipboard writing is unavailable', async () => {
  clipboard.copy.mockResolvedValue(false);
  clipboard.replace.mockClear();
  const jump = vi.fn();
  await mount(content(0, jump));
  await act(async () =>
    host.querySelector(`[aria-label='Copy link to “${SECTIONS[5].label}”']`).click()
  );
  expect(jump).toHaveBeenCalledWith('#hosting');
  expect(clipboard.replace).not.toHaveBeenCalled();
  expect(host.querySelector('[role="status"]').textContent).toBe('');
});

it('opens an incoming privacy fragment only after both the body and target section are measured', async () => {
  clipboard.launch = 'hosting';
  useCaller();
  await mount(createElement(RsdDrawingScreen, { page: 'privacy' }));
  const scroll = host.querySelector('[data-testid="information-page-scroll"]');
  scroll.scrollTo = vi.fn();
  await act(async () => {
    layout('information-page-body', 200, 2000);
    layout('privacy-details', 500, 2000);
    layout('privacy-section-hosting', 1500, 300);
  });
  expect(scroll.scrollTo).toHaveBeenLastCalledWith({ y: 2104, animated: false });
});

it('pins the section-link target, blob, icon and heading spacing to shipping', () => {
  const heading = readFileSync(
    join(import.meta.dirname, '../../../web/src/routes/privacy/SectionHeading.svelte'),
    'utf8'
  );
  expect(heading).toContain(`--section-link-size: ${PRIVACY_LINK_GEOMETRY.target}px;`);
  expect(heading).toContain(`width: ${PRIVACY_LINK_GEOMETRY.blob}px;`);
  expect(heading).toContain(`height: ${PRIVACY_LINK_GEOMETRY.blob}px;`);
  expect(heading).toContain(`margin-bottom: ${PRIVACY_LINK_GEOMETRY.headingGap}px;`);
  expect(PRIVACY_LINK_GEOMETRY.icon).toBe(Number.parseFloat(scale.fontSizeMd));
});

it('pins compact contents below the safe top and fits its panel and final section to the usable height', async () => {
  records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
  records.insets = { top: 54, right: 0, bottom: 34, left: 0 };
  await mount(content(0));
  await act(async () => {
    layout('privacy-details', 400, 2000);
    layout('page-contents-disclosure', 300, 86);
    SECTIONS.forEach(({ id }, index) => layout(`privacy-section-${id}`, index * 300, 300));
  });
  await act(async () => root.render(content(230)));
  expect(
    host.querySelector('[aria-label="Privacy policy contents, What stays on your device"]')
  ).not.toBeNull();
  await act(async () => root.render(content(530)));
  expect(
    host.querySelector('[aria-label="Privacy policy contents, Making an AI picture"]')
  ).not.toBeNull();
  await act(async () => root.render(content(700)));
  expect(props('page-contents-disclosure').style.transform).toEqual([{ translateY: 454 }]);
  expect(props('privacy-section-contact').style.minHeight).toBe(452);
  await act(async () => host.querySelector('[aria-label^="Privacy policy contents,"]').click());
  expect(
    records.viewports.findLast((entry) => entry.testID === 'page-contents-panel').style.maxHeight
  ).toBe(680);
  records.dimensions = { width: 844, height: 390, scale: 1, fontScale: 1 };
  records.insets = { top: 0, right: 54, bottom: 21, left: 54 };
  await act(async () => root.render(content(700)));
  expect(props('page-contents-disclosure').style.transform).toEqual([{ translateY: 400 }]);
  expect(props('privacy-section-contact').style.minHeight).toBe(65);
  expect(
    records.viewports.findLast((entry) => entry.testID === 'page-contents-panel').style.maxHeight
  ).toBe(293);
});

it('parks an incoming section below the safe top after both body and section geometry arrive', async () => {
  clipboard.launch = 'hosting';
  records.insets = { top: 54, right: 0, bottom: 34, left: 0 };
  useCaller();
  await mount(createElement(RsdDrawingScreen, { page: 'privacy' }));
  const scroll = host.querySelector('[data-testid="information-page-scroll"]');
  scroll.scrollTo = vi.fn();
  await act(async () => {
    layout('information-page-body', 200, 2000);
    layout('privacy-details', 500, 2000);
    layout('privacy-section-hosting', 1500, 300);
  });
  expect(scroll.scrollTo).toHaveBeenLastCalledWith({ y: 2104, animated: false });
});
