// Re-read a saved real-screen capture without re-drawing it.
//
//   npm run perf:frames:analyze -- perf-profiles/<dir>/real-screen.json
//
// The probe records raw tables and computes nothing, precisely so a capture
// outlives the maths that was current when it was taken: every metric definition
// here has already been corrected once against a real capture (the frame budget
// is derived rather than assumed at 120 Hz, move gaps are within-stroke, paint
// latency is per-move, and a finger-lift into an idle page is no longer reported
// as a two-second hitch). Re-running this is how a definition change is checked.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fail, isMain, runMain } from '../lib/proc.mjs';
import {
  bucketRows,
  comparisonRows,
  engineRows,
  inputRows,
  pacingRows,
  summarizeRun,
} from './real-screen-stats.mjs';

// Long enough that a bucket holds a few hundred frames, short enough to show an
// onset inside one phase.
const BUCKET_SECONDS = 5;

export function printRun(capture, { forensics = true } = {}) {
  const summaries = summarizeRun(capture.report);
  const device = capture.device ?? {};
  console.log(
    `${device.name ?? 'unknown device'} (iOS ${device.os ?? '?'}) · ${capture.mode ?? '?'} input · ` +
      `observed frame beat ${summaries.intervalMs} ms (${(1000 / summaries.intervalMs).toFixed(0)} Hz)`
  );

  console.log('\nFrame pacing (in-contact frames only)');
  console.table(pacingRows(summaries));
  console.log('\nInput delivery and paint latency');
  console.table(inputRows(summaries));
  console.log('\nEngine cost inside those frames, and the stroke-end hitch');
  console.table(engineRows(summaries));

  const comparisons = comparisonRows(summaries);
  if (comparisons.length) {
    console.log('\nWhat each suppression bought against `page` (negative is better)');
    console.table(comparisons);
  }

  for (const phase of summaries) {
    if (!phase.engine) continue;
    const marks = Object.entries(phase.engine.byName);
    if (marks.length) {
      console.log(`\nengine.* measures in ${phase.key}`);
      console.table(
        Object.fromEntries(
          marks.map(([name, entry]) => [
            name,
            { count: entry.count, 'total ms': entry.totalMs, 'max ms': entry.maxMs },
          ])
        )
      );
    }
  }

  // A phase compared to itself earlier: the only comparison a hand-drawn run
  // supports, and the "worse the more ink is on the page" claim as a measurement.
  const buckets = bucketRows(capture.report, BUCKET_SECONDS);
  if (buckets.length > 1) {
    console.log(`\nPacing over time, ${BUCKET_SECONDS}s buckets within each phase`);
    console.table(buckets);
  }

  if (forensics) {
    for (const phase of summaries) {
      if (!phase.worstFrames?.length) continue;
      console.log(`\nWorst frames in ${phase.key} — where the freeze sat`);
      console.table(phase.worstFrames);
    }
  }
  return summaries;
}

export async function analyzeCapture(argv = process.argv.slice(2)) {
  const path = argv.find((arg) => !arg.startsWith('--'));
  if (!path) fail('Usage: npm run perf:frames:analyze -- <real-screen.json>');
  let capture;
  try {
    capture = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`Could not read ${path} as a real-screen capture: ${error.message}`);
  }
  if (!capture?.report?.phases) fail(`${path} has no .report.phases — not a real-screen capture.`);

  const summaries = printRun(capture, { forensics: !argv.includes('--no-forensics') });
  const out = join(dirname(path), 'summaries.json');
  writeFileSync(out, `${JSON.stringify(summaries, null, 2)}\n`);
  console.log(`\nWrote ${out}`);
  return summaries;
}

if (isMain(import.meta.url)) runMain(analyzeCapture);
