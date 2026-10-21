import { createServer } from 'node:http';
import { readFileSync, statSync, appendFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { AI_REPLIES } from '../../2026-10-18-device-parity/results/web/ai-fixture.mjs';
import { RESPONSE_CSP_DIRECTIVES, serializeCspDirectives } from '../../../../web/securityPolicy.ts';

const root = resolve('experiments/native-architecture/dist/web');
const port = Number(process.env.HUNT_PORT ?? 6150);
if (!Number.isInteger(port) || port < 6150 || port > 6189)
  throw new Error('QA host port must be in the assigned 6150–6189 range.');
const log = resolve('docs/scratchpad/2026-10-21-rn-bug-hunt-web/evidence/run4/host.jsonl');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};
const securityHeaders = {
  'Content-Security-Policy': serializeCspDirectives(RESPONSE_CSP_DIRECTIVES),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Reporting-Endpoints': 'csp="/api/csp-report"',
};
const session = 'a'.repeat(64);
const tokens = new Set(['run4-fixture-code']);
const snapshot = (origin) => ({
  ok: true,
  persistent: true,
  tokens: [...tokens],
  invites: [...tokens].map((token) => ({ token, url: `${origin}/?ai_access_token=${token}` })),
});
function fileAt(pathname) {
  const file = resolve(root, `.${decodeURIComponent(pathname)}`);
  if (!file.startsWith(root + sep)) return null;
  try {
    return statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}
async function api(request, pathname, origin) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString();
  let body;
  try {
    body = JSON.parse(text || '{}');
  } catch {
    body = {};
  }
  if (pathname === '/api/admin/login')
    return body.key === 'run4-test-secret'
      ? { status: 200, json: { ok: true, session } }
      : { status: 403, json: { ok: false, error: 'Incorrect access key.' } };
  if (pathname.startsWith('/api/admin/')) {
    if (request.headers.authorization !== `Bearer ${session}`)
      return { status: 401, json: { ok: false, error: 'Unauthorized' } };
    if (pathname === '/api/admin/tokens') {
      if (request.method === 'POST') tokens.add(body.token);
      if (request.method === 'DELETE') tokens.delete(body.token);
      return { status: 200, json: { ...snapshot(origin), changed: true } };
    }
    if (pathname === '/api/admin/stats')
      return {
        status: 200,
        json: {
          ok: true,
          usageAvailable: true,
          codes: [...tokens].map((token) => ({ token, usage: null })),
          freeGrantStats: {
            persistent: true,
            dailyProviderStarts: 4,
            dailyProviderStartLimit: 500,
            sampledGrantCount: 1,
            grantSampleLimit: 200,
            grantSamplePartial: false,
            sampledSuccessful: 2,
            sampledAttempts: 3,
            sampledFailures: 1,
            sampledActiveGrants: 1,
            sampledExhaustedGrants: 0,
            sampledActiveReservations: 0,
            recent: [
              {
                installation: 'cccccccc',
                successful: 2,
                attempts: 3,
                failures: 1,
                remaining: 8,
                lastActivityAt: '2026-10-21T08:00:00.000Z',
                lastFailureKind: 'safety',
              },
            ],
          },
        },
      };
  }
  if (pathname === '/api/generate-image') return AI_REPLIES.picture()();
  if (pathname === '/api/free-generation-grant')
    return { status: 200, json: { ok: true, remaining: 10, limit: 10 } };
  if (
    pathname === '/api/report' ||
    pathname === '/api/report-image' ||
    pathname === '/api/verify-key'
  )
    return { status: 200, json: { ok: true } };
  return { status: 503, json: { ok: false, error: 'Local fixture: endpoint not modeled' } };
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const reply = await api(request, url.pathname, url.origin);
      appendFileSync(
        log,
        JSON.stringify({
          at: new Date().toISOString(),
          method: request.method,
          pathname: url.pathname,
          status: reply.status,
          fixture: true,
        }) + '\n'
      );
      response.writeHead(reply.status, {
        'Content-Type': reply.contentType ?? 'application/json',
        'Cache-Control': 'no-store',
        ...reply.headers,
      });
      response.end(reply.json ? JSON.stringify(reply.json) : reply.body);
      return;
    }
    const file =
      fileAt(url.pathname === '/' ? '/index.html' : url.pathname) ?? fileAt(`${url.pathname}.html`);
    const selected = file ?? resolve(root, '404.html');
    const status = file ? 200 : 404;
    appendFileSync(
      log,
      JSON.stringify({
        at: new Date().toISOString(),
        pathname: url.pathname,
        status,
        file: selected.slice(root.length),
      }) + '\n'
    );
    response.writeHead(status, {
      'Content-Type': types[extname(selected)] ?? 'application/octet-stream',
      'Cache-Control': ['/admin', '/admin.html'].includes(url.pathname) ? 'no-store' : 'no-cache',
      ...securityHeaders,
    });
    response.end(readFileSync(selected));
  } catch (error) {
    response.writeHead(500);
    response.end(String(error));
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(JSON.stringify({ port, pid: process.pid, root }))
);
process.on('SIGTERM', () => server.close(() => process.exit(0)));
