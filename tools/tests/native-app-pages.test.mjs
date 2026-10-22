// @vitest-environment happy-dom

import { scale } from '../../web/src/lib/design/tokens.ts';
import { PRIVACY_LAYOUT } from '../../experiments/native-architecture/src/information/privacyLayout.ts';
import {
  copyPrivacySection,
  privacySectionAtLaunch,
  replacePrivacyFragment,
} from '../../experiments/native-architecture/src/platform/privacySectionLink.web.ts';
import {
  informationFragmentAtLaunch,
  visitInformationFragment,
} from '../../experiments/native-architecture/src/platform/informationFragment.web.ts';
import { sectionUrl } from '../../web/src/lib/privacy/sectionLink.ts';
import { afterEach, expect, it, vi } from 'vitest';
import { createBrowserAppPages } from '../../experiments/native-architecture/src/platform/appPath.web.ts';
import { retainFocus } from '../../experiments/native-architecture/src/rsdDrawing/landFocus.web.ts';
import { createAppPages } from '../../experiments/native-architecture/src/information/appPages.ts';
import releases from '../../web/src/lib/releases.json';
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
  expect(Number.parseFloat(scale.space6)).toBe(PRIVACY_LAYOUT.stickyTop);
});

it('records a reading jump as a reversible fragment while preserving the held page history marker', () => {
  history.replaceState({ held: 'settings' }, '', '/changelog');
  const length = history.length;
  visitInformationFragment('release-1-0-0');
  expect(location.hash).toBe('#release-1-0-0');
  expect(informationFragmentAtLaunch()).toBe('release-1-0-0');
  expect(history.state).toEqual({ held: 'settings' });
  expect(history.length).toBe(length + 1);
  visitInformationFragment('release-1-0-0');
  expect(history.length).toBe(length + 1);
});

it('publishes the native page and release fragment as one owned destination', () => {
  const pages = createAppPages();
  const snapshots = [];
  const release = releases[0].id;
  expect(pages.fragment).toBeTypeOf('function');
  const unsubscribe = pages.subscribe(() =>
    snapshots.push({ page: pages.current(), fragment: pages.fragment() })
  );
  pages.open('changelog', release);
  expect(snapshots).toEqual([{ page: 'changelog', fragment: release }]);
  pages.open('changelog', release);
  pages.open('changelog');
  expect(snapshots).toHaveLength(1);
  expect(pages.fragment()).toBe(release);
  pages.open('privacy');
  expect(snapshots).toEqual([
    { page: 'changelog', fragment: release },
    { page: 'privacy', fragment: null },
  ]);
  expect(createAppPages().fragment()).toBeNull();
  unsubscribe();
  pages.open('drawing');
  expect(snapshots).toHaveLength(2);
});

it('publishes the web page and release fragment in one reversible history entry', () => {
  const location = { pathname: '/privacy', hash: '', assign: vi.fn() };
  const pushState = vi.fn((_state, _title, path) => {
    const url = new URL(path, 'https://splotch.art');
    location.pathname = url.pathname;
    location.hash = url.hash;
  });
  vi.stubGlobal('location', location);
  vi.stubGlobal('history', { pushState });
  const pages = createBrowserAppPages();
  const snapshots = [];
  const unsubscribe = pages.subscribe(() =>
    snapshots.push({ page: pages.current(), fragment: informationFragmentAtLaunch() })
  );
  const release = releases[0].id;
  pages.open('changelog', release);
  expect(pushState).toHaveBeenCalledExactlyOnceWith(
    null,
    '',
    `/changelog#${encodeURIComponent(release)}`
  );
  expect(snapshots).toEqual([{ page: 'changelog', fragment: release }]);
  pages.open('changelog', release);
  pages.open('changelog');
  expect(pushState).toHaveBeenCalledOnce();
  location.pathname = '/privacy';
  location.hash = '';
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(snapshots).toEqual([
    { page: 'changelog', fragment: release },
    { page: 'privacy', fragment: null },
  ]);
  expect(location.assign).not.toHaveBeenCalled();
  unsubscribe();
});
