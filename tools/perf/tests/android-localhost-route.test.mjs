import { afterEach, describe, expect, it } from 'vitest';
import { androidLocalhostRoute, reverseToLocalhost } from '../lib/android-localhost-route.mjs';

const HOST_ADDRESSES = ['192.168.1.9'];

describe('androidLocalhostRoute', () => {
  it('moves a page this host serves on its LAN address to localhost, keeping path and query', () => {
    expect(androidLocalhostRoute('http://192.168.1.9:4175/?probe=run-1', HOST_ADDRESSES)).toEqual({
      url: 'http://localhost:4175/?probe=run-1',
      port: 4175,
    });
  });

  it('routes a loopback address too', () => {
    expect(androidLocalhostRoute('http://127.0.0.1:4177/', HOST_ADDRESSES)).toEqual({
      url: 'http://localhost:4177/',
      port: 4177,
    });
  });

  it('leaves another machine, an https origin, and a portless origin alone', () => {
    expect(androidLocalhostRoute('http://10.0.0.7:4173/', HOST_ADDRESSES)).toBeNull();
    expect(androidLocalhostRoute('https://192.168.1.9:4173/', HOST_ADDRESSES)).toBeNull();
    expect(androidLocalhostRoute('http://192.168.1.9/', HOST_ADDRESSES)).toBeNull();
  });
});

describe('reverseToLocalhost', () => {
  let route;
  afterEach(() => route?.release());

  it('binds the reverse, and removes it once however often it is released', () => {
    const calls = [];
    route = reverseToLocalhost(
      'http://192.168.1.9:4175/?probe=run-1',
      (args, options) => calls.push({ args, ...options }),
      HOST_ADDRESSES
    );
    route.release();
    route.release();
    expect(route.url).toBe('http://localhost:4175/?probe=run-1');
    expect(calls).toEqual([
      { args: ['reverse', 'tcp:4175', 'tcp:4175'], bestEffort: false },
      { args: ['reverse', '--remove', 'tcp:4175'], bestEffort: true },
    ]);
  });

  it('arms the removal on process exit, and disarms it once released', () => {
    const before = process.listenerCount('exit');
    route = reverseToLocalhost('http://127.0.0.1:4177/', () => {}, HOST_ADDRESSES);
    expect(process.listenerCount('exit')).toBe(before + 1);
    route.release();
    expect(process.listenerCount('exit')).toBe(before);
  });

  it('runs nothing for a page the device cannot be routed to', () => {
    const calls = [];
    route = reverseToLocalhost('http://10.0.0.7:4173/', (args) => calls.push(args), HOST_ADDRESSES);
    route.release();
    expect(route.url).toBe('http://10.0.0.7:4173/');
    expect(calls).toEqual([]);
  });
});
