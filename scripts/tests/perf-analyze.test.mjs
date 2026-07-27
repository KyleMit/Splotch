import { describe, expect, it } from 'vitest';
import { analyze, renderReport } from '../perf/analyze.mjs';

function profileChunk({ nodes, samples, timeDeltas }) {
  return {
    name: 'ProfileChunk',
    args: {
      data: {
        cpuProfile: { nodes, samples },
        timeDeltas,
      },
    },
  };
}

describe('performance profile analysis', () => {
  it('preserves tabs in call-frame function names', () => {
    const events = [
      profileChunk({
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'work\tphase',
              url: 'https://splotch.art/app.js',
              lineNumber: 4,
            },
          },
          {
            id: 2,
            callFrame: {
              functionName: 'work\tphase',
              url: 'https://splotch.art/app.js',
              lineNumber: 4,
            },
          },
        ],
        samples: [1, 2],
        timeDeltas: [1000, 1500],
      }),
    ];

    expect(analyze(events).topSelfTime).toEqual([
      { name: 'work\tphase', location: 'app.js:5', selfMs: 2.5 },
    ]);
  });

  it('preserves harness-named call frames with an app URL', () => {
    const events = [
      profileChunk({
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'query',
              url: 'https://splotch.art/app.js',
              lineNumber: 4,
            },
          },
        ],
        samples: [1],
        timeDeltas: [2500],
      }),
    ];

    expect(analyze(events).topSelfTime).toEqual([
      { name: 'query', location: 'app.js:5', selfMs: 2.5 },
    ]);
  });

  it('excludes harness-named call frames without a URL', () => {
    const events = [
      profileChunk({
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'query',
              lineNumber: 4,
            },
          },
        ],
        samples: [1],
        timeDeltas: [2500],
      }),
    ];

    expect(analyze(events).topSelfTime).toEqual([]);
  });

  it('rejects a profile chunk with mismatched sample and delta counts', () => {
    const events = [
      profileChunk({
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: 'work',
              url: 'https://splotch.art/app.js',
              lineNumber: 4,
            },
          },
        ],
        samples: [1, 1],
        timeDeltas: [2500],
      }),
    ];

    expect(() => analyze(events)).toThrow(
      'Malformed CPU profile: ProfileChunk has 2 samples but 1 time deltas'
    );
  });

  it('falls back to trace long tasks when runtime metrics are absent', () => {
    const summary = analyze([
      { name: 'RunTask', ph: 'X', dur: 80_000 },
      { name: 'RunTask', ph: 'X', dur: 60_000 },
      { name: 'RunTask', ph: 'X', dur: 40_000 },
    ]);

    expect(summary.longTasks).toEqual({ count: 2, totalMs: 140, longestMs: 80 });
    expect(renderReport(summary)).toContain('| Long tasks (>50 ms) | Value |');
    expect(renderReport(summary)).toContain('| Count | 2 |');
    expect(renderReport(summary)).toContain('| Total | 140.0 ms |');
    expect(renderReport(summary)).toContain('| Longest | 80.0 ms |');
  });

  it('prefers runtime long-task metrics over trace long tasks', () => {
    const summary = analyze(
      [
        { name: 'RunTask', ph: 'X', dur: 80_000 },
        { name: 'RunTask', ph: 'X', dur: 60_000 },
      ],
      { longTasks: [{ duration: 55 }] }
    );

    expect(summary.longTasks).toEqual({ count: 1, totalMs: 55, longestMs: 55 });
    expect(renderReport(summary)).toContain('| Count | 1 |');
    expect(renderReport(summary)).toContain('| Total | 55.0 ms |');
    expect(renderReport(summary)).toContain('| Longest | 55.0 ms |');
  });

  it('keeps an empty runtime long-task metric authoritative', () => {
    const summary = analyze([{ name: 'RunTask', ph: 'X', dur: 80_000 }], { longTasks: [] });

    expect(summary.longTasks).toEqual({ count: 0, totalMs: 0, longestMs: 0 });
  });
});
