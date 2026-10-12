import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CORPUS_VERSION } from './tests/native-png-hot-path-corpus.mjs';

const DIFFERENTIAL_PREFIX = 'PNG_HOT_PATH_DIFFERENTIAL_3649 ';
const BENCHMARK_PREFIX = 'PNG_HOT_PATH_BENCHMARK_3649 ';

function refuse(condition, reason) {
  if (!condition) throw new Error(reason);
}

function equal(left, right, reason) {
  refuse(JSON.stringify(left) === JSON.stringify(right), reason);
}

function objects(text, prefix) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith(prefix))
    .map((line) => JSON.parse(line.slice(prefix.length)));
}

function one(text, prefix) {
  const reports = objects(text, prefix);
  refuse(reports.length === 1, `Expected exactly one ${prefix.trim()} report.`);
  return reports[0];
}

export function compareDifferential(baseline, derivative) {
  equal(baseline.schema, CORPUS_VERSION, 'Unknown baseline corpus schema.');
  equal(derivative.schema, CORPUS_VERSION, 'Unknown derivative corpus schema.');
  equal(baseline.scheduler, derivative.scheduler, 'Scheduler controls differ.');
  equal(baseline.clock, derivative.clock, 'Clock controls differ.');
  equal(baseline.runtime, derivative.runtime, 'Runtime versions differ.');
  refuse(
    Array.isArray(baseline.records) && baseline.records.length > 0,
    'Missing baseline differential records.'
  );
  refuse(Array.isArray(derivative.records), 'Missing derivative differential records.');
  const ids = baseline.records.map(({ id }) => id);
  refuse(new Set(ids).size === ids.length, 'Repeated differential fixture id.');
  equal(
    baseline.records,
    derivative.records,
    'Fixture bytes, outcomes, work charges, due checks, yields, or cancellation checks differ.'
  );
  return { equivalent: true, records: baseline.records.length };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function compareBenchmark(baselineRecords, derivativeRecords) {
  const baselineEnd = baselineRecords.filter(({ kind }) => kind === 'complete');
  const derivativeEnd = derivativeRecords.filter(({ kind }) => kind === 'complete');
  refuse(
    baselineEnd.length === 1 && derivativeEnd.length === 1,
    'Benchmark completion missing or repeated; retain every partial result.'
  );
  const before = baselineEnd[0];
  const after = derivativeEnd[0];
  equal(before.schema, CORPUS_VERSION, 'Unknown baseline benchmark schema.');
  equal(after.schema, CORPUS_VERSION, 'Unknown derivative benchmark schema.');
  for (const field of [
    'runtime',
    'host',
    'scheduling',
    'warmupRuns',
    'measuredRuns',
    'fixtureCount',
  ])
    equal(before[field], after[field], `Benchmark conditions differ: ${field}.`);
  refuse(!before.exhausted && !after.exhausted, 'Benchmark exhausted its own bounded budget.');
  const baselineSamples = baselineRecords.filter(({ kind }) => kind === 'sample');
  const derivativeSamples = derivativeRecords.filter(({ kind }) => kind === 'sample');
  equal(baselineSamples.length, before.sampleCount, 'Baseline sample count mismatch.');
  equal(derivativeSamples.length, after.sampleCount, 'Derivative sample count mismatch.');
  equal(baselineSamples.length, derivativeSamples.length, 'Benchmark sample sets differ.');
  refuse(
    baselineSamples.length === before.fixtureCount * (before.warmupRuns + before.measuredRuns),
    'Benchmark was incomplete.'
  );
  const grouped = new Map();
  const seen = new Set();
  for (let index = 0; index < baselineSamples.length; index++) {
    const left = baselineSamples[index];
    const right = derivativeSamples[index];
    const key = `${left.id}/run-${left.run}`;
    refuse(!seen.has(key), 'Repeated benchmark sample.');
    seen.add(key);
    for (const field of [
      'id',
      'run',
      'warmup',
      'fixtureSHA256',
      'rawBytes',
      'pngBytes',
      'outcome',
      'expected',
    ])
      equal(left[field], right[field], `Benchmark sample differs: ${key}/${field}.`);
    equal(left.outcome, left.expected, `Baseline decoder failed: ${key}.`);
    equal(right.outcome, right.expected, `Derivative decoder failed: ${key}.`);
    refuse(
      Number.isFinite(left.elapsedMs) &&
        left.elapsedMs > 0 &&
        Number.isFinite(right.elapsedMs) &&
        right.elapsedMs > 0,
      'Invalid elapsed timing.'
    );
    if (left.warmup) continue;
    if (!grouped.has(left.id)) grouped.set(left.id, { baselineMs: [], derivativeMs: [] });
    const group = grouped.get(left.id);
    group.baselineMs.push(left.elapsedMs);
    group.derivativeMs.push(right.elapsedMs);
  }
  const observations = [...grouped].map(([id, group]) => {
    refuse(group.baselineMs.length === before.measuredRuns, 'Measured sample count mismatch.');
    const baselineMedianMs = median(group.baselineMs);
    const derivativeMedianMs = median(group.derivativeMs);
    return {
      id,
      ...group,
      baselineMedianMs,
      derivativeMedianMs,
      derivativeOverBaseline: derivativeMedianMs / baselineMedianMs,
    };
  });
  return { observations, nativeOrHermesCauseQualified: false, campaignPerformanceQualified: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, baselinePath, derivativePath] = process.argv.slice(2);
  refuse(
    (mode === 'differential' || mode === 'benchmark') && baselinePath && derivativePath,
    'Required: node compare-hot-path.mjs differential|benchmark BASELINE_LOG DERIVATIVE_LOG'
  );
  const baseline = readFileSync(baselinePath, 'utf8');
  const derivative = readFileSync(derivativePath, 'utf8');
  const result =
    mode === 'differential'
      ? compareDifferential(
          one(baseline, DIFFERENTIAL_PREFIX),
          one(derivative, DIFFERENTIAL_PREFIX)
        )
      : compareBenchmark(
          objects(baseline, BENCHMARK_PREFIX),
          objects(derivative, BENCHMARK_PREFIX)
        );
  process.stdout.write(JSON.stringify({ schema: CORPUS_VERSION, mode, ...result }, null, 2) + '\n');
}
