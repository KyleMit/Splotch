#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { buildMetadata } from '../../web/buildVersion.ts';
import { WEB_CSP_DIRECTIVES } from '../../web/securityPolicy.ts';
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
const HSTS_HEADER = 'Strict-Transport-Security';
const CSP_HEADER = 'Content-Security-Policy';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const NETLIFY_HOST_SUFFIX = '.netlify.app';
const MINIMUM_HSTS_MAX_AGE_SECONDS = 31_536_000;
const NETLIFY_EDGE_SECURITY_HEADERS = new Set([HSTS_HEADER, 'X-Content-Type-Options']);
const EXACT_STATIC_SECURITY_HEADERS = Object.fromEntries(
  Object.entries(SECURITY_HEADERS).filter(([name]) => name !== HSTS_HEADER)
);
const EXACT_SSR_SECURITY_HEADERS = Object.fromEntries(
  Object.entries(SECURITY_HEADERS).filter(([name]) => name !== HSTS_HEADER && name !== CSP_HEADER)
);
const META_UNSUPPORTED_CSP_DIRECTIVES = new Set(['frame-ancestors', 'report-uri']);
const packageVersion = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).version;
const EXPECTED_VERSION = buildMetadata({ isCapacitor: false, packageVersion }).appVersion;
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

function hstsProblems(response, hostname) {
  const platformManagesHsts =
    hostname.endsWith(NETLIFY_HOST_SUFFIX) || LOOPBACK_HOSTS.has(hostname);
  if (!platformManagesHsts) {
    return missingHeaders(response, { [HSTS_HEADER]: SECURITY_HEADERS[HSTS_HEADER] });
  }
  const hsts = response.headers.get(HSTS_HEADER) ?? '';
  const maxAge = Number(hsts.match(/(?:^|;)\s*max-age=(\d+)(?:;|$)/i)?.[1]);
  const directives = new Set(hsts.split(';').map((value) => value.trim().toLowerCase()));
  return Number.isFinite(maxAge) &&
    maxAge >= MINIMUM_HSTS_MAX_AGE_SECONDS &&
    directives.has('includesubdomains')
    ? []
    : [`${HSTS_HEADER}=${JSON.stringify(hsts || null)}`];
}

/** Exported so tests can exercise hostname-specific edge behavior without DNS interception. */
export function missingStaticSecurityHeaders(response, hostname) {
  const missing = missingHeaders(response, EXACT_STATIC_SECURITY_HEADERS);
  missing.push(...hstsProblems(response, hostname));
  return missing;
}

function normalizedCsp(policy) {
  return new Map(
    policy
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter(([directive]) => directive)
      .map(([directive, ...sources]) => [
        directive,
        new Set(sources.map((source) => source.replace(/^'(.*)'$/, '$1'))),
      ])
  );
}

function cspProblems(policy, { html, prerendered }) {
  if (!policy) return ['Content-Security-Policy=null'];
  const directives = normalizedCsp(policy);
  const problems = [];
  const expectedDirectives = new Set(Object.keys(WEB_CSP_DIRECTIVES));
  for (const directive of directives.keys()) {
    if (!expectedDirectives.has(directive)) problems.push(`${directive}=unexpected`);
  }
  for (const [directive, expectedSources] of Object.entries(WEB_CSP_DIRECTIVES)) {
    if (prerendered && META_UNSUPPORTED_CSP_DIRECTIVES.has(directive)) {
      if (directives.has(directive)) problems.push(`${directive} must be response-header-only`);
      continue;
    }
    const actualSources = directives.get(directive);
    if (!actualSources) {
      problems.push(`${directive}=missing`);
      continue;
    }
    for (const source of expectedSources) {
      if (!actualSources.has(source)) problems.push(`${directive} missing ${source}`);
    }
    if (directive !== 'script-src') {
      for (const source of actualSources) {
        if (!expectedSources.includes(source)) problems.push(`${directive} unexpected ${source}`);
      }
    }
  }

  const scriptSources = directives.get('script-src') ?? new Set();
  if (scriptSources.has('unsafe-inline')) problems.push('script-src contains unsafe-inline');
  const expectedScriptSources = new Set(WEB_CSP_DIRECTIVES['script-src']);
  const generatedSources = [...scriptSources].filter(
    (source) => !expectedScriptSources.has(source)
  );
  if (prerendered) {
    if (generatedSources.some((source) => !/^sha256-[A-Za-z0-9+/]+={0,2}$/.test(source))) {
      problems.push('script-src has a non-hash generated source');
    }
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (!match[1]) continue;
      const hash = `sha256-${createHash('sha256').update(match[1]).digest('base64')}`;
      if (!scriptSources.has(hash)) problems.push(`script-src missing inline ${hash}`);
    }
  } else {
    if (!generatedSources.some((source) => /^nonce-[A-Za-z0-9+/]+={0,2}$/.test(source))) {
      problems.push('script-src missing an SSR nonce');
    }
    if (generatedSources.some((source) => !/^nonce-[A-Za-z0-9+/]+={0,2}$/.test(source))) {
      problems.push('script-src has a non-nonce generated source');
    }
  }
  return problems;
}

