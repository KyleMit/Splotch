import { describe, expect, it } from 'vitest';

import {
  FLAKY_RECORD_FILENAME as PRODUCER_RECORD_FILENAME,
  FLAKY_RECORD_SCHEMA_VERSION,
} from '../../../web/playwright-flaky-reporter.ts';
import {
  classifyRecordText,
  createHistory,
  FLAKY_RECORD_FILENAME,
  harvest,
  parseHistory,
  READABLE_FLAKY_RECORD_SCHEMA_VERSION,
  reportArtifactForJob,
  reportExecutions,
} from '../lib/flaky-history.mjs';

const NOW = new Date('2026-09-16T12:00:00Z');
const HOUR_MS = 60 * 60 * 1000;
const ago = (hours) => new Date(NOW.getTime() - hours * HOUR_MS).toISOString();
const later = (hours) => new Date(NOW.getTime() + hours * HOUR_MS).toISOString();

const record = (overrides = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    run: { id: '1', attempt: 1, sha: 'abc', branch: 'main', event: 'push' },
    shard: { current: 1, total: 8 },
    status: 'passed',
    tests: 90,
    flaky: [],
    ...overrides,
  });

const job = (name, attempt, conclusion = 'success', startedAt = ago(5)) => ({
  name,
  run_attempt: attempt,
  conclusion,
  started_at: startedAt,
  completed_at: startedAt,
});

function fakeApi({ runs = [], jobs = {}, artifacts = [], files = {}, budget = Infinity }) {
  let downloads = 0;
  return {
    downloads: () => downloads,
    hasBudgetForDownload: () => downloads < budget,
    listWorkflowRuns: async () => runs,
    listJobs: async (runId) => jobs[runId] ?? [],
    listRunArtifacts: async (runId) =>
      artifacts.filter((artifact) => String(artifact.workflow_run.id) === String(runId)),
    readArtifactFile: async (id) => {
      downloads += 1;
      const file = files[id];
      if (file instanceof Error) throw file;
      return file ?? null;
    },
  };
}

const run = (id, overrides = {}) => ({
  id,
  event: 'push',
  head_branch: 'main',
  head_sha: 'abc',
  created_at: ago(6),
  status: 'completed',
  conclusion: 'success',
  run_attempt: 1,
  html_url: `https://github.com/o/r/actions/runs/${id}`,
  ...overrides,
});

const artifact = (id, runId, name, overrides = {}) => ({
  id,
  name,
  created_at: ago(5),
  expires_at: later(24 * 6),
  expired: false,
  workflow_run: { id: runId },
  ...overrides,
});

describe('flaky record contract', () => {
  it('reads the schema version the producer writes', () => {
    // A producer bump fails here until classifyRecordText is taught the new shape.
    expect(READABLE_FLAKY_RECORD_SCHEMA_VERSION).toBe(FLAKY_RECORD_SCHEMA_VERSION);
    expect(FLAKY_RECORD_FILENAME).toBe(PRODUCER_RECORD_FILENAME);
  });

  it('skips a record with another schema version instead of reading it', () => {
    expect(classifyRecordText(record({ schemaVersion: 2 }))).toEqual({
      state: 'unsupported-schema',
      schemaVersion: 2,
    });
  });

  it('distinguishes a missing record from an unparseable one', () => {
    expect(classifyRecordText(null)).toEqual({ state: 'no-record' });
    expect(classifyRecordText('{').state).toBe('unreadable');
    expect(classifyRecordText(JSON.stringify({ schemaVersion: 1 })).state).toBe('unreadable');
  });
});

describe('report jobs', () => {
  it('maps each report job to the artifact its upload step writes', () => {
    expect(reportArtifactForJob('Tests (3/8)')).toBe('playwright-report-shard-3');
    expect(reportArtifactForJob('Firefox smoke')).toBe('playwright-report-firefox');
    expect(reportArtifactForJob('WebKit smoke')).toBe('playwright-report-webkit');
    expect(reportArtifactForJob('Quality')).toBeNull();
  });

  it('keeps one execution per job that actually ran across re-run attempts', () => {
    const carried = job('Tests (1/8)', 1);
    const executions = reportExecutions([
      carried,
      { ...carried, run_attempt: 2 },
      job('Firefox smoke', 1, 'failure', ago(5)),
      job('Firefox smoke', 2, 'success', ago(4)),
      job('Quality', 1),
    ]);
    expect(executions.map(({ artifact, attempt }) => `${artifact}@${attempt}`)).toEqual([
      'playwright-report-firefox@1',
      'playwright-report-firefox@2',
      'playwright-report-shard-1@1',
    ]);
  });
});

