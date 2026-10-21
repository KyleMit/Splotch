// The recorded /api/* requests the wire-diff compares two hosts with: SvelteKit's
// adapter-netlify function as it served /api before the move, and the plain
// Netlify Functions that serve it now. Both are V2 functions behind the same
// Netlify edge, so "the same on the wire" is the same Response for the same
// Request and context — status, every header, and body bytes — and that is what
// `driveWireCorpus` records.
//
// Every case is one the server answers by itself: no model call, no GitHub
// issue, no Netlify Blobs (no Blobs context exists, so every store is
// unconfigured). The bodies are the documented shapes in docs/API.md, the legacy
// multipart generate-image body (ADR-0064), and the cross-site form posts
// SvelteKit's CSRF guard refuses before any handler runs.

export const WIRE_ORIGIN = 'https://splotch.art';

const ADMIN_SECRET = 'wire-admin-secret';

// Every private variable the API reads, declared so neither host inherits one from
// the ambient environment. `applyWireEnv` deletes the empty ones.
export const WIRE_ENV = {
  ADMIN_ACCESS_TOKEN: ADMIN_SECRET,
  ALLOWED_TOKENS_LIST: 'alpha,beta',
  AI_RECOVERY_V1_ENABLED: '',
  GENERATE_DEADLINE_MS_OVERRIDE: '',
  GITHUB_ISSUE_REPO: '',
  GITHUB_ISSUE_TOKEN: '',
  // A project key lets the managed and free doors reach their input checks; the
  // unroutable base URL fails any call that reaches the model in place of OpenAI.
  OPENAI_API_KEY: 'wire-project-key',
  OPENAI_BASE_URL: 'http://127.0.0.1:9/v1',
  REPORT_TOKEN_SECRET: '',
  USAGE_GRANT_ID_SECRET: '',
};

export function applyWireEnv(env) {
  for (const [name, value] of Object.entries(WIRE_ENV)) {
    if (value) env[name] = value;
    else delete env[name];
  }
}

// The response headers a host cannot hold constant from one run to the next.
const VOLATILE_HEADERS = new Set(['date']);

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const INSTALLATION_ID = 'a'.repeat(64);
const JOB_ID = 'b'.repeat(64);
const UNTRUSTED_ORIGIN = 'https://attacker.example';
const ANDROID_ORIGIN = 'https://localhost';
const IOS_ORIGIN = 'capacitor://localhost';

export const API_PATHS = [
  '/api/admin/login',
  '/api/admin/tokens',
  '/api/csp-report',
  '/api/free-generation-grant',
  '/api/generate-image',
  '/api/generation-attempt/v1',
  '/api/generation-result',
  '/api/report',
  '/api/report-image',
  '/api/verify-access-code',
  '/api/verify-key',
];

const json = (body) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function legacyGenerateForm({ token, mimeType = 'image/png' }) {
  const form = new FormData();
  if (token) form.set('token', token);
  form.set('style', 'watercolor');
  form.set('image', new Blob([TINY_PNG], { type: mimeType }), 'drawing');
  return form;
}

function imageReportForm() {
  const form = new FormData();
  form.set('kind', 'unsafe');
  form.set('drawing', new Blob([TINY_PNG], { type: 'image/png' }), 'drawing.png');
  form.set('output', new Blob([TINY_PNG], { type: 'image/png' }), 'output.png');
  form.set('style', 'watercolor');
  return form;
}

const cspReportUri = {
  'csp-report': {
    'document-uri': 'https://splotch.art/?secret=1#frag',
    'blocked-uri': 'https://evil.example/x.js?q=1',
    'effective-directive': 'script-src-elem',
    disposition: 'enforce',
    'line-number': 3,
  },
};

const cspReportingApi = [
  {
    type: 'csp-violation',
    url: 'https://splotch.art/',
    body: { blockedURL: 'inline', effectiveDirective: 'style-src-attr', disposition: 'report' },
  },
];

