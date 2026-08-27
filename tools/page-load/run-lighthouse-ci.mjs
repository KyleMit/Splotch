#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { ROOT, argFlag, fail, isMain, runMain } from '../lib/proc.mjs';
import { buildAndPreview } from '../perf/lib/profile-preview.mjs';

export const PROFILE_VERSION = 1;
export const PROFILES = {
  'phone-portrait': { width: 412, height: 915, deviceScaleFactor: 2.625 },
  'tablet-landscape': { width: 1133, height: 744, deviceScaleFactor: 2 },
};
export const VISITS = ['first', 'repeat'];
export const GATED_METRICS = ['fcpMs', 'lcpMs'];
export const REPORTED_METRICS = ['tbtMs', 'performanceScore'];

const DEFAULT_BASELINE = 'tools/page-load/baseline.json';
const DEFAULT_OUT = 'lighthouse-reports/ci';
const DEFAULT_PORT = 4197;
const DEFAULT_SAMPLES = 3;
const LIGHTHOUSE_TIMEOUT_MS = 240_000;
const LIGHTHOUSE_CLI = fileURLToPath(import.meta.resolve('lighthouse/cli/index.js'));
const SPEC_FILE = /\.(test|spec)\.[^.]+$/;
const MEASURED_PATHS = [
  'web/src',
  'web/static',
  'web/svelte.config.js',
  'web/vite.config.ts',
  'pnpm-lock.yaml',
];

export function median(values) {
  if (!values.length) throw new Error('median needs at least one value');
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

export function summarizeMeasurements(measurements) {
  return Object.fromEntries(
    Object.keys(PROFILES).map((profile) => [
      profile,
      Object.fromEntries(
        VISITS.map((visit) => {
          const rows = measurements.filter(
            (measurement) => measurement.profile === profile && measurement.visit === visit
          );
          if (!rows.length) throw new Error(`no measurements for ${profile} ${visit}`);
          return [
            visit,
            Object.fromEntries(
              [...GATED_METRICS, ...REPORTED_METRICS].map((metric) => [
                metric,
                median(rows.map((row) => row[metric])),
              ])
            ),
          ];
        })
      ),
    ])
  );
}

export function assessSummary(summary, baseline) {
  const failures = [];
  for (const profile of Object.keys(PROFILES)) {
    for (const visit of VISITS) {
      for (const metric of GATED_METRICS) {
        const actual = summary[profile]?.[visit]?.[metric];
        const limit = baseline.profiles?.[profile]?.[visit]?.limits?.[metric];
        if (!Number.isFinite(actual) || !Number.isFinite(limit)) {
          failures.push(`${profile} ${visit} ${metric}: missing measurement or limit`);
        } else if (actual > limit) {
          failures.push(`${profile} ${visit} ${metric}: ${actual} ms > ${limit} ms`);
        }
      }
    }
  }
  return failures;
}

export function validateBaseline(baseline) {
  if (baseline.schemaVersion !== 1) fail('unsupported page-load baseline schema');
  if (baseline.profileVersion !== PROFILE_VERSION) {
    fail(
      `page-load profile version ${baseline.profileVersion} does not match runner version ${PROFILE_VERSION}`
    );
  }
  for (const profile of Object.keys(PROFILES)) {
    for (const visit of VISITS) {
      const entry = baseline.profiles?.[profile]?.[visit];
      if (!entry) fail(`page-load baseline is missing ${profile} ${visit}`);
      for (const metric of GATED_METRICS) {
        if (
          !Number.isFinite(entry.baseline?.[metric]) ||
          !Number.isFinite(entry.limits?.[metric])
        ) {
          fail(`page-load baseline is missing numeric ${profile} ${visit} ${metric} values`);
        }
      }
    }
  }
}

function trackedMeasuredFiles() {
  return execFileSync('git', ['ls-files', '-z', '--', ...MEASURED_PATHS], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .filter((path) => !SPEC_FILE.test(path));
}

export function measuredSourceDigest() {
  const hash = createHash('sha256');
  for (const path of trackedMeasuredFiles().sort()) {
    hash.update(path);
    hash.update('\0');
    hash.update(readFileSync(join(ROOT, path)));
    hash.update('\0');
  }
  const { dependencies = {} } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  hash.update('package.json#dependencies\0');
  hash.update(JSON.stringify(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))));
  return hash.digest('hex');
}

export function assertBaselineCurrent(baseline, currentDigest = measuredSourceDigest()) {
  if (baseline.sourceDigest !== currentDigest) {
    fail(
      'page-load baseline is stale for this production surface. Run the documented calibration ' +
        'matrix, review its spread, and update tools/page-load/baseline.json before relying on it.'
    );
  }
}

function lighthouseResult(path, profile, visit, sample) {
  const report = JSON.parse(readFileSync(path, 'utf8'));
  if (report.runtimeError) {
    throw new Error(`${profile} ${visit} sample ${sample} failed: ${report.runtimeError.message}`);
  }
  const audits = report.audits;
  const metric = (name) => {
    const value = audits[name]?.numericValue;
    if (!Number.isFinite(value)) {
      throw new Error(`${profile} ${visit} sample ${sample} has no ${name}`);
    }
    return Math.round(value);
  };
  const performanceScore = report.categories.performance?.score;
  if (!Number.isFinite(performanceScore)) {
    throw new Error(`${profile} ${visit} sample ${sample} has no performance score`);
  }
  return {
    profile,
    visit,
    sample,
    fcpMs: metric('first-contentful-paint'),
    lcpMs: metric('largest-contentful-paint'),
    tbtMs: metric('total-blocking-time'),
    performanceScore: Math.round(performanceScore * 100),
  };
}

