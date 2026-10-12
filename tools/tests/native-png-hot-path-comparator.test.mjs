import { describe, expect, it } from 'vitest';
import { compareBenchmark, compareDifferential } from '../native-png-hot-path-compare.mjs';
import { CORPUS_VERSION } from './native-png-hot-path-corpus.mjs';

function report() {
  return {
    schema: CORPUS_VERSION,
    scheduler: 'deterministic-immediate-idle-control',
    clock: 'constant-zero-control',
    runtime: { node: 'controlled' },
    records: [
      {
        id: 'controlled',
        fixtureSHA256: 'controlled-fixture',
        outcome: { status: 'accepted', empty: true },
        traceSHA256: 'controlled-trace',
        chargeCalls: 1,
        totalUnits: 4096,
        pauseRequests: 1,
        currentChecks: 4,
      },
    ],
  };
}

function benchmark() {
  return [
    {
      schema: CORPUS_VERSION,
      kind: 'sample',
      id: 'controlled',
      run: 0,
      warmup: false,
      fixtureSHA256: 'controlled-fixture',
      rawBytes: 1,
      pngBytes: 1,
      elapsedMs: 1,
      outcome: { status: 'accepted', empty: true },
      expected: { status: 'accepted', empty: true },
    },
    {
      schema: CORPUS_VERSION,
      kind: 'complete',
      runtime: { node: 'controlled' },
      host: { platform: 'controlled' },
      scheduling: 'controlled',
      warmupRuns: 0,
      measuredRuns: 1,
      fixtureCount: 1,
      sampleCount: 1,
      exhausted: false,
    },
  ];
}

describe('UNRUN comparator guard negative controls', () => {
  it('accepts identical witnesses and rejects a one-unit or one-yield drift', () => {
    expect(compareDifferential(report(), report()).equivalent).toBe(true);
    for (const field of ['totalUnits', 'pauseRequests', 'currentChecks']) {
      const changed = report();
      changed.records[0][field]++;
      expect(() => compareDifferential(report(), changed)).toThrow('differ');
    }
    const changed = report();
    changed.records[0].traceSHA256 = 'different-order';
    expect(() => compareDifferential(report(), changed)).toThrow('differ');
  });
  it('rejects a wrong alpha result, changed fixture bytes, or empty report', () => {
    const alpha = report();
    alpha.records[0].outcome.empty = false;
    expect(() => compareDifferential(report(), alpha)).toThrow('differ');
    const bytes = report();
    bytes.records[0].fixtureSHA256 = 'different-bytes';
    expect(() => compareDifferential(report(), bytes)).toThrow('differ');
    expect(() => compareDifferential({ ...report(), records: [] }, report())).toThrow('Missing');
  });
  it('retains timing observations while refusing failed or incomplete benchmark inputs', () => {
    expect(compareBenchmark(benchmark(), benchmark()).observations).toHaveLength(1);
    const failed = benchmark();
    failed[0].outcome = { status: 'rejected', message: 'controlled failure' };
    expect(() => compareBenchmark(failed, failed)).toThrow('failed');
    const partial = benchmark();
    partial[1].exhausted = true;
    expect(() => compareBenchmark(partial, partial)).toThrow('budget');
    expect(() => compareBenchmark(benchmark().slice(0, 1), benchmark())).toThrow('completion');
  });
});
