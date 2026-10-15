// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scale } from '../../web/src/lib/design/tokens.ts';
import { PRIVACY_LAYOUT } from '../../experiments/native-architecture/src/information/privacyLayout.ts';
import {
  copyPrivacySection,
  privacySectionAtLaunch,
  replacePrivacyFragment,
} from '../../experiments/native-architecture/src/platform/privacySectionLink.web.ts';
import { sectionUrl } from '../../web/src/routes/privacy/sectionLink.ts';
import { afterEach, expect, it, vi } from 'vitest';
import { createBrowserAppPages } from '../../experiments/native-architecture/src/platform/appPath.web.ts';
import { retainFocus } from '../../experiments/native-architecture/src/rsdDrawing/landFocus.web.ts';
import { createAppPages } from '../../experiments/native-architecture/src/information/appPages.ts';
afterEach(() => vi.unstubAllGlobals());

it('navigates web information pages without reloading the drawing session and follows browser Back', () => {
  const location = { pathname: '/', assign: vi.fn() };
  const pushState = vi.fn((_state, _title, path) => {
    location.pathname = path;
  });
  vi.stubGlobal('location', location);
  vi.stubGlobal('history', { pushState });
  const pages = createBrowserAppPages();
  const listener = vi.fn();
  const unsubscribe = pages.subscribe(listener);
  pages.open('privacy');
  expect(pages.current()).toBe('privacy');
  expect(pushState).toHaveBeenCalledWith(null, '', '/privacy');
  expect(location.assign).not.toHaveBeenCalled();
  expect(listener).toHaveBeenCalledOnce();
  pages.open('privacy');
  expect(pushState).toHaveBeenCalledOnce();
  location.pathname = '/';
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(pages.current()).toBe('drawing');
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(listener).toHaveBeenCalledTimes(2);
});

it('uses a fresh in-memory native page owner for each app root', () => {
  const pages = createAppPages();
  const listener = vi.fn();
  pages.subscribe(listener);
  pages.open('privacy');
  expect(pages.current()).toBe('privacy');
  pages.open('drawing');
  expect(pages.current()).toBe('drawing');
  expect(listener).toHaveBeenCalledTimes(2);
  expect(createAppPages().current()).toBe('drawing');
});

it('restores the input focus retained below a mounted information page', () => {
  const input = document.createElement('input');
  const heading = document.createElement('h1');
  heading.tabIndex = -1;
  document.body.append(input, heading);
  input.focus();
  const restore = retainFocus();
  heading.focus();
  expect(document.activeElement).toBe(heading);
  restore();
  expect(document.activeElement).toBe(input);
  input.remove();
  heading.remove();
});

it('copies the canonical web section link while keeping the hosted page history state', async () => {
  const writeText = vi.fn(async () => {});
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  history.replaceState({ held: 'settings' }, '', '/privacy#hosting');
  expect(privacySectionAtLaunch()).toBe('hosting');
  expect(await copyPrivacySection('counting')).toBe(true);
  expect(writeText).toHaveBeenCalledWith(sectionUrl('counting'));
  const length = history.length;
  replacePrivacyFragment('counting');
  expect(location.hash).toBe('#counting');
  expect(history.state).toEqual({ held: 'settings' });
  expect(history.length).toBe(length);
  history.replaceState(null, '', '/privacy#unknown');
  expect(privacySectionAtLaunch()).toBeNull();
});

it('falls back to section navigation when the browser clipboard is missing or refuses a write', async () => {
  vi.stubGlobal('navigator', {});
  expect(await copyPrivacySection('hosting')).toBe(false);
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: vi.fn(async () => {
        throw new Error('denied');
      }),
    },
  });
  expect(await copyPrivacySection('hosting')).toBe(false);
});

it('pins privacy reading rail and section parking geometry to the shipping page', () => {
  const shell = readFileSync(
    join(import.meta.dirname, '../../web/src/lib/components/page/PageShell.svelte'),
    'utf8'
  );
  const policy = readFileSync(
    join(import.meta.dirname, '../../web/src/routes/privacy/+page.svelte'),
    'utf8'
  );
  expect(shell).toContain(`--page-rail-width: ${PRIVACY_LAYOUT.railWidth}px;`);
  expect(shell).toContain(`--page-rail-gutter: ${PRIVACY_LAYOUT.railGap}px;`);
  expect(Number.parseFloat(scale.space6)).toBe(PRIVACY_LAYOUT.stickyTop);
  expect(policy).toContain(`--section-park: ${PRIVACY_LAYOUT.compactPark}px;`);
});
