import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAdminSecretTarget } from '../lib/deployed-admin-target.mjs';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const HTTP_TEST_FLAG = 'DEPLOY_SMOKE_ALLOW_HTTP_FOR_TESTS';
const servers = [];

const notFound = (_request, response) => response.writeHead(404).end();

async function startRecordingServer(respond = notFound) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    respond(request, response);
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { base: `http://127.0.0.1:${server.address().port}`, requests };
}

async function runEntry(script, targetArg, allowHttpForTests) {
  const child = spawn(
    process.execPath,
    [
      '--experimental-strip-types',
      '--disable-warning=ExperimentalWarning',
      `tools/api-smoke/${script}`,
      targetArg,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ADMIN_ACCESS_TOKEN: 'test-admin-secret',
        [HTTP_TEST_FLAG]: allowHttpForTests ? '1' : '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let stderr = '';
  child.stdout.resume();
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const [code] = await once(child, 'exit');
  return { code, stderr };
}

const entries = [
  ['check-deployed-blobs.mjs', (base) => base],
  ['check-deployed-contract.mjs', (base) => `--url=${base}`],
];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

describe('deployed admin-secret target rule', () => {
  it.each([
    ['a Netlify deploy preview', 'https://deploy-preview-1104--splotchy.netlify.app', false, true],
    ['canonical production', 'https://splotch.art', false, true],
    ['plain-http production', 'http://splotch.art', true, false],
    ['a loopback fixture without the test flag', 'http://127.0.0.1:4173', false, false],
    ['a loopback fixture with the test flag', 'http://127.0.0.1:4173', true, true],
    ['a localhost fixture with the test flag', 'http://localhost:4173', true, true],
    ['a non-loopback wildcard host with the test flag', 'http://0.0.0.0:1', true, false],
    ['a non-http scheme with the test flag', 'ftp://127.0.0.1', true, false],
    ['an unparseable URL', 'splotch.art', false, false],
    ['an empty URL', '', false, false],
  ])('classifies %s', (_label, base, allowHttpForTests, allowed) => {
    vi.stubEnv(HTTP_TEST_FLAG, allowHttpForTests ? '1' : '');
    expect(parseAdminSecretTarget(base) !== null).toBe(allowed);
  });

  it.each(entries)(
    '%s refuses a plain-http target before sending the admin secret',
    async (script, targetArg) => {
      const server = await startRecordingServer();
      const result = await runEntry(script, targetArg(server.base), false);

      expect(result.code, result.stderr).toBe(2);
      expect(result.stderr).toContain('Missing or invalid config');
      expect(server.requests).toEqual([]);
    }
  );

  it.each(entries)(
    '%s reaches a loopback fixture through the shared test escape hatch',
    async (script, targetArg) => {
      const server = await startRecordingServer();
      const result = await runEntry(script, targetArg(server.base), true);

      expect(result.code, result.stderr).toBe(1);
      expect(server.requests).toContain('POST /api/admin/login');
    }
  );

  it.each(entries)(
    '%s refuses to follow an admin 307 to plain http with the secret',
    async (script, targetArg) => {
      const receiver = await startRecordingServer();
      const target = await startRecordingServer((request, response) => {
        if (!request.url.startsWith('/api/admin/')) return notFound(request, response);
        response.writeHead(307, { Location: `${receiver.base}${request.url}` }).end();
      });
      const result = await runEntry(script, targetArg(target.base), true);

      expect(result.code, result.stderr).toBe(1);
      expect(target.requests).toContain('POST /api/admin/login');
      expect(receiver.requests).not.toContain('POST /api/admin/login');
    }
  );
});
