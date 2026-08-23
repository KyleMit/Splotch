import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  generateDeploymentMatrixReport,
  withPreservedScoreability,
} from '../gen-performance-matrix.mjs';

const manifestIn = (dir) => {
  writeFileSync(
    join(dir, 'sources.json'),
    JSON.stringify({
      schemaVersion: 3,
      recordedOn: '2026-08-23',
      productCommit: '6e211ddc4f27aed28f4864c7486d4410be44d2b9',
      snapshotKind: 'test',
      architecture: 'test',
      sourceRoot: '.',
      limitations: [],
      candidateActions: [],
      targets: [],
    })
  );
  return join(dir, 'sources.json');
};

describe('matrix manifest routing', () => {
  // The regression this covers: the staleness check was chained with a shell `&&`,
  // and npm appends forwarded arguments to the END of a compound command — so
  // `gen:performance-matrix -- <manifest>` handed the path to the CHECKER while the
  // generator wrote the default manifest, and the command exited 0 having verified
  // a different file than it produced.
  it('generates and checks the manifest it was given, not the default', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));

    await generateDeploymentMatrixReport(manifestIn(dir));

    for (const file of ['data.json', 'index.md', 'index.html']) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }
  });

  it('fails on a manifest that does not exist rather than falling back', async () => {
    await expect(
      generateDeploymentMatrixReport('/definitely/not/a/manifest.json')
    ).rejects.toThrow();
  });
});

describe('withPreservedScoreability', () => {
  const section = (fidelity) => ({
    crayon: {
      runs: [{ fidelity }],
      aggregate: { blankPassed: false, paint: { p95: 16, max: 87 } },
    },
  });

  // The regression this covers: scoreability was derived only for captures passing
  // through normalizeDrawingRun, and preserved sections bypass it. So a preserved
  // fidelity-failed cell rendered a bold product FAIL while a freshly captured one
  // with the identical verdict rendered unscoreable — the same measurement making
  // two contradictory claims, decided only by which side of a recapture it fell on.
  it('marks a preserved run unscoreable when its stored verdict failed', () => {
    const rescored = withPreservedScoreability(
      section({ passed: false, checks: { coalescing: false, cadence: true } })
    );

    expect(rescored.crayon.aggregate.scoreable).toBe(false);
    expect(rescored.crayon.aggregate.failedFidelityChecks).toEqual(['coalescing']);
  });

  it('leaves a preserved run scoreable when its verdict passed', () => {
    const rescored = withPreservedScoreability(section({ passed: true, checks: {} }));

    expect(rescored.crayon.aggregate.scoreable).toBe(true);
  });

  // The desktop transport writes no verdict at all, and an absent verdict is not a
  // failed one.
  it('leaves a run that reports no verdict scoreable', () => {
    const rescored = withPreservedScoreability(section(undefined));

    expect(rescored.crayon.aggregate.scoreable).toBe(true);
  });
});
