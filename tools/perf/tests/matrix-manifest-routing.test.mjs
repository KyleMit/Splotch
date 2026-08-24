import { mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import {
  generateDeploymentMatrixReport,
  PRESERVED_VERDICT_REASON,
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
  it('marks a preserved run unscoreable and keeps its published checks', () => {
    const rescored = withPreservedScoreability(
      section({ passed: false, checks: { coalescing: false, cadence: true } })
    );

    expect(rescored.crayon.aggregate.scoreable).toBe(false);
    expect(rescored.crayon.aggregate.publishedFidelityChecks).toEqual(['coalescing']);
    expect(rescored.crayon.aggregate.failedFidelityChecks).toEqual([]);
  });

  // A preserved verdict cannot be re-derived — that needs raw input samples a
  // preserved cell does not have — so a passing one is not evidence under current
  // expectations either. `scoreable` drives the plots and the failure ranking, and a
  // copied historical verdict must not drive them.
  it('does not let a passing historical verdict score under current calibration', () => {
    const rescored = withPreservedScoreability(section({ passed: true, checks: {} }));

    expect(rescored.crayon.aggregate.scoreable).toBe(false);
    expect(rescored.crayon.aggregate.unscoreableReason).toBe(PRESERVED_VERDICT_REASON);
  });

  it('leaves the run-level verdict in place as provenance', () => {
    const fidelity = { passed: false, checks: { coalescing: false } };
    const rescored = withPreservedScoreability(section(fidelity));

    // Load-bearing: this matrix preserves from its own published `data.json`, so
    // blanking the field destroys the source the next regeneration preserves from.
    expect(rescored.crayon.runs[0].fidelity).toEqual(fidelity);
  });

  // A freshly normalized section already carries a verdict re-derived under current
  // expectations. Blanking that would mark every cell in the matrix unscoreable.
  it('leaves a freshly normalized section alone', () => {
    const fresh = section({ passed: true, checks: {} });
    fresh.crayon.aggregate.scoreable = true;

    expect(withPreservedScoreability(fresh, false)).toBe(fresh);
  });
});

// The generated Markdown is rendered by hand — table cells padded to a column
// width the renderer computes — and dprint reformats it. Without the generator
// formatting its own output, every regeneration leaves `dprint check` red for
// whoever touches the repo next, which is what issue 1239 reported.
//
// This has to run INSIDE the repo: `formatGeneratedMarkdown` deliberately skips a
// path dprint's includes do not cover, so a temp-directory fixture would pass
// whether the call is there or not.
//
// And the scratch directory must NOT be gitignored, however tempting that is for
// a crashed run: dprint honours .gitignore, so hiding the directory makes the
// formatter find no files — which both breaks the generator and would leave this
// test passing without exercising anything. Verified by fault injection: removing
// the `formatGeneratedMarkdown` call fails this test and nothing else.
describe('a regenerated matrix leaves the format gate green', () => {
  const scratches = [];

  afterEach(() => {
    for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('writes Markdown dprint accepts unchanged', async () => {
    const dir = mkdtempSync(join(ROOT, '.matrix-format-'));
    scratches.push(dir);

    await generateDeploymentMatrixReport(manifestIn(dir));

    const check = spawnSync('npx', ['dprint', 'check', relative(ROOT, join(dir, 'index.md'))], {
      cwd: ROOT,
      stdio: 'pipe',
    });

    expect(check.stdout?.toString() ?? '', check.stderr?.toString()).not.toContain('--- ');
    expect(check.status).toBe(0);
  });
});
