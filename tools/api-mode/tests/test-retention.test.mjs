import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getStore, setEnvironmentContext } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { expect, it } from 'vitest';
import { loadNetlifyFunctions } from '../../lib/netlify-function-host.mjs';
import { localBlobFetch } from '../../api-smoke/lib/local-blob-fetch.mjs';
import { RECOVERY_PROTOCOL } from '../../../src/lib/ai/generationAttempt.ts';
import { ROOT } from '../../lib/proc.mjs';

const RETENTION_TEST_TIMEOUT_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const OLD = Date.now() - 31 * DAY_MS;
const ID = 'a'.repeat(64);
const STORES = [
  'ai-generation-jobs',
  'ai-generation-attempts-v1',
  'ai-image-reports',
  'ai-usage',
  'github-issues',
];

async function seedStores() {
  for (const name of STORES)
    await getStore({ name, consistency: 'strong' }).set('production-sentinel', 'keep');
  await getStore({ name: 'test-ai-generation-jobs' }).set(`${ID}/input`, 'orphaned drawing');
  const input = new Uint8Array([1, 2, 3]);
  await getStore({ name: 'test-ai-generation-attempts-v1' }).set(`${ID}/input`, input.buffer, {
    metadata: {
      protocol: RECOVERY_PROTOCOL,
      id: ID,
      expiresAt: OLD,
      digest: createHash('sha256').update(input).digest('hex'),
    },
  });
  await getStore({ name: 'test-ai-image-reports' }).set(`${OLD}-${randomUUID()}/input.png`, 'old');
  await getStore({ name: 'test-ai-image-reports' }).set('recent-report/input.png', 'keep');
  await getStore({ name: 'test-ai-usage' }).set('legacy-expired-record', 'old');
  await getStore({ name: 'test-github-issues' }).set(`${OLD}-${randomUUID()}`, 'old feedback');
  await getStore({ name: 'test-github-issues' }).set(`${Date.now()}-${randomUUID()}`, 'keep');
}

async function triggerCleanup(functions, trigger, sweep) {
  if (trigger === 'schedule') {
    await sweep.default();
    return { ok: true };
  }
  const { fakeAiProvider } = await functions.serverModule(join(ROOT, 'netlify/server/ai/fake.ts'));
  return fakeAiProvider.verifyKey('sk-test-success');
}

it.each([
  { mode: 'production', trigger: 'schedule' },
  { mode: 'test', trigger: 'schedule' },
  { mode: 'test', trigger: 'provider traffic' },
])(
  'runs test-store cleanup through $trigger in $mode mode without touching production stores',
  async ({ mode, trigger }) => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-retention-'));
    const blobs = new BlobsServer({ directory, port: 0 });
    const previousFetch = globalThis.fetch;
    const previousContext = globalThis.netlifyBlobsContext;
    let functions;
    try {
      const { port } = await blobs.start();
      const url = `http://127.0.0.1:${port}`;
      globalThis.fetch = localBlobFetch(previousFetch, url);
      setEnvironmentContext({
        siteID: 'retention-test',
        token: 'local',
        edgeURL: url,
        uncachedEdgeURL: url,
        apiURL: url,
      });
      await seedStores();
      functions = await loadNetlifyFunctions('production', mode);
      const sweep = await functions.serverModule(
        join(ROOT, 'netlify/functions/purge-test-data.ts')
      );
      expect(sweep.config.schedule).toBe('@hourly');
      expect(await triggerCleanup(functions, trigger, sweep)).toEqual({ ok: true });
      for (const name of STORES)
        assert.equal(await getStore({ name }).get('production-sentinel'), 'keep', name);
      for (const name of ['ai-generation-jobs', 'ai-generation-attempts-v1', 'ai-usage'])
        expect((await getStore({ name: `test-${name}` }).list()).blobs).toEqual([]);
      expect(
        (await getStore({ name: 'test-ai-image-reports' }).list()).blobs.map(({ key }) => key)
      ).toEqual(['recent-report/input.png']);
      const issues = (await getStore({ name: 'test-github-issues' }).list()).blobs;
      expect(issues).toHaveLength(1);
      expect(await getStore({ name: 'test-github-issues' }).get(issues[0].key)).toBe('keep');
    } finally {
      await functions?.close();
      await blobs.stop();
      globalThis.fetch = previousFetch;
      globalThis.netlifyBlobsContext = previousContext;
      rmSync(directory, { recursive: true, force: true });
    }
  },
  RETENTION_TEST_TIMEOUT_MS
);
