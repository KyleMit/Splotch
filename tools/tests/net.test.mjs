import { once } from 'node:events';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const os = vi.hoisted(() => ({ networkInterfaces: vi.fn() }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, default: { ...actual.default }, networkInterfaces: os.networkInterfaces };
});

const { lanAddresses, waitForUrl } = await import('../lib/net.mjs');

// Shorter than waitForUrl's pause between attempts, so each call makes exactly one attempt.
const ONE_ATTEMPT_TIMEOUT_MS = 100;

const servers = [];

afterEach(async () => {
  os.networkInterfaces.mockReset();
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

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

async function listen(respond) {
  const server = createServer(respond);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function refusedUrl() {
  const url = await listen(() => {});
  const server = servers.pop();
  await new Promise((done) => server.close(done));
  return url;
}

async function timeoutOf(url) {
  try {
    await waitForUrl(url, ONE_ATTEMPT_TIMEOUT_MS);
  } catch (err) {
    return err;
  }
  throw new Error(`${url} unexpectedly became ready`);
}

describe('waitForUrl', () => {
  it('names the refused connection behind a timeout', async () => {
    const url = await refusedUrl();

    const timeout = await timeoutOf(url);

    expect(timeout.message).toBe(`${url} did not become ready within ${ONE_ATTEMPT_TIMEOUT_MS}ms`);
    expect(timeout.cause.message).toBe('fetch failed');
    expect(timeout.cause.cause.code).toBe('ECONNREFUSED');
  });

  it('names the status of an answer that was never ready', async () => {
    const url = await listen((_request, response) => response.writeHead(503).end());

    const timeout = await timeoutOf(url);

    expect(timeout.cause.message).toBe('answered HTTP 503');
  });
});