function metaCspPolicies(html) {
  return [
    ...html.matchAll(/<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"[^>]*>/gi),
  ].map((match) => match[1]);
}

/** Exported so the deploy-smoke fixture can pin the SSR-specific policy shape. */
export function missingSsrSecurityHeaders(response, hostname, html) {
  const missing = missingHeaders(response, EXACT_SSR_SECURITY_HEADERS);
  missing.push(...hstsProblems(response, hostname));
  missing.push(...cspProblems(response.headers.get(CSP_HEADER), { html, prerendered: false }));
  if (metaCspPolicies(html).length !== 0) missing.push('SSR HTML contains a CSP meta tag');
  return missing;
}

async function checkStaticRoutes(hostname) {
  let rootHtml = '';
  for (const path of ['/', '/privacy', '/admin']) {
    const response = await fetch(`${BASE}${path}`);
    const body = await response.text();
    const prerendered = path !== '/admin';
    const missingSecurity = prerendered
      ? missingStaticSecurityHeaders(response, hostname)
      : missingSsrSecurityHeaders(response, hostname, body);
    if (prerendered) {
      const policies = metaCspPolicies(body);
      if (policies.length !== 1) {
        missingSecurity.push(`CSP meta tag count=${policies.length}`);
      } else {
        missingSecurity.push(...cspProblems(policies[0], { html: body, prerendered: true }));
      }
    }
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
  check(
    'home page names a hashed immutable asset',
    Boolean(assetPath),
    `searched ${rootHtml.length} response bytes for /_app/immutable/*.{css,js,woff2}`
  );
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
    const leakedSecurity = Object.keys(SECURITY_HEADERS).filter(
      (name) => !NETLIFY_EDGE_SECURITY_HEADERS.has(name) && response.headers.has(name)
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

async function runStage(name, stage) {
  try {
    await stage();
  } catch (err) {
    check(`${name} stage completed`, false, err instanceof Error ? err.message : String(err));
  }
}

async function run(target) {
  await runStage('static routes', () => checkStaticRoutes(target.hostname));
  await runStage('version', checkVersion);
  await runStage('CORS preflight', checkCors);
  await runStage('unauthenticated API', checkUnauthenticatedApi);
  await runStage('admin persistence', () => checkDeployedAdminContract(BASE, ADMIN_SECRET));
}

export async function checkDeployedContract() {
  let parsedBase;
  try {
    parsedBase = new URL(BASE);
  } catch {
    parsedBase = null;
  }

  const allowedHttpHost =
    ALLOW_HTTP_FOR_TESTS &&
    parsedBase?.protocol === 'http:' &&
    LOOPBACK_HOSTS.has(parsedBase.hostname);
  if (!parsedBase || (parsedBase.protocol !== 'https:' && !allowedHttpHost) || !ADMIN_SECRET) {
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
    await run(parsedBase);
  } catch (err) {
    fatal(err);
  }

  summarize();
}

if (mainModule) await checkDeployedContract();
