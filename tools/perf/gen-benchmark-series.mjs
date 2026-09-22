// Writes the github-action-benchmark input for one capture (issue 688).
//
//   node tools/perf/gen-benchmark-series.mjs --summary=<dir-or-summary.json> --out=<file>
//
// The output is the `customSmallerIsBetter` array the action reads; the series
// name comes from the summary's own settings (target/suite), never from a flag.

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { fail, isMain } from '../lib/proc.mjs';
import { benchmarkEntries, seriesName } from './lib/benchmark-series.mjs';

function resolveSummaryPath(summary) {
  const path = statSync(summary).isDirectory() ? join(summary, 'summary.json') : summary;
  if (!existsSync(path)) fail(`No summary.json at ${path}`);
  return path;
}

export function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: { summary: { type: 'string' }, out: { type: 'string' } },
  });
  if (!values.summary || !values.out)
    fail('Usage: gen-benchmark-series.mjs --summary=<path> --out=<file>');
  const summary = JSON.parse(readFileSync(resolveSummaryPath(values.summary), 'utf8'));
  const entries = benchmarkEntries(summary);
  writeFileSync(values.out, JSON.stringify(entries, null, 2) + '\n');
  console.log(
    `Wrote ${entries.length} entries for series ${seriesName(summary.settings)} to ${values.out}`
  );
}

if (isMain(import.meta.url)) main();
