import '../../../experiments/native-architecture/src/rsdDrawing/RsdSidebarRow.props.test.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { host, mount, records, root } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { PRIVACY_LINK_GEOMETRY } from '../../../experiments/native-architecture/src/rsdDrawing/RsdPrivacyHeading.tsx';
import { scale } from '../../../web/src/lib/design/tokens.ts';
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
const content = (scrollY, onLink = vi.fn()) =>
  createElement(
    DrawingAppearanceProvider,
    { preference: 'light' },
    createElement(RsdPrivacyContent, {
      policy: privacy.native,
      onLink,
      onSectionLayout: vi.fn(),
      scrollY,
    })
  );

it('pins the desktop contents beside the reading column and tracks the section crossing the reading line', async () => {
  records.dimensions = { width: 1366, height: 1024, scale: 1, fontScale: 1 };
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
  expect(props('privacy-contents-rail').style.transform).toEqual([{ translateY: 224 }]);
  const activeRow = records.props.findLast(
    (entry) => entry.testID === 'sidebar-row' && entry.accessibilityLabel === SECTIONS[1].label
  );
  expect(activeRow.style.borderLeftWidth).toBe(3);
  await act(async () => rail.querySelectorAll('button')[2].click());
  expect(jump).toHaveBeenCalledWith('#counting');
  await act(async () => root.render(content(4000, jump)));
  expect(props('privacy-contents-rail').style.transform).toEqual([{ translateY: 1600 }]);
});

it('keeps compact contents as the existing closed disclosure with the same section jumps', async () => {
  records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
  const jump = vi.fn();
  await mount(content(0, jump));
  expect(host.querySelector('[data-testid="privacy-contents-rail"]')).toBeNull();
  const disclosure = [...host.querySelectorAll('button')].find((node) =>
    node.textContent.startsWith('8 sections')
  );
  expect(
    records.props.findLast((entry) => entry.accessibilityState?.expanded !== undefined)
      .accessibilityState.expanded
  ).toBe(false);
  expect(disclosure.textContent).toContain('8 sections');
  await act(async () => disclosure.click());
  const nav = host.querySelector('[aria-label="Privacy policy contents"]');
  expect(nav.querySelectorAll('[role="link"]')).toHaveLength(8);
  await act(async () => nav.querySelectorAll('[role="link"]')[5].click());
  expect(jump).toHaveBeenCalledWith('#hosting');
});

it('copies a canonical section link, updates the fragment and clears its visible and spoken confirmation', async () => {
  vi.useFakeTimers();
  clipboard.copy.mockResolvedValue(true);
  clipboard.replace.mockClear();
  await mount(content(0));
  const anchor = host.querySelector(`[aria-label='Copy link to “${SECTIONS[0].label}”']`);
  await act(async () => anchor.click());
  expect(clipboard.copy).toHaveBeenCalledWith('on-device');
  expect(clipboard.replace).toHaveBeenCalledWith('on-device');
  expect(host.querySelector('[role="status"]').textContent).toBe(
    'Link to “What stays on your device” copied.'
  );
  expect(anchor.textContent).not.toContain('#');
  await act(async () => vi.advanceTimersByTime(COPIED_DURATION_MS));
  expect(host.querySelector('[role="status"]').textContent).toBe('');
  expect(anchor.textContent).toBe('#');
});

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
