#!/usr/bin/env node
// Deploy-time smoke test that Netlify Blobs is actually live on a DEPLOYED
// function — the thing that silently broke in production (ADR-0025: a V1 function
// never gets the Blobs context, so getStore() throws and everything degrades to
// the in-memory fallback). Unlike tools/api-smoke/run-local-contract.mjs (which
// boots a local vite dev with no Blobs), this runs against a real Netlify
// deploy: a preview (https://deploy-preview-<PR>--splotchy.netlify.app) or production
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

import { fatal, summarize } from '../lib/smoke.mjs';
import { checkDeployedAdminContract } from './lib/deployed-admin-contract.mjs';

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

async function run() {
  await checkDeployedAdminContract(BASE, ADMIN_SECRET);
}

console.log(`[blobs-smoke] target: ${BASE}\n`);
try {
  await run();
} catch (err) {
  fatal(err);
}

summarize();
