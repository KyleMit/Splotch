import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appShellPrecacheUrl,
  createAppShellFallbackPlugin,
  isAppShellNavigation,
  prependAppShellEntry,
} from './appShellRoute';
import { CACHE_BUST_VERSION_PARAM } from './versionEndpoint';

afterEach(() => vi.unstubAllGlobals());

const origin = 'https://splotch.art';
const shellUrl = appShellPrecacheUrl('active-build');

// Workbox writes the matcher with `toString()` and each plugin as an object
// literal whose function values are `toString()` copies, so these rebuild the
// generated service worker's code with nothing from this module in scope.
function serializedMatcher(): typeof isAppShellNavigation {
  return Function(`return (${isAppShellNavigation.toString()})`)();
}

function serializedPlugin(): ReturnType<typeof createAppShellFallbackPlugin> {
  const plugin = createAppShellFallbackPlugin(shellUrl, CACHE_BUST_VERSION_PARAM);
  return Function(
    `return {
      cacheWillUpdate: ${plugin.cacheWillUpdate.toString()},
      cachedResponseWillBeUsed: ${plugin.cachedResponseWillBeUsed.toString()},
      handlerDidError: ${plugin.handlerDidError.toString()},
    }`
  )();
}

function stubPrecachedShell() {
  const shell = new Response('active build shell');
  const match = vi.fn(async (url: string) => (url === shellUrl ? shell : undefined));
  vi.stubGlobal('caches', { match });
  return { shell, match };
}

function navigationTo(path: string) {
  return { request: new Request(new URL(path, origin)) };
}

describe('app shell service-worker route', () => {
  it('matches only navigations to the drawing app', () => {
    const matches = serializedMatcher();
    const navigate = { mode: 'navigate' } satisfies Pick<Request, 'mode'>;

    expect(matches({ request: navigate, url: new URL('/', origin) })).toBe(true);
    expect(matches({ request: navigate, url: new URL('/?v=1.2.3', origin) })).toBe(true);
    expect(matches({ request: navigate, url: new URL('/index.html', origin) })).toBe(true);
    expect(matches({ request: navigate, url: new URL('/privacy', origin) })).toBe(false);
    expect(matches({ request: { mode: 'cors' }, url: new URL('/', origin) })).toBe(false);
  });

  it('gives each build a distinct shell URL on the drawing app path', () => {
    const shell = new URL(appShellPrecacheUrl('build a'), origin);

    expect(shell.pathname).toBe('/');
    expect(appShellPrecacheUrl('build a')).not.toBe(appShellPrecacheUrl('build b'));
  });

  it('installs the shell before every other precache entry', () => {
    const chunk = { url: '_app/immutable/entry/start.abc.js', revision: 'abc', size: 10 };

    expect(prependAppShellEntry(shellUrl)([chunk]).manifest).toEqual([
      { url: shellUrl, revision: null, size: 0 },
      chunk,
    ]);
  });

  it('answers a stalled launch with its own build shell instead of any cached page', async () => {
    const { shell, match } = stubPrecachedShell();

    await expect(serializedPlugin().cachedResponseWillBeUsed(navigationTo('/'))).resolves.toBe(
      shell
    );
    expect(match).toHaveBeenCalledWith(shellUrl);
  });

  it('lets a stale-page recovery navigation wait out a slow network', async () => {
    const { match } = stubPrecachedShell();
    const recovery = navigationTo(`/?${CACHE_BUST_VERSION_PARAM}=1.2.3`);

    await expect(serializedPlugin().cachedResponseWillBeUsed(recovery)).resolves.toBeNull();
    expect(match).not.toHaveBeenCalled();
  });

  it('answers a failed network with the shell, recovery navigations included', async () => {
    const { shell } = stubPrecachedShell();

    await expect(serializedPlugin().handlerDidError()).resolves.toBe(shell);
  });

  it('never writes the network page to a runtime cache', async () => {
    await expect(serializedPlugin().cacheWillUpdate()).resolves.toBe(null);
  });
});
