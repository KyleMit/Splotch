import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appShellPrecacheUrl,
  createAppShellFallbackPlugin,
  isAppShellNavigation,
} from './appShellRoute';

afterEach(() => vi.unstubAllGlobals());

const origin = 'https://splotch.art';

// Workbox writes the matcher with `toString()` and each plugin as an object
// literal whose function values are `toString()` copies, so these rebuild the
// generated service worker's code with nothing from this module in scope.
function serializedMatcher(): typeof isAppShellNavigation {
  return Function(`return (${isAppShellNavigation.toString()})`)();
}

function serializedPlugin(shellUrl: string): ReturnType<typeof createAppShellFallbackPlugin> {
  const plugin = createAppShellFallbackPlugin(shellUrl);
  return Function(
    `return {
      cacheWillUpdate: ${plugin.cacheWillUpdate.toString()},
      cachedResponseWillBeUsed: ${plugin.cachedResponseWillBeUsed.toString()},
    }`
  )();
}

describe('app shell service-worker route', () => {
  it('matches only navigations to the drawing app', () => {
    const matches = serializedMatcher();
    const navigate = { mode: 'navigate' } satisfies Pick<Request, 'mode'>;

    expect(matches({ request: navigate, url: new URL('/', origin) })).toBe(true);
    expect(matches({ request: navigate, url: new URL('/?v=1.2.3', origin) })).toBe(true);
    expect(matches({ request: navigate, url: new URL('/privacy', origin) })).toBe(false);
    expect(matches({ request: { mode: 'cors' }, url: new URL('/', origin) })).toBe(false);
  });

  it('gives each build a distinct shell URL on the drawing app path', () => {
    const shell = new URL(appShellPrecacheUrl('build a'), origin);

    expect(shell.pathname).toBe('/');
    expect(appShellPrecacheUrl('build a')).not.toBe(appShellPrecacheUrl('build b'));
  });

  it('answers a fallback with its own build shell instead of any cached page', async () => {
    const shellUrl = appShellPrecacheUrl('active-build');
    const shell = new Response('active build shell');
    const match = vi.fn(async (url: string) => (url === shellUrl ? shell : undefined));
    vi.stubGlobal('caches', { match });
    const plugin = serializedPlugin(shellUrl);

    await expect(plugin.cachedResponseWillBeUsed()).resolves.toBe(shell);
    expect(match).toHaveBeenCalledWith(shellUrl);
  });

  it('never writes the network page to a runtime cache', async () => {
    await expect(serializedPlugin(appShellPrecacheUrl('build')).cacheWillUpdate()).resolves.toBe(
      null
    );
  });
});
