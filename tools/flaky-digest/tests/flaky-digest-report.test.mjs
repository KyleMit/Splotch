import { describe, expect, it } from 'vitest';

import { buildDigest, renderDigestMarkdown } from '../lib/flaky-digest-report.mjs';
import { createHistory } from '../lib/flaky-history.mjs';

const NOW = new Date('2026-09-16T12:00:00Z');
const HOUR_MS = 60 * 60 * 1000;
const ago = (hours) => new Date(NOW.getTime() - hours * HOUR_MS).toISOString();

const FLAKE = { title: 'flows › draws', attempts: 2, project: 'chromium', file: 'flows.spec.ts' };

function historyWith(runs, artifacts) {
  const history = createHistory();
  history.harvests.push({ at: ago(1), listedSince: ago(24 * 8), errors: [] });
  for (const run of runs) history.runs[run.id] = run;
  for (const artifact of artifacts) history.artifacts[artifact.id] = artifact;
  return history;
}

const run = (id, overrides = {}) => ({
  id,
  event: 'push',
  branch: 'main',
  headSha: 'head',
  createdAt: ago(10),
  status: 'completed',
  conclusion: 'success',
  attempt: 1,
  url: `https://example.test/runs/${id}`,
  executions: [
    {
      artifact: 'playwright-report-shard-1',
      attempt: 1,
      conclusion: 'success',
      completedAt: ago(9),
    },
  ],
  ...overrides,
});

const readArtifact = (id, runId, { attempt = 1, status = 'passed', flaky = [], ...rest } = {}) => ({
  id,
  runId,
  name: 'playwright-report-shard-1',
  createdAt: ago(9),
  state: 'read',
  record: {
    run: { id: runId, attempt, sha: 'merge', branch: rest.branch ?? 'main', event: 'push' },
    shard: { current: 1, total: 8 },
    status,
    tests: 100,
    flaky,
  },
});

const digestOf = (history, days = 7) => buildDigest(history, { now: NOW, days });