/** The ordered request list. Each case names its own client address, so no case spends another's budget. */
export function wireCases() {
  let address = 0;
  const ip = () => `203.0.113.${++address}`;
  const session = '__ADMIN_SESSION__';
  const cases = [
    ...API_PATHS.map((path) => ({ name: `OPTIONS ${path}`, method: 'OPTIONS', path })),
    ...API_PATHS.map((path) => ({
      name: `OPTIONS ${path} from the iOS WebView`,
      method: 'OPTIONS',
      path,
      headers: {
        origin: IOS_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, x-access-token',
      },
    })),

    {
      name: 'admin login, wrong key',
      method: 'POST',
      path: '/api/admin/login',
      ...json({ key: 'nope' }),
    },
    {
      name: 'admin login, right key',
      method: 'POST',
      path: '/api/admin/login',
      ...json({ key: ADMIN_SECRET }),
    },
    {
      name: 'admin login, malformed body',
      method: 'POST',
      path: '/api/admin/login',
      headers: { 'content-type': 'application/json' },
      body: '{',
    },
    {
      name: 'admin login, oversized body',
      method: 'POST',
      path: '/api/admin/login',
      ...json({ key: 'x'.repeat(9 * 1024) }),
    },
    { name: 'admin login, GET', method: 'GET', path: '/api/admin/login' },
    {
      name: 'admin login, trailing slash',
      method: 'POST',
      path: '/api/admin/login/?x=1',
      ...json({ key: 'nope' }),
    },
    {
      name: 'admin login, cross-site text/plain form post',
      method: 'POST',
      path: '/api/admin/login',
      headers: { origin: UNTRUSTED_ORIGIN, 'content-type': 'text/plain' },
      body: JSON.stringify({ key: ADMIN_SECRET }),
    },

    { name: 'tokens, no auth', method: 'GET', path: '/api/admin/tokens' },
    {
      name: 'tokens, bad bearer',
      method: 'GET',
      path: '/api/admin/tokens',
      headers: { authorization: 'Bearer deadbeef' },
    },
    {
      name: 'tokens, list',
      method: 'GET',
      path: '/api/admin/tokens',
      headers: { authorization: `Bearer ${session}` },
    },
    {
      name: 'tokens, add',
      method: 'POST',
      path: '/api/admin/tokens',
      headers: { authorization: `Bearer ${session}`, 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'gamma' }),
    },
    {
      name: 'tokens, remove',
      method: 'DELETE',
      path: '/api/admin/tokens',
      headers: { authorization: `Bearer ${session}`, 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'alpha' }),
    },
    {
      name: 'tokens, malformed mutation',
      method: 'POST',
      path: '/api/admin/tokens',
      headers: { authorization: `Bearer ${session}`, 'content-type': 'application/json' },
      body: 'not json',
    },
    {
      name: 'tokens, PUT',
      method: 'PUT',
      path: '/api/admin/tokens',
      headers: { authorization: `Bearer ${session}` },
    },

    {
      name: 'verify-access-code, empty',
      method: 'POST',
      path: '/api/verify-access-code',
      ...json({ code: '  ' }),
    },
    {
      name: 'verify-access-code, wrong',
      method: 'POST',
      path: '/api/verify-access-code',
      ...json({ code: 'zeta' }),
    },
    {
      name: 'verify-access-code, seeded',
      method: 'POST',
      path: '/api/verify-access-code',
      ...json({ code: 'alpha' }),
    },
    {
      name: 'verify-access-code, malformed',
      method: 'POST',
      path: '/api/verify-access-code',
      headers: { 'content-type': 'application/json' },
      body: '[',
    },
    {
      name: 'verify-access-code, from the Android WebView',
      method: 'POST',
      path: '/api/verify-access-code',
      headers: { origin: ANDROID_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'zeta' }),
    },

    { name: 'verify-key, empty', method: 'POST', path: '/api/verify-key', ...json({}) },
    {
      name: 'verify-key, malformed',
      method: 'POST',
      path: '/api/verify-key',
      headers: { 'content-type': 'application/json' },
      body: 'x',
    },
    { name: 'verify-key, GET', method: 'GET', path: '/api/verify-key' },

    { name: 'free grant, no installation', method: 'GET', path: '/api/free-generation-grant' },
    {
      name: 'free grant, no grant store',
      method: 'GET',
      path: '/api/free-generation-grant',
      headers: { 'x-installation-id': INSTALLATION_ID },
    },
    { name: 'free grant, HEAD', method: 'HEAD', path: '/api/free-generation-grant' },
    { name: 'free grant, POST', method: 'POST', path: '/api/free-generation-grant', ...json({}) },

    {
      name: 'report, empty message',
      method: 'POST',
      path: '/api/report',
      ...json({ kind: 'bug', message: '   ' }),
    },
    {
      name: 'report, bad kind',
      method: 'POST',
      path: '/api/report',
      ...json({ kind: 'nope', message: 'hi' }),
    },
    {
      name: 'report, unconfigured',
      method: 'POST',
      path: '/api/report',
      ...json({ kind: 'feature', message: 'A stamps tool please' }),
    },
    {
      name: 'report, honeypot',
      method: 'POST',
      path: '/api/report',
      ...json({ kind: 'feature', message: 'A stamps tool please', hp: 'bot' }),
    },
    {
      name: 'report, cross-site text/plain form post',
      method: 'POST',
      path: '/api/report',
      headers: { origin: UNTRUSTED_ORIGIN, 'content-type': 'text/plain' },
      body: JSON.stringify({ kind: 'bug', message: 'hi' }),
    },
    {
      name: 'report, cross-site urlencoded form post accepting JSON',
      method: 'POST',
      path: '/api/report',
      headers: {
        origin: UNTRUSTED_ORIGIN,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: 'kind=bug&message=hi',
    },
    {
      name: 'report, text/plain form post with no Origin',
      method: 'POST',
      path: '/api/report',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ kind: 'bug', message: 'hi' }),
    },
    {
      name: 'report, same-origin text/plain post',
      method: 'POST',
      path: '/api/report',
      headers: { origin: WIRE_ORIGIN, 'content-type': 'text/plain; charset=utf-8' },
      body: JSON.stringify({ kind: 'bug', message: '   ' }),
    },
    {
      name: 'report, iOS WebView text/plain post',
      method: 'POST',
      path: '/api/report',
      headers: { origin: IOS_ORIGIN, 'content-type': 'text/plain' },
      body: JSON.stringify({ kind: 'bug', message: '   ' }),
    },
    { name: 'report, DELETE', method: 'DELETE', path: '/api/report' },

    {
      name: 'report-image, unconfigured',
      method: 'POST',
      path: '/api/report-image',
      form: imageReportForm,
      headers: { origin: ANDROID_ORIGIN },
    },
    {
      name: 'report-image, multipart with no Origin',
      method: 'POST',
      path: '/api/report-image',
      form: imageReportForm,
    },

    {
      name: 'csp-report, report-uri',
      method: 'POST',
      path: '/api/csp-report',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify(cspReportUri),
    },
    {
      name: 'csp-report, reporting api',
      method: 'POST',
      path: '/api/csp-report',
      headers: { 'content-type': 'application/reports+json' },
      body: JSON.stringify(cspReportingApi),
    },
    {
      name: 'csp-report, wrong type',
      method: 'POST',
      path: '/api/csp-report',
      headers: { 'content-type': 'application/xml' },
      body: '<x/>',
    },
    {
      name: 'csp-report, oversized',
      method: 'POST',
      path: '/api/csp-report',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pad: 'x'.repeat(33 * 1024) }),
    },
    {
      name: 'csp-report, garbage',
      method: 'POST',
      path: '/api/csp-report',
      headers: { 'content-type': 'application/json' },
      body: '{nope',
    },
    {
      name: 'csp-report, cross-site text/plain',
      method: 'POST',
      path: '/api/csp-report',
      headers: { origin: UNTRUSTED_ORIGIN, 'content-type': 'text/plain' },
      body: JSON.stringify(cspReportUri),
    },
    { name: 'csp-report, GET', method: 'GET', path: '/api/csp-report' },

    {
      name: 'generate-image, invalid token',
      method: 'POST',
      path: '/api/generate-image',
      headers: { 'x-access-token': 'not-a-real-token', 'content-type': 'image/png' },
      body: TINY_PNG,
    },
    {
      name: 'generate-image, no credential',
      method: 'POST',
      path: '/api/generate-image',
      headers: { 'content-type': 'image/png' },
      body: TINY_PNG,
    },
    {
      name: 'generate-image, valid token, no image',
      method: 'POST',
      path: '/api/generate-image?style=watercolor',
      headers: { 'x-access-token': 'alpha', 'content-type': 'image/png' },
    },
    {
      name: 'generate-image, valid token, untyped image',
      method: 'POST',
      path: '/api/generate-image',
      headers: { 'x-access-token': 'alpha' },
      body: TINY_PNG,
    },
    {
      name: 'generate-image, valid token, oversized image',
      method: 'POST',
      path: '/api/generate-image',
      headers: { 'x-access-token': 'alpha', 'content-type': 'image/png' },
      body: Buffer.alloc(15 * 1024 * 1024 + 1),
    },
    {
      name: 'generate-image, valid token, gif',
      method: 'POST',
      path: '/api/generate-image',
      headers: { 'x-access-token': 'alpha', 'content-type': 'image/gif' },
      body: TINY_PNG,
    },
    {
      name: 'generate-image, free door, no grant store',
      method: 'POST',
      path: '/api/generate-image',
      headers: { 'x-installation-id': INSTALLATION_ID, 'content-type': 'image/png' },
      body: TINY_PNG,
    },
    {
      name: 'generate-image, legacy multipart from the iOS WebView, invalid token',
      method: 'POST',
      path: '/api/generate-image',
      form: () => legacyGenerateForm({ token: 'not-a-real-token' }),
      headers: { origin: IOS_ORIGIN },
    },
    {
      name: 'generate-image, legacy multipart from the Android WebView, valid token, gif',
      method: 'POST',
      path: '/api/generate-image',
      form: () => legacyGenerateForm({ token: 'alpha', mimeType: 'image/gif' }),
      headers: { origin: ANDROID_ORIGIN },
    },
    {
      name: 'generate-image, legacy multipart, cross-site',
      method: 'POST',
      path: '/api/generate-image',
      form: () => legacyGenerateForm({ token: 'alpha' }),
      headers: { origin: UNTRUSTED_ORIGIN },
    },
    {
      name: 'generate-image, legacy multipart, no Origin',
      method: 'POST',
      path: '/api/generate-image',
      form: () => legacyGenerateForm({ token: 'alpha' }),
    },
    { name: 'generate-image, GET', method: 'GET', path: '/api/generate-image' },

    { name: 'generation-result, no job', method: 'GET', path: '/api/generation-result' },
    {
      name: 'generation-result, malformed job',
      method: 'GET',
      path: '/api/generation-result?job=nope',
    },
    {
      name: 'generation-result, well-formed job, no store',
      method: 'GET',
      path: `/api/generation-result?job=${JOB_ID}`,
    },

    {
      name: 'generation-attempt, capability',
      method: 'GET',
      path: '/api/generation-attempt/v1',
      headers: { 'x-ai-recovery-version': 'splotch-ai-recovery-v1' },
    },
    { name: 'generation-attempt, no version', method: 'GET', path: '/api/generation-attempt/v1' },
    {
      name: 'generation-attempt, admission',
      method: 'POST',
      path: '/api/generation-attempt/v1?style=watercolor',
      headers: {
        'x-ai-recovery-version': 'splotch-ai-recovery-v1',
        'x-access-token': 'alpha',
        'content-type': 'image/png',
      },
      body: TINY_PNG,
    },
    { name: 'generation-attempt, DELETE', method: 'DELETE', path: '/api/generation-attempt/v1' },
  ];
  return cases.map((testCase) => ({ ...testCase, ip: ip() }));
}

