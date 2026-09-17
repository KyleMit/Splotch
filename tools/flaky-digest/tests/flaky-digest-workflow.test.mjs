import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROOT } from '../../lib/proc.mjs';
import {
  FLAKY_HISTORY_ARTIFACT_NAME,
  REPORT_ARTIFACT_PATTERN,
  REPORT_ARTIFACT_RETENTION_DAYS,
  reportArtifactForJob,
  TESTS_WORKFLOW_FILE,
} from '../lib/flaky-history.mjs';

// The harvester recognises report jobs by the names test.yml gives them and report artifacts by
// the names its upload steps write, and neither YAML side can import those. These cases read both
// workflows so a renamed job, artifact, or retention fails here instead of turning every report
// job into a silent `no-artifact` gap.

const workflow = (name) => readFileSync(join(ROOT, '.github', 'workflows', name), 'utf8');

/** Each job's `name:` with the `name:` and `retention-days:` of its upload-artifact steps. */
function reportUploads(text) {
  const jobs = text.split(/\n(?= {2}[\w-]+:\n)/).slice(1);
  return jobs.flatMap((job) => {
    const jobName = /^ {4}name: (.+)$/m.exec(job)?.[1];
    const uploads = job
      .split(/\n(?= {6}- )/)
      .filter((step) => step.includes('actions/upload-artifact@'));
    return uploads.map((step) => ({
      jobName,
      artifact: /^ {10}name: (.+)$/m.exec(step)?.[1],
      retentionDays: Number(/^ {10}retention-days: (\d+)$/m.exec(step)?.[1]),
      uploadsUnlessCancelled: /^ {8}if: \$\{\{ !cancelled\(\) \}\}$/m.test(step),
    }));
  });
}

describe('test.yml report uploads', () => {
  const uploads = reportUploads(workflow(TESTS_WORKFLOW_FILE)).filter(({ artifact }) =>
    artifact?.startsWith('playwright-report-')
  );

  it('finds the sharded Tests job and both engine smoke jobs', () => {
    expect(uploads.map(({ jobName }) => jobName).sort()).toEqual([
      'Firefox smoke',
      'Tests (${{ matrix.shard }}/${{ strategy.job-total }})',
      'WebKit smoke',
    ]);
  });

  it.each([1, 8])('maps shard %i job to the artifact its upload step writes', (shard) => {
    const upload = uploads.find(({ jobName }) => jobName.startsWith('Tests ('));
    const substitute = (text) =>
      text.replace('${{ matrix.shard }}', String(shard)).replace('${{ strategy.job-total }}', '8');
    const artifact = substitute(upload.artifact);
    expect(reportArtifactForJob(substitute(upload.jobName))).toBe(artifact);
    expect(REPORT_ARTIFACT_PATTERN.test(artifact)).toBe(true);
  });

  it('maps each engine smoke job to the artifact its upload step writes', () => {
    for (const upload of uploads.filter(({ jobName }) => !jobName.startsWith('Tests ('))) {
      expect(reportArtifactForJob(upload.jobName)).toBe(upload.artifact);
      expect(REPORT_ARTIFACT_PATTERN.test(upload.artifact)).toBe(true);
    }
  });

  it('retains report artifacts for the window the harvester assumes', () => {
    for (const upload of uploads) {
      expect(upload.retentionDays).toBe(REPORT_ARTIFACT_RETENTION_DAYS);
    }
  });

  // VERDICT_CONCLUSIONS expects an artifact from every job that reached a verdict.
  it('uploads whenever the job was not cancelled', () => {
    for (const upload of uploads) expect(upload.uploadsUnlessCancelled).toBe(true);
  });
});

describe('flaky-digest.yml', () => {
  const text = workflow('flaky-digest.yml');

  it('uploads the history under the name the next run looks up', () => {
    expect(reportUploads(text).map(({ artifact }) => artifact)).toEqual([
      FLAKY_HISTORY_ARTIFACT_NAME,
    ]);
  });

  it('harvests more often than report artifacts expire', () => {
    const cron = /cron: '([^']+)'/.exec(text)[1].split(' ');
    const everyHours = Number(/^\*\/(\d+)$/.exec(cron[1])?.[1]);
    expect(everyHours).toBeGreaterThan(0);
    expect(everyHours).toBeLessThan(REPORT_ARTIFACT_RETENTION_DAYS * 24);
  });
});
