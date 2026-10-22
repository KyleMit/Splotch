import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getStore, listStores, setEnvironmentContext } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { localBlobFetch } from './local-blob-fetch.mjs';

export function requireTestApiEnvironment(env) {
  if (env.SPLOTCH_API_MODE !== 'test' || env.OPENAI_API_KEY || env.GITHUB_ISSUE_TOKEN)
    throw new Error(
      'Real-handler UI integration requires test mode and no provider/GitHub secrets'
    );
}

export async function startTestApiEnvironment(env) {
  const validatedEnv = Object.freeze({ ...env });
  requireTestApiEnvironment(validatedEnv);
  const directory = mkdtempSync(join(tmpdir(), 'splotch-test-api-'));
  const blobs = new BlobsServer({ directory, port: 0 });
  const previousContext = globalThis.netlifyBlobsContext;
  const previousFetch = globalThis.fetch;
  const close = async () => {
    await blobs.stop();
    globalThis.fetch = previousFetch;
    globalThis.netlifyBlobsContext = previousContext;
    rmSync(directory, { force: true, recursive: true });
  };
  try {
    const address = await blobs.start();
    const origin = `http://127.0.0.1:${address.port}`;
    globalThis.fetch = localBlobFetch(previousFetch, origin);
    setEnvironmentContext({
      siteID: 'test-site',
      token: 'local-test-token',
      edgeURL: origin,
      uncachedEdgeURL: origin,
      apiURL: origin,
    });
    return {
      env: validatedEnv,
      close,
      issues: async () => {
        const sink = getStore({ name: 'test-github-issues', consistency: 'strong' });
        const records = await sink.list();
        return Promise.all(records.blobs.map(({ key }) => sink.get(key, { type: 'json' })));
      },
      storeNames: async () => (await listStores()).stores,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
