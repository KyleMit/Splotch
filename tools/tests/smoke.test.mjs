import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fatal } from '../lib/smoke.mjs';

const REQUEST_SECRET = 'splotch-smoke-secret-sentinel';

let printed;

beforeEach(() => {
  printed = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => printed.push(args.join(' ')));
});

afterEach(() => vi.restoreAllMocks());

async function redirectingServer() {
  const server = createServer((_req, res) => {
    res.writeHead(302, { location: '/elsewhere' });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

describe('fatal', () => {
  it('prints only the message for an error without a cause', () => {
    fatal(new Error('admin target is not configured'));

    expect(printed).toEqual(['\nFATAL: admin target is not configured']);
  });

  it('prints each message down the cause chain', () => {
    const refused = new Error('connect ECONNREFUSED 127.0.0.1:5479');
    const socket = new Error('socket closed', { cause: refused });

    fatal(new TypeError('fetch failed', { cause: socket }));

    expect(printed).toEqual([
      '\nFATAL: fetch failed',
      '  caused by: socket closed',
      '  caused by: connect ECONNREFUSED 127.0.0.1:5479',
    ]);
  });

  it("names a messageless cause by its code, as Node's dual-stack connect failure is", () => {
    const refused = Object.assign(new AggregateError([], ''), { code: 'ECONNREFUSED' });

    fatal(new TypeError('fetch failed', { cause: refused }));

    expect(printed).toEqual(['\nFATAL: fetch failed', '  caused by: ECONNREFUSED']);
  });

  it("prints a cause's message and none of the request it carries", () => {
    const redirect = Object.assign(new Error('unexpected redirect'), {
      headers: { authorization: `Bearer ${REQUEST_SECRET}` },
      body: JSON.stringify({ token: REQUEST_SECRET }),
    });

    fatal(new TypeError('fetch failed', { cause: redirect }));

    expect(printed).toEqual(['\nFATAL: fetch failed', '  caused by: unexpected redirect']);
  });

  it('stops following a cyclic chain after a bounded depth', () => {
    const loop = new Error('loop');
    loop.cause = loop;

    fatal(new Error('outer', { cause: loop }));

    expect(printed).toEqual(['\nFATAL: outer', ...Array(5).fill('  caused by: loop')]);
  });

  it('reports why a real fetch refused a redirect', async () => {
    const server = await redirectingServer();
    const { port } = server.address();
    let failure;
    try {
      await fetch(`http://127.0.0.1:${port}/api/admin/tokens`, { redirect: 'error' });
    } catch (err) {
      failure = err;
    } finally {
      server.close();
    }

    fatal(failure);

    expect(printed[0]).toBe('\nFATAL: fetch failed');
    expect(printed.slice(1)).toEqual([expect.stringMatching(/^ {2}caused by: .*redirect/)]);
  });
});
