// The labeled AI fixture server for AI-1: every hosted AI endpoint either arm calls (shipping on
// its own origin, RN web on https://splotch.art) is answered here from a scripted case, and every
// request is recorded with the facts AI-1 compares (method, path, content type, Origin, upload
// format and size). No request reaches a real host, so no generation is charged. Generated
// pictures are the shipping AI harness's own fixtures (web/tests/artifacts).
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const ARTIFACTS = new URL('../../../../../web/tests/artifacts/', import.meta.url);
export const FIXTURE_PICTURES = {
  portrait: readFileSync(new URL('ai-output-portrait.jpeg', ARTIFACTS)),
  landscape: readFileSync(new URL('ai-output-landscape.jpeg', ARTIFACTS)),
};
// Stands in for the signed token a free run carries into its report (web/tests/ai-harness.ts).
export const FIXTURE_REPORT_TOKEN = '9999999999999.mock-signature';
export const FIXTURE_JOB_ID = 'a'.repeat(64);
const GRANT = { ok: true, remaining: 10, limit: 10 };

async function describeUpload(request) {
  const type = request.headers()['content-type'] ?? null;
  const body = request.postDataBuffer();
  const summary = { contentType: type?.split(';')[0] ?? null, bytes: body?.length ?? 0 };
  if (!body || !type) return summary;
  if (type.startsWith('image/')) {
    const meta = await sharp(body)
      .metadata()
      .catch(() => null);
    return {
      ...summary,
      format: meta?.format ?? null,
      width: meta?.width ?? null,
      height: meta?.height ?? null,
    };
  }
  if (type.startsWith('multipart/form-data')) {
    const boundary = /boundary=([^;]+)/.exec(type)?.[1];
    const parts = boundary
      ? body
          .toString('latin1')
          .split(`--${boundary}`)
          .map((part) =>
            /name="([^"]+)"(?:; filename="[^"]*")?\r\n(?:Content-Type: ([^\r\n]+))?/.exec(part)
          )
          .filter(Boolean)
          .map((match) => `${match[1]}${match[2] ? `:${match[2]}` : ''}`)
      : [];
    return { ...summary, parts };
  }
  return summary;
}

// `script` maps an endpoint path to a list of replies served in order (the last one repeats).
// A reply is a function of the request number returning { status, json | body, contentType,
// headers } or the string 'hang' for a request that never answers.
export async function installAiFixture(context, script = {}) {
  const log = [];
  const counts = {};
  await context.route(/\/api\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const origin = request.headers().origin ?? null;
    const cors = {
      'Access-Control-Allow-Origin': origin ?? '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Expose-Headers': 'X-Report-Token, X-Free-Generations-Remaining, Retry-After',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    counts[url.pathname] = (counts[url.pathname] ?? 0) + 1;
    const entry = {
      at: Date.now(),
      method: request.method(),
      host: url.host,
      path: url.pathname,
      query: url.search,
      origin,
      upload: request.method() === 'POST' ? await describeUpload(request) : null,
      credential: ['x-api-key', 'x-access-token', 'x-installation-id', 'x-report-token'].filter(
        (name) => request.headers()[name]
      ),
    };
    const replies = script[url.pathname] ??
      defaultReplies[url.pathname] ?? [
        () => ({ status: 503, json: { ok: false, error: 'Fixture: not modeled' } }),
      ];
    const reply = await replies[Math.min(counts[url.pathname], replies.length) - 1](
      counts[url.pathname],
      entry
    );
    entry.reply = reply === 'hang' ? 'hang' : reply.status;
    log.push(entry);
    if (reply === 'hang') return;
    const headers = { ...cors, ...(reply.headers ?? {}) };
    if (reply.json !== undefined)
      return route.fulfill({
        status: reply.status,
        headers,
        contentType: 'application/json',
        body: JSON.stringify(reply.json),
      });
    return route.fulfill({
      status: reply.status,
      headers,
      contentType: reply.contentType ?? 'application/octet-stream',
      body: reply.body ?? '',
    });
  });
  return log;
}

const defaultReplies = {
  '/api/free-generation-grant': [() => ({ status: 200, json: GRANT })],
  '/api/verify-key': [() => ({ status: 200, json: { ok: true } })],
  '/api/verify-access-code': [
    () => ({ status: 200, json: { ok: true, accessCode: 'parity-access-code' } }),
  ],
  '/api/report-image': [
    () => ({
      status: 200,
      json: { ok: true, reportId: '17-00000000-0000-0000-0000-000000000001' },
    }),
  ],
  '/api/report': [() => ({ status: 200, json: { ok: true } })],
};

export const AI_REPLIES = {
  picture:
    (orientation = 'portrait') =>
    () => ({
      status: 200,
      contentType: 'image/jpeg',
      body: FIXTURE_PICTURES[orientation],
      headers: { 'X-Report-Token': FIXTURE_REPORT_TOKEN, 'X-Free-Generations-Remaining': '9' },
    }),
  refusal: () => ({
    status: 422,
    json: { ok: false, error: 'Fixture: the provider refused this picture.' },
    headers: { 'X-Report-Token': FIXTURE_REPORT_TOKEN },
  }),
  serverError: () => ({ status: 500, json: { ok: false, error: 'Fixture: generation failed.' } }),
  bare502: () => ({
    status: 502,
    contentType: 'text/html',
    body: '<html><body>Bad gateway</body></html>',
  }),
  throttled: () => ({
    status: 429,
    json: { ok: false, error: 'Fixture: too many requests.' },
    headers: { 'Retry-After': '60' },
  }),
  ticket: () => ({ status: 202, json: { ok: true, jobId: FIXTURE_JOB_ID, pollAfterMs: 3000 } }),
  pending: () => ({ status: 202, json: { ok: true } }),
  malformedJson: () => ({ status: 200, contentType: 'application/json', body: '{"ok": tru' }),
  wrongType: () => ({ status: 200, contentType: 'text/html', body: '<html>not a picture</html>' }),
  unexpectedFields: () => ({ status: 500, json: { ok: false, error: 'Fixture', debug: 'extra' } }),
  hang: () => 'hang',
};

// A reply held until the cell releases it, for states that must be observed mid-run.
export function heldReply(reply) {
  let release;
  const released = new Promise((resolve) => {
    release = resolve;
  });
  return { reply: () => released.then(() => reply()), release: () => release() };
}
