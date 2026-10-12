// Analyze a saved Chrome trace standalone — including one exported from an
// Android WebView or iOS Web Inspector — and write summary.json and report.md
// beside it:  node tools/perf/analyze-chrome-trace.mjs <profile-dir | trace.json>
//
// The analysis itself is lib/chrome-trace-analysis.mjs, which the capture
// harness also runs on the trace it just recorded.

import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fail, isMain } from '../lib/proc.mjs';
import { analyze, writeAnalysisArtifacts } from './lib/chrome-trace-analysis.mjs';

function loadInputs(target) {
  let tracePath = target;
  let traceJson;
  try {
    if (statSync(target).isDirectory()) tracePath = join(target, 'trace.json');
    traceJson = readFileSync(tracePath, 'utf8');
  } catch {
    fail(`Trace not found: ${tracePath}`);
  }
  let trace;
  try {
    trace = JSON.parse(traceJson);
  } catch {
    fail(`Trace is not valid JSON: ${tracePath}`);
  }
  const dir = dirname(tracePath);
  const events = Array.isArray(trace) ? trace : trace.traceEvents || [];
  let metrics = {};
  try {
    metrics = JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8'));
  } catch {
    // metrics.json is optional — a bare exported trace still analyzes.
  }
  return { dir, events, metrics };
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node tools/perf/analyze-chrome-trace.mjs <profile-dir | trace.json>');
    process.exit(1);
  }
  const { dir, events, metrics } = loadInputs(target);
  const summary = analyze(events, metrics);
  const report = writeAnalysisArtifacts({ outDir: dir, summary });
  console.log(report);
  console.log(`\nWrote ${join(dir, 'summary.json')} and ${join(dir, 'report.md')}`);
}

if (isMain(import.meta.url)) main();
