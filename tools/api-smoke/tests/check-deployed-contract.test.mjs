import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const packageVersion = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;
const commitCount = execFileSync('git', ['describe', '--tags', '--long', '--match', 'v*'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .trim()
  .match(/-(\d+)-g[0-9a-f]+$/)[1];
const expectedVersion = `${packageVersion.split('.').slice(0, 2).join('.')}.${commitCount}`;
const session = 'a'.repeat(64);
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Access-Token, X-Api-Key, X-Async-Generation, X-Installation-Id, X-Report-Token',
  'Access-Control-Expose-Headers': 'X-Free-Generations-Remaining, X-Report-Token',
  'Access-Control-Max-Age': '86400',
};
const netlifyEdgeSecurityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
};
const servers = [];
const netlifyToml = readFileSync(join(repoRoot, 'netlify.toml'), 'utf8');
const wildcardHeaders = netlifyToml
  .slice(netlifyToml.indexOf('for = "/*"'))
  .split('[[headers]]')[0];
const securityHeaders = Object.fromEntries(
  [
    ...wildcardHeaders.matchAll(
      /^\s*([\w-]+)\s*=\s*(?:"""([\s\S]*?)"""|"([^"\n]*)"|'([^'\n]*)')/gm
    ),
  ].map((match) => [
    match[1],
    (match[2] ?? match[3] ?? match[4]).replace(/\\\s*/g, ' ').replace(/\s+/g, ' ').trim(),
  ])
);

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))
  );
});

function send(response, status, body = '', headers = {}) {
  response.writeHead(status, headers);
  response.end(body);
}

function sendJson(response, status, body, headers = {}) {
  send(response, status, JSON.stringify(body), {
    'Content-Type': 'application/json',
    ...headers,
  });
}

async function startDeploy({ omitSecurityHeader, version = expectedVersion } = {}) {
  const tokens = new Set(['existing-token']);
  const server = createServer(async (request, response) => {
    let requestBody = '';
    for await (const chunk of request) requestBody += chunk;
    const url = new URL(request.url, 'http://localhost');
    const routeSecurityHeaders = Object.fromEntries(
      Object.entries(securityHeaders).filter(([name]) => name !== omitSecurityHeader)
    );

    if (url.pathname === '/' || url.pathname === '/privacy') {
      const asset =
        url.pathname === '/' ? '<script src="/_app/immutable/start-abc.js"></script>' : '';
      send(response, 200, `<html><body>${asset}</body></html>`, {
        'Content-Type': 'text/html',
        ...routeSecurityHeaders,
      });
      return;
    }
    if (url.pathname === '/_app/immutable/start-abc.js') {
      send(response, 200, 'export {};', {
        'Content-Type': 'text/javascript',
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      return;
    }
    if (url.pathname === '/version.json') {
      sendJson(
        response,
        200,
        { version },
        {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      );
      return;
    }
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      send(response, 204, '', { ...corsHeaders, ...netlifyEdgeSecurityHeaders });
      return;
    }
    if (url.pathname === '/api/admin/login') {
      sendJson(response, 200, { ok: true, session }, corsHeaders);
      return;
    }
    if (url.pathname === '/api/admin/tokens') {
      if (request.headers.authorization !== `Bearer ${session}`) {
        sendJson(response, 401, { ok: false, error: 'Unauthorized' }, corsHeaders);
        return;
      }
      const token = requestBody ? JSON.parse(requestBody).token : undefined;
      if (request.method === 'POST') tokens.add(token);
      if (request.method === 'DELETE') tokens.delete(token);
      sendJson(
        response,
        200,
        {
          ok: true,
          tokens: [...tokens],
          invites: [],
          persistent: true,
        },
        corsHeaders
      );
      return;
    }
    const status = url.pathname === '/api/generate-image' ? 403 : 400;
    sendJson(response, status, { ok: false, error: 'Expected failure' }, corsHeaders);
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function runSmoke(base, env = {}) {
  const child = spawn(
    process.execPath,
    [
      '--experimental-strip-types',
      '--disable-warning=ExperimentalWarning',
      'tools/api-smoke/check-deployed-contract.mjs',
      `--url=${base}`,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ADMIN_ACCESS_TOKEN: 'test-admin-secret',
        DEPLOY_SMOKE_ALLOW_HTTP_FOR_TESTS: '1',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const [code] = await once(child, 'exit');
  return { code, stdout, stderr };
}

function bareImports(entry, visited = new Set()) {
  if (visited.has(entry)) return [];
  visited.add(entry);
  const source = readFileSync(entry, 'utf8');
  const specifiers = [...source.matchAll(/^import[\s\S]*?from\s+['"]([^'"]+)['"];?$/gm)].map(
    (match) => match[1]
  );
  return specifiers.flatMap((specifier) => {
    if (specifier.startsWith('node:')) return [];
    if (!specifier.startsWith('.')) return [specifier];
    return bareImports(resolve(dirname(entry), specifier), visited);
  });
}

describe('hosted deploy contract smoke', () => {
  it('keeps the no-install workflow entry transitively dependency-free', () => {
    expect(bareImports(join(repoRoot, 'tools/api-smoke/check-deployed-contract.mjs'))).toEqual([]);
  });

  it('passes the complete dependency-free remote contract', async () => {
    const result = await runSmoke(await startDeploy());

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('version.json → 200 current checked-out web version');
    expect(result.stdout).toContain('Blobs is live on the deployed function (persistent:true)');
  });

  it('allows default production to trail an intentionally skipped commit', async () => {
    const base = await startDeploy({ version: '1.5.1' });
    const exact = await runSmoke(base);
    const scheduled = await runSmoke(base, { DEPLOY_SMOKE_REQUIRE_CURRENT_VERSION: 'false' });

    expect(exact.code).toBe(1);
    expect(exact.stderr).toContain('version.json → 200 current checked-out web version');
    expect(scheduled.code, scheduled.stderr).toBe(0);
    expect(scheduled.stdout).toContain('version.json → 200 valid deployed web version');
  });

  it('limits the HTTP test escape hatch to explicitly allowed loopback hosts', async () => {
    const result = await runSmoke('http://0.0.0.0:1');

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Missing or invalid config');
  });

  it('fails when a deployed static route loses a security header', async () => {
    const result = await runSmoke(await startDeploy({ omitSecurityHeader: 'X-Frame-Options' }));

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('GET / → deployed HTML with security headers');
    expect(result.stderr).toContain('X-Frame-Options=null');
  });
});
