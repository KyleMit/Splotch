// The wire-diff corpus's requests (wire-corpus.mjs drives them). Each case is
// one the server answers by itself; see wire-corpus.mjs for what that excludes.

export const WIRE_ORIGIN = 'https://splotch.art';

export const ADMIN_SECRET = 'wire-admin-secret';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const INSTALLATION_ID = 'a'.repeat(64);
const JOB_ID = 'b'.repeat(64);
export const UNTRUSTED_ORIGIN = 'https://attacker.example';
// rateLimitPolicy.verifyAccessCode's limit, which the base the baseline was
// recorded from also enforced.
const SHARED_GUESS_BUDGET = 10;
const CODE_GUESSER = '198.51.100.10';
const TOKEN_GUESSER = '198.51.100.20';
const ANDROID_ORIGIN = 'https://localhost';
export const IOS_ORIGIN = 'capacitor://localhost';

// The paths SvelteKit served, whose answers fixtures/wire-baseline.json recorded.
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

export const jsonBody = (body) => ({
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
      ...jsonBody({ key: 'nope' }),
    },
    {
      name: 'admin login, right key',
      method: 'POST',
      path: '/api/admin/login',
      ...jsonBody({ key: ADMIN_SECRET }),
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
      ...jsonBody({ key: 'x'.repeat(9 * 1024) }),
    },
    { name: 'admin login, GET', method: 'GET', path: '/api/admin/login' },
    {
      name: 'admin login, trailing slash',
      method: 'POST',
      path: '/api/admin/login/?x=1',
      ...jsonBody({ key: 'nope' }),
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
      ...jsonBody({ code: '  ' }),
    },
    {
      name: 'verify-access-code, wrong',
      method: 'POST',
      path: '/api/verify-access-code',
      ...jsonBody({ code: 'zeta' }),
    },
    {
      name: 'verify-access-code, seeded',
      method: 'POST',
      path: '/api/verify-access-code',
      ...jsonBody({ code: 'alpha' }),
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

    { name: 'verify-key, empty', method: 'POST', path: '/api/verify-key', ...jsonBody({}) },
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
    {
      name: 'free grant, POST',
      method: 'POST',
      path: '/api/free-generation-grant',
      ...jsonBody({}),
    },

    {
      name: 'report, empty message',
      method: 'POST',
      path: '/api/report',
      ...jsonBody({ kind: 'bug', message: '   ' }),
    },
    {
      name: 'report, bad kind',
      method: 'POST',
      path: '/api/report',
      ...jsonBody({ kind: 'nope', message: 'hi' }),
    },
    {
      name: 'report, unconfigured',
      method: 'POST',
      path: '/api/report',
      ...jsonBody({ kind: 'feature', message: 'A stamps tool please' }),
    },
    {
      name: 'report, honeypot',
      method: 'POST',
      path: '/api/report',
      ...jsonBody({ kind: 'feature', message: 'A stamps tool please', hp: 'bot' }),
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

    ...sharedGuessBudgetCases(),
  ];
  return cases.map((testCase) => ({ ...testCase, ip: testCase.ip ?? ip() }));
}

// verify-access-code and generate-image's managed-token check spend one per-IP
// failed-guess budget (ADR-0014), held in one instance's rate-limit buckets. Each
// direction spends the budget through one endpoint and is refused by the other.
function sharedGuessBudgetCases() {
  const wrongCode = (n, ip) => ({
    name: `shared guess budget, wrong code ${n} from ${ip}`,
    method: 'POST',
    path: '/api/verify-access-code',
    ...jsonBody({ code: `wrong-${n}` }),
    ip,
  });
  const wrongToken = (n, ip) => ({
    name: `shared guess budget, wrong token ${n} from ${ip}`,
    method: 'POST',
    path: '/api/generate-image',
    headers: { 'x-access-token': `wrong-${n}`, 'content-type': 'image/png' },
    body: TINY_PNG,
    ip,
  });
  const guesses = Array.from({ length: SHARED_GUESS_BUDGET }, (_, n) => n + 1);
  return [
    ...guesses.map((n) => wrongCode(n, CODE_GUESSER)),
    wrongToken(1, CODE_GUESSER),
    ...guesses.map((n) => wrongToken(n, TOKEN_GUESSER)),
    wrongCode(1, TOKEN_GUESSER),
  ];
}
