import { afterEach, describe, expect, it, vi } from 'vitest';
import { androidLocalhostRoute, reverseToLocalhost } from '../lib/android-localhost-route.mjs';

const HOST_ADDRESSES = ['127.0.0.1', '::1', '192.168.1.9', '169.254.3.4'];
const NAMES = { 'my-mac.local': ['192.168.1.9'], 'elsewhere.local': ['10.0.0.7'] };
const lookup = async (hostname) => {
  if (!NAMES[hostname]) throw new Error(`ENOTFOUND ${hostname}`);
  return NAMES[hostname];
};
const options = { hostAddresses: HOST_ADDRESSES, lookup };

describe('androidLocalhostRoute', () => {
  it('moves a page this host serves on its LAN address to localhost, keeping path and query', async () => {
    expect(await androidLocalhostRoute('http://192.168.1.9:4175/?probe=run-1', options)).toEqual({
      url: 'http://localhost:4175/?probe=run-1',
      port: 4175,
      hostname: '192.168.1.9',
    });
  });

  it('routes loopback, and an interface a LAN-address picker would skip', async () => {
    expect((await androidLocalhostRoute('http://127.0.0.1:4177/', options))?.url).toBe(
      'http://localhost:4177/'
    );
    expect((await androidLocalhostRoute('http://169.254.3.4:4177/', options))?.url).toBe(
      'http://localhost:4177/'
    );
  });

  it('routes a hostname that resolves only to this machine', async () => {
    expect((await androidLocalhostRoute('http://my-mac.local:4173/', options))?.url).toBe(
      'http://localhost:4173/'
    );
  });

  it('leaves another machine, an unresolvable name, https, and a portless origin alone', async () => {
    for (const url of [
      'http://10.0.0.7:4173/',
      'http://elsewhere.local:4173/',
      'http://nowhere.invalid:4173/',
      'https://192.168.1.9:4173/',
      'http://192.168.1.9/',
    ]) {
      expect(await androidLocalhostRoute(url, options)).toBeNull();
    }
  });
});

describe('reverseToLocalhost', () => {
  let route;
  afterEach(() => {
    route?.release();
    vi.restoreAllMocks();
  });

  it('binds the reverse, and removes it once however often it is released', async () => {
    const calls = [];
    route = await reverseToLocalhost(
      'http://192.168.1.9:4175/?probe=run-1',
      (args, runOptions) => calls.push({ args, ...runOptions }),
      options
    );
    route.release();
    route.release();
    expect(route.url).toBe('http://localhost:4175/?probe=run-1');
    expect(calls).toEqual([
      { args: ['reverse', 'tcp:4175', 'tcp:4175'], bestEffort: false },
      { args: ['reverse', '--remove', 'tcp:4175'], bestEffort: true },
    ]);
  });

  it('names localhost and every address earlier LAN runs could have used as tooling hosts', async () => {
    route = await reverseToLocalhost('http://my-mac.local:4175/', () => {}, options);
    expect(route.toolingHostnames).toEqual(['localhost', 'my-mac.local', ...HOST_ADDRESSES]);
  });

  it('arms the removal on process exit, and disarms it once released', async () => {
    const before = process.listenerCount('exit');
    route = await reverseToLocalhost('http://127.0.0.1:4177/', () => {}, options);
    expect(process.listenerCount('exit')).toBe(before + 1);
    route.release();
    expect(process.listenerCount('exit')).toBe(before);
  });

  it('runs nothing for a page on another machine, and says Chrome may warn', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const calls = [];
    route = await reverseToLocalhost('http://10.0.0.7:4173/', (args) => calls.push(args), options);
    route.release();
    expect(route).toMatchObject({ url: 'http://10.0.0.7:4173/', toolingHostnames: ['10.0.0.7'] });
    expect(calls).toEqual([]);
    expect(log.mock.calls[0][0]).toContain('Always use secure connections');
  });
});
