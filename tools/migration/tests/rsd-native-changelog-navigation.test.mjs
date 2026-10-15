import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { host, mount, records, root } from './rsd-native-selection-host.mjs';
import { RsdReleaseHistory } from '../../../experiments/native-architecture/src/rsdDrawing/RsdReleaseHistory.tsx';
import { RELEASE_PAGE } from '../../../experiments/native-architecture/src/rsdDrawing/RsdReleaseArticle.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { RELEASES_SHOWN_OPEN } from '../../../web/src/lib/releaseHistoryPolicy.ts';
import { RELEASE_NOTES } from '../../../experiments/native-architecture/src/settings/whatsNew.ts';
import releases from '../../../web/src/lib/releases.json';
import { formatReleaseAgo } from '../../../web/src/lib/releaseAgo.ts';
import { blobPath } from '../../../experiments/native-architecture/src/rsdDrawing/blob.ts';
import { paletteHex } from '../../../experiments/native-architecture/src/drawing/palette.ts';

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

it('pins wide contents beside the releases and follows the reading band', async () => {
  records.dimensions = { width: 1366, height: 1024, scale: 1, fontScale: 1 };
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
  expect(props('changelog-contents-rail').style.transform).toEqual([{ translateY: 824 }]);
  expect(nav.textContent).toContain(releases[1].dateLabel);
  expect(host.textContent).toContain(`That's every release since ${releases.at(-1).dateLabel}.`);
});

it('pins release tape, bullets and narrow-header geometry to the shipping page', () => {
  const source = readFileSync(
    join(import.meta.dirname, '../../../web/src/routes/changelog/+page.svelte'),
    'utf8'
  );
  expect(source).toContain(`min-height: ${RELEASE_PAGE.lineHeight}em`);
  expect(source).toContain(`width: ${RELEASE_PAGE.marker}px;`);
  expect(source).toContain(`padding-left: ${RELEASE_PAGE.indent}px;`);
  expect(source).toContain(`@media (max-width: ${RELEASE_PAGE.narrowHeader}px)`);
  expect(source).toContain('clip-path: polygon(3% 0, 100% 8%, 97% 100%, 0 90%);');
});