function runLighthouse({ base, out, profileName, visit, sample, profileDir }) {
  const profile = PROFILES[profileName];
  const reportPath = join(out, `${profileName}-${visit}-${sample}.report.json`);
  rmSync(reportPath, { force: true });
  const chromeFlags = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--user-data-dir=${profileDir}`,
  ].join(' ');
  const args = [
    LIGHTHOUSE_CLI,
    base,
    '--form-factor=mobile',
    '--screenEmulation.mobile',
    `--screenEmulation.width=${profile.width}`,
    `--screenEmulation.height=${profile.height}`,
    `--screenEmulation.deviceScaleFactor=${profile.deviceScaleFactor}`,
    '--throttling-method=simulate',
    '--only-categories=performance',
    '--output=json',
    `--output-path=${reportPath}`,
    `--chrome-path=${chromium.executablePath()}`,
    `--chrome-flags=${chromeFlags}`,
    '--quiet',
  ];
  if (visit === 'repeat') args.push('--disable-storage-reset');
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: LIGHTHOUSE_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    throw new Error(
      `${profileName} ${visit} sample ${sample} Lighthouse failed: ` +
        `${result.stderr?.trim() || result.error?.message || `exit ${result.status}`}`
    );
  }
  return lighthouseResult(reportPath, profileName, visit, sample);
}

function renderSummary(summary, baseline, reportOnly) {
  const rows = [];
  for (const profile of Object.keys(PROFILES)) {
    for (const visit of VISITS) {
      const result = summary[profile][visit];
      const limits = baseline?.profiles?.[profile]?.[visit]?.limits;
      rows.push({
        profile,
        visit,
        'FCP ms': Math.round(result.fcpMs),
        'FCP limit': reportOnly ? 'report' : limits.fcpMs,
        'LCP ms': Math.round(result.lcpMs),
        'LCP limit': reportOnly ? 'report' : limits.lcpMs,
        'TBT ms (report)': Math.round(result.tbtMs),
        'score (report)': Math.round(result.performanceScore),
      });
    }
  }
  console.table(rows);
  return rows;
}

function appendGitHubSummary(rows) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const header =
    '| Profile | Visit | FCP / limit (ms) | LCP / limit (ms) | TBT (ms, report) | Score (report) |\n' +
    '| --- | --- | ---: | ---: | ---: | ---: |\n';
  const body = rows
    .map(
      (row) =>
        `| ${row.profile} | ${row.visit} | ${row['FCP ms']} / ${row['FCP limit']} | ` +
        `${row['LCP ms']} / ${row['LCP limit']} | ${row['TBT ms (report)']} | ` +
        `${row['score (report)']} |`
    )
    .join('\n');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Page-load performance\n\n${header}${body}\n`);
}

export async function runLighthouseCi({
  baselinePath = argFlag('baseline', DEFAULT_BASELINE),
  out = argFlag('out', DEFAULT_OUT),
  port = Number(argFlag('port', String(DEFAULT_PORT))),
  samples = Number(argFlag('samples', String(DEFAULT_SAMPLES))),
  build = !process.argv.includes('--no-build'),
  reportOnly = process.argv.includes('--report-only'),
} = {}) {
  if (!Number.isInteger(port) || port <= 0) fail('--port must be a positive integer');
  if (!Number.isInteger(samples) || samples < 3 || samples % 2 === 0) {
    fail('--samples must be an odd integer of at least 3 so the median resists one outlier');
  }
  const absoluteBaseline = join(ROOT, baselinePath);
  const absoluteOut = join(ROOT, out);
  const baseline = JSON.parse(readFileSync(absoluteBaseline, 'utf8'));
  validateBaseline(baseline);
  if (!reportOnly) assertBaselineCurrent(baseline);

  rmSync(absoluteOut, { recursive: true, force: true });
  mkdirSync(absoluteOut, { recursive: true });
  const preview = await buildAndPreview(port, { build });
  const measurements = [];
  try {
    for (let sample = 1; sample <= samples; sample += 1) {
      for (const profileName of Object.keys(PROFILES)) {
        const profileDir = join(absoluteOut, '.profiles', `${profileName}-${sample}`);
        mkdirSync(profileDir, { recursive: true });
        for (const visit of VISITS) {
          console.log(`${profileName} ${visit} sample ${sample}/${samples}`);
          measurements.push(
            runLighthouse({
              base: preview.base,
              out: absoluteOut,
              profileName,
              visit,
              sample,
              profileDir,
            })
          );
        }
        rmSync(profileDir, { recursive: true, force: true });
      }
    }
  } finally {
    preview.stop();
    rmSync(join(absoluteOut, '.profiles'), { recursive: true, force: true });
  }

  const summary = summarizeMeasurements(measurements);
  const rows = renderSummary(summary, baseline, reportOnly);
  appendGitHubSummary(rows);
  const artifact = {
    schemaVersion: 1,
    profileVersion: PROFILE_VERSION,
    sourceDigest: measuredSourceDigest(),
    samples,
    summary,
    measurements,
  };
  writeFileSync(join(absoluteOut, 'summary.json'), `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Reports: ${relative(ROOT, absoluteOut)}`);

  if (reportOnly) return artifact;
  const failures = assessSummary(summary, baseline);
  if (failures.length) {
    fail(`page-load regression:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  }
  console.log('FCP and LCP medians are within the committed wide regression limits.');
  return artifact;
}

if (isMain(import.meta.url)) {
  runMain(runLighthouseCi);
}