describe('buildDigest', () => {
  it('ranks flakes by events and keeps every occurrence with its provenance', () => {
    const history = historyWith(
      [
        run('1'),
        run('2', { branch: 'feature', event: 'pull_request' }),
        run('3', { branch: 'feature', event: 'pull_request' }),
      ],
      [
        readArtifact('a', '1', { flaky: [FLAKE] }),
        readArtifact('b', '2', {
          flaky: [FLAKE, { ...FLAKE, title: 'flows › erases' }],
          branch: 'feature',
        }),
        readArtifact('c', '3', { flaky: [], branch: 'feature' }),
      ]
    );
    const digest = digestOf(history);

    expect(
      digest.ranking.map(({ title, events, trunkEvents, branchEvents }) => ({
        title,
        events,
        trunkEvents,
        branchEvents,
      }))
    ).toEqual([
      { title: 'flows › draws', events: 2, trunkEvents: 1, branchEvents: 1 },
      { title: 'flows › erases', events: 1, trunkEvents: 0, branchEvents: 1 },
    ]);
    expect(digest.ranking[0].occurrences.find((o) => o.runId === '1')).toMatchObject({
      attempt: 1,
      branch: 'main',
      event: 'push',
      sha: 'merge',
      headSha: 'head',
      shard: '1/8',
      artifact: 'playwright-report-shard-1',
      scope: 'trunk',
      date: ago(9),
      attempts: 2,
    });
    expect(digest.coverage.trunk).toEqual({ runs: 1, samples: 1, tests: 100, flakeEvents: 1 });
    expect(digest.coverage.branch).toEqual({ runs: 2, samples: 2, tests: 200, flakeEvents: 2 });
    expect(digest.gaps).toEqual([]);
  });

  it('does not count interrupted or timed-out runs as samples', () => {
    const history = historyWith(
      [run('1'), run('2')],
      [
        readArtifact('a', '1', { status: 'interrupted' }),
        readArtifact('b', '2', { status: 'timedout' }),
      ]
    );
    const digest = digestOf(history);
    expect(digest.coverage.trunk.samples).toBe(0);
    expect(digest.coverage.gapCounts).toEqual({ 'status-interrupted': 1, 'status-timedout': 1 });
  });

  it('names every way a report job can fail to yield a counted record', () => {
    const shard = (n, conclusion = 'success', attempt = 1) => ({
      artifact: `playwright-report-shard-${n}`,
      attempt,
      conclusion,
      completedAt: ago(9),
    });
    const unread = (id, n, state, extra = {}) => ({
      id,
      runId: '1',
      name: `playwright-report-shard-${n}`,
      createdAt: ago(9),
      state,
      ...extra,
    });
    const history = historyWith(
      [
        run('1', {
          executions: [
            shard(1),
            shard(2),
            shard(3),
            shard(4),
            shard(5),
            shard(6, 'cancelled'),
            shard(7),
            shard(8, 'failure', 1),
            shard(8, 'success', 2),
          ],
        }),
        run('2', { executions: null }),
        run('3', { executions: null, status: 'in_progress' }),
      ],
      [
        unread('p', 2, 'pending'),
        unread('e', 3, 'expired-unread'),
        unread('n', 4, 'no-record'),
        unread('u', 5, 'unreadable', { error: 'GitHub 500' }),
        unread('s', 7, 'unsupported-schema', { schemaVersion: 2 }),
        { ...readArtifact('r', '1', { attempt: 2 }), name: 'playwright-report-shard-8' },
      ]
    );
    const digest = digestOf(history);

    expect(digest.coverage.gapCounts).toEqual({
      'no-artifact': 1,
      pending: 1,
      'expired-unread': 1,
      'no-record': 1,
      unreadable: 1,
      'job-cancelled': 1,
      'unsupported-schema-2': 1,
      'replaced-by-later-attempt': 1,
      'jobs-unavailable': 1,
      'run-in-progress': 1,
    });
    expect(digest.coverage.trunk.samples).toBe(1);
    expect(digest.gaps.find((gap) => gap.reason === 'unreadable')).toMatchObject({
      runId: '1',
      artifact: 'playwright-report-shard-5',
      error: 'GitHub 500',
    });
  });

  it('counts an attempt replaced by an upload that could not be read as replaced', () => {
    const history = historyWith(
      [
        run('1', {
          executions: [
            {
              artifact: 'playwright-report-shard-1',
              attempt: 1,
              conclusion: 'failure',
              completedAt: ago(9),
            },
            {
              artifact: 'playwright-report-shard-1',
              attempt: 2,
              conclusion: 'success',
              completedAt: ago(8),
            },
          ],
        }),
      ],
      [
        {
          id: 's',
          runId: '1',
          name: 'playwright-report-shard-1',
          createdAt: ago(8),
          state: 'unsupported-schema',
          schemaVersion: 2,
        },
      ]
    );
    expect(digestOf(history).coverage.gapCounts).toEqual({
      'unsupported-schema-2': 1,
      'replaced-by-later-attempt': 1,
    });
  });

  it('reads the artifact a job cancelled after its upload step left behind', () => {
    const history = historyWith(
      [
        run('1', {
          executions: [
            {
              artifact: 'playwright-report-shard-1',
              attempt: 1,
              conclusion: 'cancelled',
              completedAt: ago(9),
            },
          ],
        }),
      ],
      [{ ...readArtifact('a', '1', { status: 'interrupted' }), state: 'read' }]
    );
    expect(digestOf(history).coverage.gapCounts).toEqual({ 'status-interrupted': 1 });

    history.artifacts.a = {
      id: 'a',
      runId: '1',
      name: 'playwright-report-shard-1',
      createdAt: ago(9),
      state: 'pending',
    };
    expect(digestOf(history).coverage.gapCounts).toEqual({ pending: 1 });
  });

  it('only accounts runs created inside the window', () => {
    const history = historyWith(
      [run('old', { createdAt: ago(24 * 8) }), run('new')],
      [readArtifact('a', 'old', { flaky: [FLAKE] }), readArtifact('b', 'new')]
    );
    const digest = digestOf(history);
    expect(digest.ranking).toEqual([]);
    expect(digest.coverage.trunk.runs).toBe(1);
    expect(digestOf(history, 9).ranking).toHaveLength(1);
  });

  it('warns when the history does not reach back to the window start', () => {
    const history = historyWith([], []);
    history.harvests[0].listedSince = ago(24);
    expect(digestOf(history).warnings[0]).toMatch(/covers runs since .* after the window opens/);
  });

  it('warns on a harvest gap longer than artifact retention, a stale harvest, and harvest errors', () => {
    const history = historyWith([], []);
    history.harvests = [
      { at: ago(24 * 20), listedSince: ago(24 * 27), errors: [] },
      { at: ago(30), listedSince: ago(24 * 20), errors: ['artifact 9: GitHub 500'] },
    ];
    const warnings = digestOf(history).warnings;
    expect(warnings.some((w) => /longer than report artifact retention/.test(w))).toBe(true);
    expect(warnings.some((w) => /more than 24 hours old/.test(w))).toBe(true);
    expect(warnings).toContain('Latest harvest: artifact 9: GitHub 500');
  });
});

describe('renderDigestMarkdown', () => {
  it('renders the ranking with occurrence links and the gaps as not clean', () => {
    const history = historyWith(
      [run('1'), run('2', { executions: null })],
      [readArtifact('a', '1', { flaky: [{ ...FLAKE, title: 'a | b' }] })]
    );
    const markdown = renderDigestMarkdown(digestOf(history));
    expect(markdown).toContain('| 1 | 1 | 0 |');
    expect(markdown).toContain('| a \\| b |');
    expect(markdown).toContain('(https://example.test/runs/1)');
    expect(markdown).toContain('None of these are clean runs.');
    expect(markdown).toContain('| jobs-unavailable | 1 |');
  });

  it('does not call an empty ranking clean without pointing at the gaps', () => {
    const markdown = renderDigestMarkdown(digestOf(historyWith([], [])));
    expect(markdown).toContain('Check the gaps before reading this as clean.');
  });
});
