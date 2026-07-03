#!/usr/bin/env node
// Deploy-time smoke test that Netlify Blobs is actually live on a DEPLOYED
// function — the thing that silently broke in production (ADR-0025: a V1 function
// never gets the Blobs context, so getStore() throws and everything degrades to
// the in-memory fallback). Unlike scripts/api-smoke.mjs (which boots a local vite
// dev with no Blobs), this runs against a real Netlify deploy: a preview
// (https://deploy-preview-<PR>--splotchy.netlify.app) or production
// (https://splotch.art).
//
// The decisive signal is the snapshot's `persistent` flag: true only when the
// list is durably backed by Blobs, false on the env-seeded in-memory fallback. A
// V1-function regression flips it to false and fails this test. We also round-trip
// a unique token (add → read back → remove) so a write actually has to land in and
// come back from Blobs, then clean it up so the shared site-wide store isn't left
// holding smoke tokens.
//
//   BLOBS_SMOKE_URL=https://deploy-preview-11--splotchy.netlify.app \
//   ADMIN_ACCESS_TOKEN=… \
//   npm run test:blobs:smoke
//
// The URL may also be passed as the first CLI arg. ADMIN_ACCESS_TOKEN must match
// the deploy's admin secret (it never travels except in the login POST body, over
// https).

import { randomUUID } from 'node:crypto';

const BASE = (process.argv[2] ?? process.env.BLOBS_SMOKE_URL ?? '').replace(/\/$/, '');
const ADMIN_SECRET = process.env.ADMIN_ACCESS_TOKEN ?? '';

if (!BASE || !ADMIN_SECRET) {
  console.error(
    [
      '[blobs-smoke] Missing config.',
      '  Set the deploy URL (env BLOBS_SMOKE_URL or first arg) and ADMIN_ACCESS_TOKEN.',
      '  e.g. BLOBS_SMOKE_URL=https://deploy-preview-11--splotchy.netlify.app \\',
      '       ADMIN_ACCESS_TOKEN=… npm run test:blobs:smoke',
    ].join('\n')
  );
  process.exit(2);
}

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const json = (res) => res.json().catch(() => null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, headers, body) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function del(path, headers, body) {
  return fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// Exchange the admin secret for a bearer session, retrying through the per-IP
// rate limiter that guards the login oracle (a re-run within the window can 429).
async function login() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await post('/api/admin/login', {}, { key: ADMIN_SECRET });
    if (res.status === 200) return (await json(res))?.session;
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') ?? 2);
      console.log(`  … login rate-limited, waiting ${wait}s`);
      await sleep((wait + 1) * 1000);
      continue;
    }
    throw new Error(`login failed: ${res.status} (check ADMIN_ACCESS_TOKEN matches the deploy)`);
  }
  throw new Error('login kept hitting the rate limiter');
}

let session;
let probe;

async function run() {
  session = await login();
  check('admin login → session', /^[a-f0-9]{64}$/.test(session ?? ''), `got ${session}`);
  const auth = { Authorization: `Bearer ${session}` };
  probe = `blobs-smoke-${randomUUID()}`;

  // The core assertion: a deployed function with a working Blobs context reports
  // persistent:true. V1-function regression (no NETLIFY_BLOBS_CONTEXT) → false.
  const list = await fetch(`${BASE}/api/admin/tokens`, { headers: auth });
  const listBody = await json(list);
  check(
    'GET tokens → 200 snapshot',
    list.status === 200 && listBody?.ok === true,
    `got ${list.status}`
  );
  check(
    'Blobs is live on the deployed function (persistent:true)',
    listBody?.persistent === true,
    `persistent=${listBody?.persistent} — getStore() is failing on the deploy (ADR-0025)`
  );

  // Round-trip a real write through Blobs, then confirm it reads back (with a
  // little patience for eventual consistency across replicas).
  const add = await post('/api/admin/tokens', auth, { token: probe });
  const addBody = await json(add);
  check(
    'POST adds the probe token',
    add.status === 200 && addBody?.tokens?.includes(probe),
    `got ${add.status}`
  );
  check(
    'POST snapshot still persistent:true',
    addBody?.persistent === true,
    `persistent=${addBody?.persistent}`
  );

  let readBack = false;
  for (let attempt = 0; attempt < 6 && !readBack; attempt++) {
    if (attempt) await sleep(1000);
    const after = await json(await fetch(`${BASE}/api/admin/tokens`, { headers: auth }));
    readBack = Boolean(after?.tokens?.includes(probe));
  }
  check(
    'probe token reads back from Blobs',
    readBack,
    'not visible after retries — write did not durably land'
  );

  // Cleanup: remove the probe so the shared site-wide store stays clean.
  const removed = await del('/api/admin/tokens', auth, { token: probe });
  const removedBody = await json(removed);
  check(
    'DELETE removes the probe token',
    removed.status === 200 && !removedBody?.tokens?.includes(probe),
    `got ${removed.status}`
  );
}

console.log(`[blobs-smoke] target: ${BASE}\n`);
try {
  await run();
} catch (err) {
  failed++;
  console.error(`\nFATAL: ${err.message}`);
} finally {
  // Best-effort cleanup if we got far enough to add the probe (idempotent, so
  // a re-delete after the in-run cleanup is harmless).
  if (session && probe) {
    await del(
      '/api/admin/tokens',
      { Authorization: `Bearer ${session}` },
      { token: probe }
    ).catch(() => {});
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
