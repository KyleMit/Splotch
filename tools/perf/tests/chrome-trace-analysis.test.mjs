import { describe, expect, it } from 'vitest';
import { analyze, renderReport } from '../analyze-chrome-trace.mjs';

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

  it('renders "n/a" and no Delta row for an unmeasured before-heap sample', () => {
    const summary = analyze([], { heap: { beforeBytes: null, afterBytes: 10 * 1024 * 1024 } });
    const report = renderReport(summary);

    expect(report).toContain('| JS heap before | n/a |');
    expect(report).toContain('| JS heap after | 10.0 MiB |');
    expect(report).not.toContain('Delta');
  });

  it('renders a real 0-byte heap sample normally, including the Delta row', () => {
    const summary = analyze([], { heap: { beforeBytes: 0, afterBytes: 0 } });
    const report = renderReport(summary);

    expect(report).toContain('| JS heap before | 0.0 MiB |');
    expect(report).toContain('| JS heap after | 0.0 MiB |');
    expect(report).toContain('| Delta | 0.0 MiB |');
  });

  it('warns about beats the session skipped', () => {
    const summary = analyze([], {
      settings: { skippedBeats: ['undo: no #undoButton', 'clear: timeout'] },
    });
    const report = renderReport(summary);

    expect(report).toContain('## ⚠ Skipped beats');
    expect(report).toContain('- undo: no #undoButton');
    expect(report).toContain('- clear: timeout');
  });

  it('omits the skipped-beat warning when every beat succeeded', () => {
    const summary = analyze([], { settings: { target: 'web' } });

    expect(renderReport(summary)).not.toContain('Skipped beats');
  });

  it('reports no heap metrics captured when the after-heap sample is unmeasured', () => {
    const summary = analyze([], { heap: { beforeBytes: 5 * 1024 * 1024, afterBytes: null } });
    const report = renderReport(summary);

    expect(report).toContain('_No heap metrics captured._');
    expect(report).not.toContain('JS heap before');
  });
});