describe('parseHistory', () => {
  it('refuses a history written by another schema version', () => {
    expect(() => parseHistory(JSON.stringify({ schemaVersion: 99 }), 'h.json')).toThrow(
      /schemaVersion 99/
    );
  });
});

describe('harvest', () => {
  it('reads new report artifacts of tracked runs and records their outcome', async () => {
    const api = fakeApi({
      runs: [run(1)],
      jobs: { 1: [job('Tests (1/8)', 1), job('Tests (2/8)', 1)] },
      artifacts: [
        artifact(10, 1, 'playwright-report-shard-1'),
        artifact(11, 1, 'playwright-report-shard-2'),
        artifact(12, 1, 'lighthouse-page-load'),
        artifact(13, 999, 'playwright-report-shard-1'),
      ],
      files: { 10: record(), 11: null },
    });
    const history = createHistory();
    const summary = await harvest(api, history, NOW);

    expect(summary).toMatchObject({ runsListed: 1, artifactsAdded: 2, artifactsRead: 2 });
    expect(history.artifacts['10'].state).toBe('read');
    expect(history.artifacts['11'].state).toBe('no-record');
    expect(Object.keys(history.artifacts)).toEqual(['10', '11']);
    expect(history.runs['1'].executions).toHaveLength(2);
  });

  it('never downloads an artifact twice once it has an outcome', async () => {
    const api = fakeApi({
      runs: [run(1)],
      jobs: { 1: [job('Tests (1/8)', 1)] },
      artifacts: [artifact(10, 1, 'playwright-report-shard-1')],
      files: { 10: record() },
    });
    const history = createHistory();
    await harvest(api, history, NOW);
    await harvest(api, history, new Date(NOW.getTime() + HOUR_MS));
    expect(api.downloads()).toBe(1);
  });

  it('leaves unread artifacts pending when the budget runs out, and says so', async () => {
    const api = fakeApi({
      runs: [run(1)],
      jobs: { 1: [job('Tests (1/8)', 1), job('Tests (2/8)', 1)] },
      artifacts: [
        artifact(10, 1, 'playwright-report-shard-1', { expires_at: later(10) }),
        artifact(11, 1, 'playwright-report-shard-2', { expires_at: later(5) }),
      ],
      files: { 10: record(), 11: record() },
      budget: 1,
    });
    const history = createHistory();
    const summary = await harvest(api, history, NOW);
    expect(history.artifacts['11'].state).toBe('read');
    expect(history.artifacts['10'].state).toBe('pending');
    expect(summary.errors).toEqual([
      'rate-limit budget reached: 1 artifacts left for the next harvest',
    ]);
  });

  it('stops downloading on a download rate limit and keeps the artifact pending', async () => {
    const limited = Object.assign(new Error('download limit'), { rateLimited: true });
    const api = fakeApi({
      runs: [run(1)],
      jobs: { 1: [job('Tests (1/8)', 1), job('Tests (2/8)', 1)] },
      artifacts: [
        artifact(10, 1, 'playwright-report-shard-1', { expires_at: later(5) }),
        artifact(11, 1, 'playwright-report-shard-2', { expires_at: later(10) }),
      ],
      files: { 10: limited, 11: record() },
    });
    const history = createHistory();
    const summary = await harvest(api, history, NOW);
    expect(history.artifacts['10'].state).toBe('pending');
    expect(summary.errors.at(-1)).toMatch(/^rate-limit budget reached: [12] artifacts left/);
  });

  it('keeps runs whose listings hit the rate limit, for the next harvest to fetch', async () => {
    const limited = Object.assign(new Error('limit'), { rateLimited: true });
    const reportArtifacts = [artifact(10, 1, 'playwright-report-shard-1')];
    const api = fakeApi({ runs: [run(1)], artifacts: reportArtifacts });
    api.listJobs = async () => {
      throw limited;
    };
    const history = createHistory();
    const summary = await harvest(api, history, NOW);
    expect(history.runs['1'].executions).toBeNull();
    expect(history.artifacts).toEqual({});
    expect(summary.errors[0]).toBe(
      'rate limit reached listing runs: 1 runs left for the next harvest'
    );

    await harvest(
      fakeApi({ runs: [run(1)], jobs: { 1: [job('Tests (1/8)', 1)] }, artifacts: reportArtifacts }),
      history,
      NOW
    );
    expect(history.runs['1'].executions).toHaveLength(1);
    // The fake holds no file for it, so the read finds no record.
    expect(history.artifacts['10'].state).toBe('no-record');
  });

  it('marks an artifact that expired before it was read', async () => {
    const api = fakeApi({
      runs: [run(1)],
      jobs: { 1: [job('Tests (1/8)', 1)] },
      artifacts: [artifact(10, 1, 'playwright-report-shard-1', { expired: true })],
    });
    const history = createHistory();
    await harvest(api, history, NOW);
    expect(history.artifacts['10'].state).toBe('expired-unread');
    expect(api.downloads()).toBe(0);
  });

  it('records a failed download as unreadable and retries it next harvest', async () => {
    const files = { 10: new Error('GitHub 500') };
    const api = fakeApi({
      runs: [run(1)],
      jobs: { 1: [job('Tests (1/8)', 1)] },
      artifacts: [artifact(10, 1, 'playwright-report-shard-1')],
      files,
    });
    const history = createHistory();
    const first = await harvest(api, history, NOW);
    expect(history.artifacts['10']).toMatchObject({ state: 'unreadable', error: 'GitHub 500' });
    expect(first.errors).toHaveLength(1);

    files[10] = record();
    await harvest(api, history, new Date(NOW.getTime() + HOUR_MS));
    expect(history.artifacts['10'].state).toBe('read');
    expect(history.artifacts['10']).not.toHaveProperty('error');
  });

  it('refetches the jobs of a run that gained an attempt', async () => {
    const history = createHistory();
    await harvest(
      fakeApi({ runs: [run(1)], jobs: { 1: [job('Firefox smoke', 1, 'failure')] } }),
      history,
      NOW
    );
    await harvest(
      fakeApi({
        runs: [run(1, { run_attempt: 2 })],
        jobs: {
          1: [job('Firefox smoke', 1, 'failure'), job('Firefox smoke', 2, 'success', ago(1))],
        },
      }),
      history,
      NOW
    );
    expect(history.runs['1'].executions).toHaveLength(2);
  });

  it('prunes runs older than the history retention', async () => {
    const history = createHistory();
    history.runs.old = { id: 'old', createdAt: ago(24 * 91) };
    history.artifacts['5'] = { id: '5', runId: 'old', state: 'read' };
    history.harvests.push({ at: ago(24 * 91) }, { at: ago(24 * 2) });
    await harvest(fakeApi({}), history, NOW);
    expect(history.runs).toEqual({});
    expect(history.artifacts).toEqual({});
    expect(history.harvests.map(({ at }) => at)).toEqual([ago(24 * 2), NOW.toISOString()]);
  });

  it('lists back to the previous harvest when it is older than artifact retention', async () => {
    const history = createHistory();
    history.harvests.push({ at: ago(24 * 10) });
    const summary = await harvest(fakeApi({}), history, NOW);
    expect(summary.listedSince).toBe(ago(24 * 10));
  });

  it('retries a run left unresolved after it falls out of the listing window', async () => {
    const history = createHistory();
    history.harvests.push({ at: ago(3) });
    history.runs['9'] = { id: '9', createdAt: ago(24 * 9), status: 'completed', executions: null };
    const api = fakeApi({
      runs: [],
      jobs: { 9: [job('Tests (1/8)', 1)] },
      artifacts: [artifact(90, 9, 'playwright-report-shard-1')],
      files: { 90: record() },
    });
    api.getRun = async (id) => run(Number(id), { created_at: ago(24 * 9) });
    await harvest(api, history, NOW);
    expect(history.runs['9'].executions).toHaveLength(1);
    expect(history.artifacts['90'].state).toBe('read');
  });

  it('stops on a fatal API error instead of recording it per item', async () => {
    const api = fakeApi({
      runs: [run(1)],
      jobs: { 1: [job('Tests (1/8)', 1)] },
      artifacts: [artifact(10, 1, 'playwright-report-shard-1')],
      files: { 10: Object.assign(new Error('rate limit'), { fatal: true }) },
    });
    await expect(harvest(api, createHistory(), NOW)).rejects.toThrow('rate limit');
  });
});
