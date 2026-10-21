// The recorded /api/* requests the wire-diff compares two hosts with: SvelteKit's
// adapter-netlify function as it served /api before the move, and the plain
// Netlify Function that serves it now. Both are V2 functions behind the same
// Netlify edge, so "the same on the wire" is the same Response for the same
// Request and context — status, every header, and body bytes — and that is what
// `driveWireCorpus` records.
//
// Every case is one the server answers by itself: no model call, no GitHub
// issue, no Netlify Blobs (no Blobs context exists, so every store is
// unconfigured). The bodies are the documented shapes in docs/API.md, the legacy
// multipart generate-image body (ADR-0064), and the cross-site form posts
// SvelteKit's CSRF guard refuses before any handler runs.

import { ADMIN_SECRET, WIRE_ORIGIN, wireCases } from './wire-cases.mjs';

export { API_PATHS } from './wire-cases.mjs';

// Every private variable the API reads, declared so neither host inherits one from
// the ambient environment. `applyWireEnv` deletes the empty ones.
const WIRE_ENV = {
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

// Every case runs at this instant, so a Retry-After counts down from a whole window.
const WIRE_CLOCK_MS = Date.UTC(2026, 9, 20, 12);

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
  const realNow = Date.now;
  Date.now = () => WIRE_CLOCK_MS;
  try {
    for (const testCase of wireCases()) {
      const context = { ip: testCase.ip, waitUntil: () => {} };
      const response = await handle(buildRequest(testCase, session), context);
      const normalized = await normalizeResponse(response);
      if (testCase.name === 'admin login, right key') session = JSON.parse(normalized.body).session;
      results[testCase.name] = normalized;
    }
  } finally {
    Date.now = realNow;
  }
  return results;
}
