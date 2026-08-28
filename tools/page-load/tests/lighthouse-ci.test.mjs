import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GATED_METRICS,
  LIGHTHOUSE_TIMEOUT_MS,
  PROFILES,
  REPORTED_METRICS,
  VISITS,
  assessSummary,
  baselineSourceStatus,
  median,
  summarizeMeasurements,
  withOneRetry,
} from '../run-lighthouse-ci.mjs';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const committedBaseline = JSON.parse(
  readFileSync(join(ROOT, 'tools/page-load/baseline.json'), 'utf8')
);

function measurements(value) {
  return Object.keys(PROFILES).flatMap((profile) =>
    VISITS.flatMap((visit) =>
      [0, 1, 2].map((offset, sample) => ({
        profile,
        visit,
        sample,
        fcpMs: value + offset,
        lcpMs: value + 100 + offset,
        tbtMs: value + 200 + offset,
        performanceScore: 90 - offset,
      }))
    )
  );
}

function baseline(limit) {
  return {
    profiles: Object.fromEntries(
      Object.keys(PROFILES).map((profile) => [
        profile,
        Object.fromEntries(
          VISITS.map((visit) => [visit, { limits: { fcpMs: limit, lcpMs: limit + 100 } }])
        ),
      ])
    ),
  };
}

describe('the Lighthouse CI metric contract', () => {
  it('keeps the skill form factors and both cache states closed', () => {
    expect(PROFILES).toEqual({
      'phone-portrait': { width: 412, height: 915, deviceScaleFactor: 2.625 },
      'tablet-landscape': { width: 1133, height: 744, deviceScaleFactor: 2 },
    });
    expect(VISITS).toEqual(['first', 'repeat']);
  });

  it('gates stable paints and reports noisy scheduler-derived values', () => {
    expect(GATED_METRICS).toEqual(['fcpMs', 'lcpMs']);
    expect(REPORTED_METRICS).toEqual(['tbtMs', 'performanceScore']);
  });

  it('uses the median so one shared-runner outlier cannot fail the gate', () => {
    expect(median([1_000, 1_010, 9_000])).toBe(1_010);
    expect(median([1_000, 1_010, 1_020, 9_000])).toBe(1_015);
  });

  it('summarizes every profile and visit without mixing their samples', () => {
    const summary = summarizeMeasurements(measurements(1_000));

    expect(summary['phone-portrait'].first).toEqual({
      fcpMs: 1_001,
      lcpMs: 1_101,
      tbtMs: 1_201,
      performanceScore: 89,
    });
    expect(Object.keys(summary)).toEqual(Object.keys(PROFILES));
    expect(Object.keys(summary['tablet-landscape'])).toEqual(VISITS);
  });

  it('fails only when a gated median crosses its own committed limit', () => {
    const summary = summarizeMeasurements(measurements(1_000));

    expect(assessSummary(summary, baseline(1_001))).toEqual([]);
    expect(assessSummary(summary, baseline(1_000))).toEqual([
      'phone-portrait first fcpMs: 1001 ms > 1000 ms',
      'phone-portrait first lcpMs: 1101 ms > 1100 ms',
      'phone-portrait repeat fcpMs: 1001 ms > 1000 ms',
      'phone-portrait repeat lcpMs: 1101 ms > 1100 ms',
      'tablet-landscape first fcpMs: 1001 ms > 1000 ms',
      'tablet-landscape first lcpMs: 1101 ms > 1100 ms',
      'tablet-landscape repeat fcpMs: 1001 ms > 1000 ms',
      'tablet-landscape repeat lcpMs: 1101 ms > 1100 ms',
    ]);
  });

  it('keeps the committed baseline complete and pinned to the installed runner', () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

    expect(committedBaseline.lighthouseVersion).toBe(packageJson.devDependencies.lighthouse);
    expect(Object.keys(committedBaseline.profiles)).toEqual(Object.keys(PROFILES));
    for (const profile of Object.keys(PROFILES)) {
      expect(Object.keys(committedBaseline.profiles[profile])).toEqual(VISITS);
      for (const visit of VISITS) {
        const entry = committedBaseline.profiles[profile][visit];
        expect(entry.limits.fcpMs).toBeGreaterThan(entry.baseline.fcpMs);
        expect(entry.limits.lcpMs).toBeGreaterThan(entry.baseline.lcpMs);
      }
    }
  });

  it('reports source provenance without invalidating absolute regression limits', () => {
    expect(baselineSourceStatus({ sourceDigest: 'same' }, 'same')).toEqual({
      matches: true,
      baselineDigest: 'same',
      currentDigest: 'same',
    });
    expect(baselineSourceStatus({ sourceDigest: 'old' }, 'changed')).toEqual({
      matches: false,
      baselineDigest: 'old',
      currentDigest: 'changed',
    });
  });

  it('retries one failed Lighthouse invocation without hiding a second failure', () => {
    const attempts = [];
    const recovered = withOneRetry(
      (attempt) => {
        attempts.push(attempt);
        if (attempt === 1) throw new Error('transient');
        return 'report';
      },
      (error) => expect(error.message).toBe('transient')
    );

    expect(recovered).toBe('report');
    expect(attempts).toEqual([1, 2]);
    expect(() =>
      withOneRetry(() => {
        throw new Error('persistent');
      })
    ).toThrow('persistent');
  });

  it('bounds each attempt so a retry still fits the workflow budget', () => {
    expect(LIGHTHOUSE_TIMEOUT_MS).toBe(120_000);
  });

  it('gives the recurring first-visit LCP mode equal headroom on both viewports', () => {
    expect(committedBaseline.profiles['tablet-landscape'].first.limits.lcpMs).toBe(
      committedBaseline.profiles['phone-portrait'].first.limits.lcpMs
    );
  });

  it('keeps the production-build CI job wired to Chromium, an explicit port, and artifacts', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/test.yml'), 'utf8');

    expect(workflow).toContain('page-load-performance:');
    expect(workflow).toContain('browsers: chromium');
    expect(workflow).toContain('npm run test:lighthouse:ci -- --port=4197');
    expect(workflow).toContain('path: lighthouse-reports/ci/');
    expect(workflow).toContain('if-no-files-found: warn');
  });
});
