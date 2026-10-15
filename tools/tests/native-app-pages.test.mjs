// @vitest-environment happy-dom
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
