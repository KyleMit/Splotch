import { describe, expect, it } from 'vitest';
import { analyze } from '../perf/analyze.mjs';

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
});