function buildRequest(testCase, session) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(testCase.headers ?? {})) {
    headers.set(name, value.replace('__ADMIN_SESSION__', session));
  }
  // A form gets a fresh boundary each run; nothing in a response echoes it.
  const body = testCase.form ? testCase.form() : testCase.body;
  return new Request(new URL(testCase.path, WIRE_ORIGIN), {
    method: testCase.method,
    headers,
    body: body ?? undefined,
  });
}

async function normalizeResponse(response) {
  const headers = [...response.headers]
    .filter(([name]) => !VOLATILE_HEADERS.has(name))
    .sort(([a], [b]) => a.localeCompare(b));
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers, body: bytes.toString('utf8') };
}

/**
 * Drive every case through `handle` (a V2 function: (Request, Context) => Response)
 * and return the normalized responses, keyed by case name. `session` is the admin
 * session the host's login case returned, substituted into the bearer cases.
 */
export async function driveWireCorpus(handle) {
  const results = {};
  let session = 'unset';
  for (const testCase of wireCases()) {
    const context = { ip: testCase.ip, waitUntil: () => {} };
    const response = await handle(buildRequest(testCase, session), context);
    const normalized = await normalizeResponse(response);
    if (testCase.name === 'admin login, right key') session = JSON.parse(normalized.body).session;
    results[testCase.name] = normalized;
  }
  return results;
}
