import { expect, it } from 'vitest';
import {
  APP_SHELL_FALLBACK_CALLBACKS,
  APP_SHELL_PRECACHE_URL_PATTERN,
  appShellFallbackLookupsFromSource,
} from '../lib/pwa-precache-source.mjs';
import {
  appShellPrecacheUrl,
  createAppShellFallbackPlugin,
} from '../../src/lib/pwa/appShellRoute.ts';

const appShellUrl = appShellPrecacheUrl('build-id');
const appShellFallbackLookups = APP_SHELL_FALLBACK_CALLBACKS.map((callback) => ({
  callback,
  url: appShellUrl,
}));
it('recognizes the service worker app-shell URL', () => {
  expect(appShellUrl).toMatch(APP_SHELL_PRECACHE_URL_PATTERN);
});

it('reads the shell URL back from each fallback callback Workbox serializes', () => {
  const plugin = createAppShellFallbackPlugin(appShellUrl, 'v');
  const serialized = Object.entries(plugin)
    .map(([callback, body]) => `${callback}:${body}`)
    .join(',');
  const source = `plugins:[{${serialized}}],e.registerRoute(new e.NetworkFirst({cacheName:"pages"}))`;

  expect(appShellFallbackLookupsFromSource(source)).toEqual(appShellFallbackLookups);
});

it('attributes a lookup only to the callback whose body holds it', () => {
  const source = `{cachedResponseWillBeUsed:async function(){return null},handlerDidError:async function(){return caches.match(${JSON.stringify(appShellUrl)})}}`;

  expect(appShellFallbackLookupsFromSource(source)).toEqual([
    { callback: 'handlerDidError', url: appShellUrl },
  ]);
});

it.each([
  'async()=>',
  'async e=>',
  '({request:e})=>',
  'function(){return ',
  'async function(){return ',
])('ends a callback body at the next function-valued property written as %s', (valueStart) => {
  const lookup = `caches.match(${JSON.stringify(appShellUrl)})`;
  const source = `{cachedResponseWillBeUsed:async function(){return null},unrelated:${valueStart}${lookup},handlerDidError:async function(){return ${lookup}}}`;

  expect(appShellFallbackLookupsFromSource(source)).toEqual([
    { callback: 'handlerDidError', url: appShellUrl },
  ]);
});
