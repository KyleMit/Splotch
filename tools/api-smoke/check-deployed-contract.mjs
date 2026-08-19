#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { buildMetadata } from '../../web/buildVersion.ts';
import { SECURITY_HEADERS } from '../../web/src/lib/server/securityHeaders.ts';
import { isMain } from '../lib/proc.mjs';
import { check, fatal, json, summarize } from '../lib/smoke.mjs';
import { CORS_HEADERS } from './lib/contract-expectations.mjs';
import { checkDeployedAdminContract } from './lib/deployed-admin-contract.mjs';

const mainModule = isMain(import.meta.url);
const { values: options } = parseArgs({
  args: mainModule ? process.argv.slice(2) : [],
  options: { url: { type: 'string' } },
});
const BASE = (options.url ?? process.env.DEPLOY_SMOKE_URL ?? '').replace(/\/$/, '');
const ADMIN_SECRET = process.env.ADMIN_ACCESS_TOKEN ?? '';
const CAPACITOR_ORIGINS = ['https://localhost', 'capacitor://localhost'];
const VERSION_CACHE_CONTROL = ['no-cache', 'no-store', 'must-revalidate'];
const IMMUTABLE_CACHE_CONTROL = ['public', 'max-age=31536000', 'immutable'];
const packageVersion = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).version;
const EXPECTED_VERSION = buildMetadata({ isCapacitor: false, packageVersion }).appVersion;
// The unit test's fake deploy is a loopback HTTP server; production callers remain HTTPS-only.
const ALLOW_HTTP_FOR_TESTS = process.env.DEPLOY_SMOKE_ALLOW_HTTP_FOR_TESTS === '1';
const REQUIRE_CURRENT_VERSION = process.env.DEPLOY_SMOKE_REQUIRE_CURRENT_VERSION !== 'false';

function missingHeaders(response, expected) {
  return Object.entries(expected)
    .filter(([name, value]) => response.headers.get(name) !== value)
    .map(([name]) => `${name}=${JSON.stringify(response.headers.get(name))}`);
}

function hasCacheDirectives(response, expected) {
  const actual = new Set(
    (response.headers.get('cache-control') ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  return expected.every((value) => actual.has(value));
}

async function checkStaticRoutes() {
  let rootHtml = '';
  for (const path of ['/', '/privacy']) {
    const response = await fetch(`${BASE}${path}`);
    const body = await response.text();
    const missingSecurity = missingHeaders(response, SECURITY_HEADERS);
    check(
      `GET ${path} → deployed HTML with security headers`,
      response.status === 200 &&
        response.headers.get('content-type')?.includes('text/html') &&
        /<html[\s>]/i.test(body) &&
        missingSecurity.length === 0,
      `got ${response.status}; missing/wrong ${missingSecurity.join(', ')}`
    );
    if (path === '/') rootHtml = body;
  }

  const assetPath = rootHtml.match(
    /(?:src|href)="([^"?]*\/_app\/immutable\/[^"?]+\.(?:css|js|woff2))[^"]*"/i
  )?.[1];
  check('home page names a hashed immutable asset', Boolean(assetPath));
  if (assetPath) {
    const response = await fetch(new URL(assetPath, BASE));
    check(
      'hashed app asset → 200 with one-year immutable cache policy',
      response.status === 200 && hasCacheDirectives(response, IMMUTABLE_CACHE_CONTROL),
      `got ${response.status} Cache-Control=${JSON.stringify(response.headers.get('cache-control'))}`
    );
  }
}

async function checkVersion() {
  const response = await fetch(`${BASE}/version.json?deploy-smoke=${randomUUID()}`, {
    cache: 'no-store',
  });
  const body = await json(response);
  const versionIsCurrent = !REQUIRE_CURRENT_VERSION || body?.version === EXPECTED_VERSION;
  check(
    `version.json → 200 ${REQUIRE_CURRENT_VERSION ? 'current checked-out' : 'valid deployed'} web version`,
    response.status === 200 &&
      typeof body?.version === 'string' &&
      /^\d+\.\d+\.\d+(?:\+[0-9a-f]+)?$/.test(body.version) &&
      versionIsCurrent,
    `got ${response.status} ${JSON.stringify(body)}; expected ${EXPECTED_VERSION}`
  );
  check(
    'version.json carries the no-cache policy',
    hasCacheDirectives(response, VERSION_CACHE_CONTROL),
    `Cache-Control=${JSON.stringify(response.headers.get('cache-control'))}`
  );
}

async function checkCors() {
  for (const origin of CAPACITOR_ORIGINS) {
    const response = await fetch(`${BASE}/api/generate-image`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-access-token',
      },
    });
    const wrong = missingHeaders(response, CORS_HEADERS);
    const leakedSecurity = Object.keys(SECURITY_HEADERS).filter((name) =>
      response.headers.has(name)
    );
    check(
      `OPTIONS /api/generate-image from ${origin} → 204 CORS contract`,
      response.status === 204 && wrong.length === 0 && leakedSecurity.length === 0,
      `got ${response.status}; wrong ${wrong.join(', ')}; leaked ${leakedSecurity.join(', ')}`
    );
  }
}

