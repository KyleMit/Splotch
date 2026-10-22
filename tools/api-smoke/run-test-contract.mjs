import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getStore, listStores, setEnvironmentContext } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { startNetlifyFunctionHost } from '../lib/netlify-function-host.mjs';
import { contractServerEnv } from './lib/server-env.mjs';
import { tinyPngBuffer } from './lib/tiny-png.mjs';
import { GENERATION_JOB_PARAM } from '../../src/lib/apiParams.ts';
import { localBlobFetch } from './lib/local-blob-fetch.mjs';

const POLL_INTERVAL_MS = 200;
const POLL_DEADLINE_MS = 15_000;
const IMAGE_BYTES = tinyPngBuffer();
const directory = mkdtempSync(join(tmpdir(), 'splotch-test-api-'));
const blobs = new BlobsServer({ directory, port: 0 });
const previousContext = globalThis.netlifyBlobsContext;
const previousFetch = globalThis.fetch;
let host;

async function pollResult(base, jobId) {
  const deadline = Date.now() + POLL_DEADLINE_MS;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/api/generation-result?${GENERATION_JOB_PARAM}=${jobId}`);
    if (response.status !== 202) return response;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('The real background generation never finished');
}

async function checkGeneration(base) {
  const installation = 'a'.repeat(64);
  const headers = { 'X-Installation-Id': installation };
  const grant = await fetch(`${base}/api/free-generation-grant`, { headers });
  assert.equal(grant.headers.get('X-Robots-Tag'), 'noindex');
  assert.deepEqual(await grant.json(), { ok: true, remaining: 10, limit: 10 });
  const started = await fetch(`${base}/api/generate-image?style=Magical`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'image/png', 'X-Async-Generation': '1' },
    body: IMAGE_BYTES,
  });
  assert.equal(started.status, 202, await started.clone().text());
  const ticket = await started.json();
  assert.match(ticket.jobId, /^[a-f0-9]{64}$/);
  const pending = await fetch(
    `${base}/api/generation-result?${GENERATION_JOB_PARAM}=${ticket.jobId}`
  );
  assert.equal(pending.status, 202);
  const result = await pollResult(base, ticket.jobId);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Content-Type'), 'image/png');
  assert.equal(result.headers.get('X-Free-Generations-Remaining'), '9');
  const output = await result.arrayBuffer();
  assert.ok(output.byteLength > 0);
  const form = new FormData();
  form.set('drawing', new Blob([IMAGE_BYTES], { type: 'image/png' }), 'drawing.png');
  form.set('output', new Blob([output], { type: 'image/png' }), 'result.png');
  form.set('style', 'Magical');
  const report = await fetch(`${base}/api/report-image`, {
    method: 'POST',
    headers: { ...headers, Origin: base, 'X-Report-Token': result.headers.get('X-Report-Token') },
    body: form,
  });
  assert.equal(report.status, 200);
  assert.equal((await report.json()).ok, true);
  console.log('PASS free grant → generate → pending poll → image → report, without an OpenAI key');
}

async function checkKeysAndOutcomes(base) {
  for (const [key, status, body] of [
    ['sk-test-success', 200, { ok: true }],
    [
      'sk-test-invalid-key',
      200,
      { ok: false, error: 'That key could not authenticate with OpenAI.' },
    ],
    [
      'sk-test-verify-rate-limited',
      503,
      {
        ok: false,
        code: 'KEY_CHECK_UNAVAILABLE',
        error: "We couldn't check that key just now. Please try again.",
      },
    ],
  ]) {
    const response = await fetch(`${base}/api/verify-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key }),
    });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), body);
  }
  for (const [key, status, error] of [
    ['sk-test-invalid-key', 502, 'OpenAI request failed: 401 Incorrect API key provided'],
    ['sk-test-rate-limited', 502, 'OpenAI request failed: 429 Rate limit reached'],
    ['sk-test-error', 502, 'OpenAI request failed: 500 Internal server error'],
    ['sk-test-timeout', 502, 'OpenAI request failed: Request timed out.'],
    [
      'sk-test-refusal',
      422,
      "Drawing was blocked for safety: I can't turn that drawing into a picture.",
    ],
  ]) {
    const response = await fetch(`${base}/api/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'X-Api-Key': key },
      body: IMAGE_BYTES,
    });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { ok: false, error });
  }
  const managed = await fetch(`${base}/api/generate-image?style=Sticker`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', 'X-Access-Token': 'alpha' },
    body: IMAGE_BYTES,
  });
  assert.equal(managed.status, 200);
  console.log(
    'PASS fake key checks, invalid key, provider rate limit/error/timeout, refusal and managed Sticker success'
  );
}

async function checkReports(base) {
  const response = await fetch(`${base}/api/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'bug', message: 'Test deploy feedback' }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const sink = getStore({ name: 'test-github-issues', consistency: 'strong' });
  const records = await sink.list();
  assert.equal(records.blobs.length, 2);
  const issues = await Promise.all(records.blobs.map(({ key }) => sink.get(key, { type: 'json' })));
  assert.ok(issues.some(({ title }) => title === '[Bug] Test deploy feedback'));
  assert.ok(issues.some(({ title }) => title === '[AI image] Reported Magical picture'));
  const stores = await listStores();
  assert.ok(stores.stores.length > 0);
  assert.ok(stores.stores.every((name) => name.startsWith('test-')));
  console.log('PASS feedback/image-report sink records and exclusively test- scoped stores');
}

try {
  const address = await blobs.start();
  const url = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = localBlobFetch(previousFetch, url);
  setEnvironmentContext({
    siteID: 'test-site',
    token: 'local-test-token',
    edgeURL: url,
    uncachedEdgeURL: url,
    apiURL: url,
  });
  host = await startNetlifyFunctionHost({
    mode: 'production',
    port: Number(process.env.SMOKE_PORT ?? 5199),
    env: contractServerEnv(randomUUID(), 'test'),
  });
  await checkGeneration(host.origin);
  await checkKeysAndOutcomes(host.origin);
  await checkReports(host.origin);
} finally {
  await host?.close();
  await blobs.stop();
  globalThis.fetch = previousFetch;
  globalThis.netlifyBlobsContext = previousContext;
  rmSync(directory, { force: true, recursive: true });
}
