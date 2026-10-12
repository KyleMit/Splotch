import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fatal } from '../lib/smoke.mjs';

const REQUEST_SECRET = 'splotch-smoke-secret-sentinel';
const SMOKE_MODULE_URL = pathToFileURL(join(import.meta.dirname, '..', 'lib', 'smoke.mjs')).href;

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

  it('masks a bearer credential written into any message it prints', () => {
    const header = new Error(`Authorization: Bearer ${REQUEST_SECRET}== rejected`);

    fatal(new Error(`POST with bearer ${REQUEST_SECRET} failed`, { cause: header }));

    expect(printed).toEqual([
      '\nFATAL: POST with bearer [redacted] failed',
      '  caused by: Authorization: Bearer [redacted] rejected',
    ]);
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

describe('summarize', () => {
  // Several times what the pipe and the parent's stream buffer together hold, so while stderr goes
  // unread most of the failure lines are still queued inside the child when summarize() exits.
  const FAILURE_LINES = 4_000;
  const FAILURE_DETAIL = 'x'.repeat(100);

  async function runFailingSmoke() {
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        [
          `import { check, summarize } from ${JSON.stringify(SMOKE_MODULE_URL)};`,
          `for (let i = 0; i < ${FAILURE_LINES}; i++) check('case ' + i, false, '${FAILURE_DETAIL}');`,
          'summarize();',
        ].join('\n'),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    // The tally is summarize()'s last write before it exits. Reading stderr only after it arrives
    // makes this reader fall behind deterministically, the way a slow one does by chance.
    await once(child.stdout, 'data');
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const [code] = await once(child, 'close');
    return { code, stdout, stderr };
  }

  it('delivers every line through a pipe before it exits non-zero', async () => {
    const { code, stdout, stderr } = await runFailingSmoke();

    expect(code).toBe(1);
    expect(stdout).toBe(`\n0 passed, ${FAILURE_LINES} failed\n`);
    const failures = stderr.trimEnd().split('\n');
    expect(failures).toHaveLength(FAILURE_LINES);
    expect(failures.at(-1)).toBe(`  ✗ case ${FAILURE_LINES - 1} — ${FAILURE_DETAIL}`);
  });
});
