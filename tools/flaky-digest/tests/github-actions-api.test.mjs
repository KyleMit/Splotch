import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createGithubActionsApi, RATE_LIMIT_RESERVE_REQUESTS } from '../lib/github-actions-api.mjs';

function response(body, { status = 200, remaining = 900 } = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  return new Response(payload, {
    status,
    headers: { 'x-ratelimit-remaining': String(remaining) },
  });
}

function apiWith(handler) {
  const requests = [];
  const api = createGithubActionsApi({
    repo: 'o/r',
    token: 't',
    fetchImpl: async (url, init) => {
      requests.push({ url: new URL(url), init });
      return handler(new URL(url));
    },
  });
  return { api, requests };
}

const artifacts = (count, createdAt) =>
  Array.from({ length: count }, (_, index) => ({ id: index, created_at: createdAt }));

describe('createGithubActionsApi', () => {
  it("pages a run's artifacts until a short page", async () => {
    const pages = {
      1: artifacts(100, '2026-09-16T00:00:00Z'),
      2: artifacts(3, '2026-09-16T00:00:00Z'),
    };
    const { api, requests } = apiWith((url) =>
      response({ artifacts: pages[url.searchParams.get('page')] })
    );
    expect(await api.listRunArtifacts(7)).toHaveLength(103);
    expect(requests.map(({ url }) => url.pathname)).toEqual([
      '/repos/o/r/actions/runs/7/artifacts',
      '/repos/o/r/actions/runs/7/artifacts',
    ]);
    expect(requests[0].init.headers.authorization).toBe('Bearer t');
  });

  it('fetches a single run by id', async () => {
    const { api, requests } = apiWith(() => response({ id: 9 }));
    expect(await api.getRun('9')).toEqual({ id: 9 });
    expect(requests[0].url.pathname).toBe('/repos/o/r/actions/runs/9');
  });

  it('filters workflow runs by creation date and stops on a short page', async () => {
    const { api, requests } = apiWith(() => response({ workflow_runs: [{ id: 1 }] }));
    expect(await api.listWorkflowRuns('test.yml', new Date('2026-09-09T00:00:00Z'))).toEqual([
      { id: 1 },
    ]);
    expect(requests[0].url.pathname).toBe('/repos/o/r/actions/workflows/test.yml/runs');
    expect(requests[0].url.searchParams.get('created')).toBe('>=2026-09-09T00:00:00.000Z');
  });

  it('stops at a rate-limited download without failing the harvest', async () => {
    const { api } = apiWith((url) =>
      url.pathname.endsWith('/zip')
        ? response({}, { status: 403, remaining: 0 })
        : response({ jobs: [] }, { remaining: 4000 })
    );
    await api.listJobs(1);
    expect(api.hasBudgetForDownload()).toBe(true);
    const error = await api.readArtifactFile(1, 'flaky.json').catch((caught) => caught);
    expect(error).toMatchObject({ rateLimited: true });
    expect(error.fatal).toBeUndefined();
    expect(api.hasBudgetForDownload()).toBe(false);
  });

  it('counts listings against the same budget as downloads', async () => {
    const { api } = apiWith(() =>
      response({ jobs: [] }, { remaining: RATE_LIMIT_RESERVE_REQUESTS })
    );
    await api.listJobs(1);
    expect(api.hasBudgetForDownload()).toBe(false);
  });

  it('holds back a reserve of downloads', async () => {
    const redirect = (remaining) =>
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://storage.test/zip',
          'x-ratelimit-remaining': String(remaining),
        },
      });
    let remaining = RATE_LIMIT_RESERVE_REQUESTS + 1;
    const { api, requests } = apiWith((url) =>
      url.hostname === 'storage.test' ? response(Buffer.from('not a zip')) : redirect(remaining)
    );
    await api.readArtifactFile(1, 'flaky.json').catch(() => {});
    expect(api.hasBudgetForDownload()).toBe(true);
    remaining = RATE_LIMIT_RESERVE_REQUESTS;
    await api.readArtifactFile(1, 'flaky.json').catch(() => {});
    expect(api.hasBudgetForDownload()).toBe(false);
    const storage = requests.find(({ url }) => url.hostname === 'storage.test');
    expect(storage.init?.headers?.authorization).toBeUndefined();
    expect(requests[0].init.redirect).toBe('manual');
  });

  it('treats a rejected token as fatal, an exhausted rate limit as rate-limited, other errors as per item', async () => {
    const statusApi = (status, remaining) => apiWith(() => response({}, { status, remaining })).api;
    await expect(statusApi(401, 900).listJobs(1)).rejects.toMatchObject({ fatal: true });
    await expect(statusApi(403, 0).listJobs(1)).rejects.toMatchObject({ rateLimited: true });
    await expect(statusApi(429, 10).listJobs(1)).rejects.toMatchObject({ rateLimited: true });
    const notFound = await statusApi(404, 900)
      .listJobs(1)
      .catch((error) => error);
    expect(notFound.message).toBe(
      'GitHub 404 for /repos/o/r/actions/runs/1/jobs?filter=all&per_page=100&page=1'
    );
    expect(notFound.fatal).toBeUndefined();
  });

  it('reads one member of an artifact zip, and null when the zip lacks it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flaky-digest-api-'));
    writeFileSync(join(dir, 'flaky.json'), '{"schemaVersion":1}');
    writeFileSync(join(dir, 'index.html'), '<html>');
    execFileSync('zip', ['-q', 'with.zip', 'flaky.json', 'index.html'], { cwd: dir });
    execFileSync('zip', ['-q', 'without.zip', 'index.html'], { cwd: dir });
    const zips = {
      1: readFileSync(join(dir, 'with.zip')),
      2: readFileSync(join(dir, 'without.zip')),
    };
    rmSync(dir, { recursive: true, force: true });
    const { api } = apiWith((url) => response(zips[url.pathname.split('/').at(-2)]));

    expect(await api.readArtifactFile(1, 'flaky.json')).toBe('{"schemaVersion":1}');
    expect(await api.readArtifactFile(2, 'flaky.json')).toBeNull();
  });

  it('picks the newest unexpired artifact of a name', async () => {
    const { api, requests } = apiWith(() =>
      response({
        artifacts: [
          { id: 1, created_at: '2026-09-15T00:00:00Z', expired: false },
          { id: 2, created_at: '2026-09-16T00:00:00Z', expired: true },
          { id: 3, created_at: '2026-09-15T06:00:00Z', expired: false },
        ],
      })
    );
    expect((await api.findLatestArtifact('flaky-digest-history')).id).toBe(3);
    expect(requests[0].url.searchParams.get('name')).toBe('flaky-digest-history');
  });
});