async function checkFailure(name, response, status) {
  const body = await json(response);
  const wrongCors = missingHeaders(response, CORS_HEADERS);
  check(
    `${name} → ${status} canonical failure`,
    response.status === status &&
      body?.ok === false &&
      typeof body?.error === 'string' &&
      wrongCors.length === 0,
    `got ${response.status} ${JSON.stringify(body)}; wrong CORS ${wrongCors.join(', ')}`
  );
}

async function checkUnauthenticatedApi() {
  await checkFailure(
    'GET admin tokens without bearer',
    await fetch(`${BASE}/api/admin/tokens`),
    401
  );
  await checkFailure(
    'GET admin tokens with invalid bearer',
    await fetch(`${BASE}/api/admin/tokens`, {
      headers: { Authorization: 'Bearer not-a-session' },
    }),
    401
  );
  await checkFailure(
    'verify-access-code without a code',
    await fetch(`${BASE}/api/verify-access-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
    400
  );
  await checkFailure(
    'generate-image with an invalid managed token',
    await fetch(`${BASE}/api/generate-image`, {
      method: 'POST',
      headers: { 'X-Access-Token': `deploy-smoke-${randomUUID()}` },
    }),
    403
  );
  await checkFailure(
    'verify-key without a key',
    await fetch(`${BASE}/api/verify-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
    400
  );
  await checkFailure(
    'generation-result with a malformed job id',
    await fetch(`${BASE}/api/generation-result?job=not-a-job-id`),
    400
  );
}

async function run() {
  await checkStaticRoutes();
  await checkVersion();
  await checkCors();
  await checkUnauthenticatedApi();
  await checkDeployedAdminContract(BASE, ADMIN_SECRET);
}

export async function checkDeployedContract() {
  let parsedBase;
  try {
    parsedBase = new URL(BASE);
  } catch {
    parsedBase = null;
  }

  if (!parsedBase || (parsedBase.protocol !== 'https:' && !ALLOW_HTTP_FOR_TESTS) || !ADMIN_SECRET) {
    console.error(
      [
        '[deploy-smoke] Missing or invalid config.',
        '  Set an HTTPS deploy URL (DEPLOY_SMOKE_URL or --url) and ADMIN_ACCESS_TOKEN.',
        '  e.g. DEPLOY_SMOKE_URL=https://deploy-preview-123--splotchy.netlify.app \\',
        '       ADMIN_ACCESS_TOKEN=… npm run test:deploy:smoke',
      ].join('\n')
    );
    process.exit(2);
  }

  console.log(`[deploy-smoke] target: ${BASE}`);
  console.log(`[deploy-smoke] expected version: ${EXPECTED_VERSION}\n`);
  try {
    await run();
  } catch (err) {
    fatal(err);
  }

  summarize();
}

if (mainModule) await checkDeployedContract();
