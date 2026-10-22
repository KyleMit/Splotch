import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { host, mount, records, root } from './rsd-native-selection-host.mjs';
import { RsdReleaseHistory } from '../../../experiments/native-architecture/src/rsdDrawing/RsdReleaseHistory.tsx';
import { RELEASE_PAGE } from '../../../experiments/native-architecture/src/rsdDrawing/RsdReleaseArticle.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import releaseHistoryPolicy from '../../../web/src/lib/releaseHistoryPolicy.json';
import { RELEASE_NOTES } from '../../../experiments/native-architecture/src/settings/whatsNew.ts';
import releases from '../../../web/src/lib/releases.json';
import { formatReleaseAgo } from '../../../web/src/lib/releaseAgo.ts';
import { blobPath } from '../../../experiments/native-architecture/src/rsdDrawing/blob.ts';
import { paletteHex } from '../../../experiments/native-architecture/src/drawing/palette.ts';

const RELEASES_SHOWN_OPEN = releaseHistoryPolicy.releasesShownOpen;
const props = (id) => records.props.findLast((entry) => entry.testID === id);
const layout = (id, y, height) =>
  props(id).onLayout({ nativeEvent: { layout: { x: 0, y, width: 350, height } } });
const render = (offset = -300, onLink = vi.fn(), onSectionLayout = vi.fn()) =>
  createElement(
    DrawingAppearanceProvider,
    { preference: 'light' },
    createElement(RsdReleaseHistory, { scrollY: offset, onLink, onSectionLayout })
  );
const headings = () =>
  [...host.querySelectorAll('[role="heading"]')]
    .map((node) => node.textContent)
    .filter((text) => text.startsWith('Version '));
afterEach(() => vi.useRealTimers());

it('opens the shipping release count, Latest tape and relative date, with older notes behind their reveal', async () => {
  vi.useFakeTimers();
  const now = new Date(2026, 8, 30);
  vi.setSystemTime(now);
  await mount(render());
  expect(headings()).toEqual(
    RELEASE_NOTES.slice(0, RELEASES_SHOWN_OPEN).map(({ version }) => `Version ${version}`)
  );
  expect(host.querySelector('[data-testid="release-tape-Latest"]').textContent).toBe('Latest');
  expect(host.textContent).toContain(formatReleaseAgo(releases[0].datetime, now));
  const tape = host.querySelector('[data-testid="release-tape-New"]');
  expect(tape).not.toBeNull();
  expect(Object.assign({}, ...[props('release-section-New').style].flat(Infinity))).toMatchObject({
    display: 'flex',
    flexDirection: 'column',
  });
  await act(async () =>
    props('release-tape-New').onLayout({ nativeEvent: { layout: { width: 60, height: 32 } } })
  );
  expect(tape.querySelector('path').getAttribute('fill').toLowerCase()).toBe(
    paletteHex('Green').toLowerCase()
  );
  const marker = [...host.querySelectorAll('path')].find(
    (node) =>
      node.getAttribute('d') === blobPath('radiusBlob1', RELEASE_PAGE.marker, RELEASE_PAGE.marker)
  );
  expect(marker.getAttribute('fill').toLowerCase()).toBe(paletteHex('Green').toLowerCase());
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((node) => node.textContent.includes('older releases'))
      .click()
  );
  expect(headings()).toEqual(RELEASE_NOTES.map(({ version }) => `Version ${version}`));
});

it('reveals an older release from compact contents and jumps only after collapsed layout measures it', async () => {
  const jump = vi.fn();
  const measured = vi.fn();
  await mount(render(-300, jump, measured));
  const disclosure = host.querySelector('[aria-label="Changelog contents, 8 releases"]');
  await act(async () => disclosure.click());
  const nav = host.querySelector('[aria-label="Changelog contents"]');
  await act(async () => nav.querySelectorAll('[data-testid="sidebar-row"]')[5].click());
  expect(host.querySelector('[aria-label="Changelog contents"]')).toBeNull();
  expect(headings()).toHaveLength(RELEASE_NOTES.length);
  expect(jump).not.toHaveBeenCalled();
  await act(async () => {
    layout('changelog-history', 0, 6000);
    layout('changelog-body', 86, 5800);
    layout('changelog-reading-column', 0, 5800);
    layout(`changelog-position-${releases[5].id}`, 3000, 600);
  });
  expect(measured).toHaveBeenLastCalledWith(releases[5].id, 3086);
  expect(jump).toHaveBeenCalledWith(`#${releases[5].id}`);
});

it('pins wide contents below the safe top and follows the reading band', async () => {
  records.dimensions = { width: 1366, height: 1024, scale: 1, fontScale: 1 };
  records.insets = { top: 24, right: 0, bottom: 20, left: 0 };
  await mount(render());
  expect(host.querySelector('[data-testid="page-contents-disclosure"]')).toBeNull();
  const nav = host.querySelector('[aria-label="Changelog contents"]');
  expect(nav.querySelectorAll('[data-testid="sidebar-row"]')).toHaveLength(releases.length);
  await act(async () => {
    layout('changelog-history', 0, 6000);
    layout('changelog-body', 0, 6000);
    layout('changelog-reading-column', 0, 6000);
    layout('changelog-contents-rail', 0, 500);
    releases
      .slice(0, RELEASES_SHOWN_OPEN)
      .forEach(({ id }, index) => layout(`changelog-position-${id}`, index * 1000, 1000));
  });
  await act(async () => root.render(render(800)));
  expect(props('changelog-contents-rail').style.transform).toEqual([{ translateY: 848 }]);
  expect(nav.textContent).toContain(releases[1].dateLabel);
  expect(host.textContent).toContain(`That's every release since ${releases.at(-1).dateLabel}.`);
});

it('pins the release contents below the safe top and fits its panel inside both safe edges', async () => {
  records.journalHostProps = true;
  records.dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
  records.insets = { top: 54, right: 0, bottom: 34, left: 0 };
  await mount(render());
  await act(async () => {
    layout('changelog-history', 300, 6000);
    layout('changelog-body', 86, 5800);
    layout('page-contents-disclosure', 0, 86);
    releases
      .slice(0, RELEASES_SHOWN_OPEN)
      .forEach(({ id }, index) => layout(`changelog-position-${id}`, index * 1000, 1000));
  });
  await act(async () => root.render(render(120)));
  expect(
    host.querySelector(`[aria-label="Changelog contents, Version ${releases[0].version}"]`)
  ).not.toBeNull();
  await act(async () => root.render(render(1110)));
  expect(
    host.querySelector(`[aria-label="Changelog contents, Version ${releases[1].version}"]`)
  ).not.toBeNull();
  const end = [...host.querySelectorAll('[data-committed-props]')].find(
    (node) =>
      node.textContent.startsWith("That's every release since ") &&
      JSON.parse(node.getAttribute('data-committed-props')).style?.minHeight !== undefined
  );
  expect(JSON.parse(end.getAttribute('data-committed-props')).style.minHeight).toBeCloseTo(369.2);
  await act(async () => root.render(render(800)));
  expect(props('page-contents-disclosure').style.transform).toEqual([{ translateY: 554 }]);
  await act(async () => host.querySelector('[aria-label^="Changelog contents,"]').click());
  expect(
    records.viewports.findLast((entry) => entry.testID === 'page-contents-panel').style.maxHeight
  ).toBe(680);
});
