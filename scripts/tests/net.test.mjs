import { afterEach, describe, expect, it, vi } from 'vitest';

const os = vi.hoisted(() => ({ networkInterfaces: vi.fn() }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, default: { ...actual.default }, networkInterfaces: os.networkInterfaces };
});

const { lanAddresses } = await import('../lib/net.mjs');

afterEach(() => os.networkInterfaces.mockReset());

const ipv4 = (address, internal = false) => ({ address, family: 'IPv4', internal });

describe('lanAddresses', () => {
  it('drops loopback and link-local, keeping the routable address', () => {
    os.networkInterfaces.mockReturnValue({
      lo0: [ipv4('127.0.0.1', true)],
      en0: [ipv4('192.168.40.75')],
      // macOS puts a self-assigned address on the interface it creates for a
      // USB-tethered iPad — vite advertises it, but nothing can reach it.
      en8: [ipv4('169.254.223.104')],
    });

    expect(lanAddresses()).toEqual(['192.168.40.75']);
  });

  it('ignores IPv6 addresses on the same interface', () => {
    os.networkInterfaces.mockReturnValue({
      en0: [{ address: 'fe80::1', family: 'IPv6', internal: false }, ipv4('10.0.1.20')],
    });

    expect(lanAddresses()).toEqual(['10.0.1.20']);
  });

  it('preserves OS order when several interfaces are routable', () => {
    os.networkInterfaces.mockReturnValue({
      en0: [ipv4('192.168.40.75')],
      en1: [ipv4('10.8.0.2')],
    });

    expect(lanAddresses()).toEqual(['192.168.40.75', '10.8.0.2']);
  });

  it('returns nothing when only unreachable addresses exist', () => {
    os.networkInterfaces.mockReturnValue({
      lo0: [ipv4('127.0.0.1', true)],
      en8: [ipv4('169.254.223.104')],
    });

    expect(lanAddresses()).toEqual([]);
  });
});
