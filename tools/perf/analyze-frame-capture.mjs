// Re-read a saved real-screen capture without re-drawing it.
//
//   npm run perf:analyze:frames -- perf-profiles/<dir>/real-screen.json
//
// The probe records raw tables and computes nothing, precisely so a capture
// outlives the maths that was current when it was taken: every metric definition
// here has already been corrected once against a real capture (the frame budget
// is derived rather than assumed at 120 Hz, move gaps are within-stroke, paint
// latency is per-move, and a finger-lift into an idle page is no longer reported
// as a two-second hitch). Re-running this is how a definition change is checked.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fail, isMain, runMain } from '../lib/proc.mjs';
import {
  bucketRows,
  comparisonRows,
  engineRows,
  inputRows,
  pacingRows,
  starvationRows,
  summarizeRun,
} from './lib/real-screen-stats.mjs';

// Long enough that a bucket holds a few hundred frames, short enough to show an
// onset inside one phase.
const BUCKET_SECONDS = 5;

export function printRun(capture, { forensics = true } = {}) {
  const { intervalMs, phases } = summarizeRun(capture.report);
  const device = capture.device ?? {};
  console.log(
    `${device.name ?? 'unknown device'} (iOS ${device.os ?? '?'}) · ${capture.mode ?? '?'} input · ` +
      `observed frame beat ${intervalMs} ms (${(1000 / intervalMs).toFixed(0)} Hz)`
  );

  console.log('\nFrame pacing (in-contact frames only)');
  console.table(pacingRows(phases));
  console.log('\nInput delivery and paint latency');
  console.table(inputRows(phases));
  console.log('\nEngine cost inside those frames, and the stroke-end hitch');
  console.table(engineRows(phases));
  console.log('\nTrusted-input render-starvation episodes');
  console.table(starvationRows(phases));

  const comparisons = comparisonRows(phases);
  if (comparisons.length) {
    console.log('\nWhat each suppression bought against `page` (negative is better)');
    console.table(comparisons);
  }

  for (const phase of phases) {
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
    for (const phase of phases) {
      if (!phase.worstFrames?.length) continue;
      console.log(`\nWorst frames in ${phase.key} — where the freeze sat`);
      console.table(phase.worstFrames);
    }
  }
  return { intervalMs, phases };
}

// The refusal the corpus marking exists for (issues 1315/1356): a capture a
// sibling evidence index marks `cellAttributable: false` re-analyzes cleanly
// and answers for a cell it never measured. This was the one documented reader
// still consuming evidence with no attribution check after issue 1350 closed
// the rescorer's. Returns the refusal message, or null; pure for the test.
export function unattributableCaptureProblem(path, { includeUnattributable = false } = {}) {
  const indexPath = join(dirname(path), 'index.json');
  if (!existsSync(indexPath)) return null;
  let index;
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch {
    return null;
  }
  const entry = (index.kept ?? []).find((kept) => kept?.file === basename(path));
  if (!entry || entry.cellAttributable !== false || includeUnattributable) return null;
  return (
    `${basename(path)}: its evidence index marks cellAttributable: false` +
    (entry.reportNonce ? ` (report nonce: ${entry.reportNonce})` : '') +
    ' — the frame tables are genuine but answer for a different cell than the label. ' +
    'Pass --include-unattributable to analyze it deliberately.'
  );
}

export async function analyzeCapture(argv = process.argv.slice(2)) {
  const path = argv.find((arg) => !arg.startsWith('--'));
  if (!path) fail('Usage: npm run perf:analyze:frames -- <real-screen.json>');
  const refusal = unattributableCaptureProblem(path, {
    includeUnattributable: argv.includes('--include-unattributable'),
  });
  if (refusal) fail(refusal);
  let capture;
  try {
    capture = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`Could not read ${path} as a real-screen capture: ${error.message}`);
  }
  if (!capture?.report?.phases) fail(`${path} has no .report.phases — not a real-screen capture.`);

  const summaries = printRun(capture, { forensics: !argv.includes('--no-forensics') });
  const out = join(dirname(path), 'summaries.json');
  // `{ intervalMs, phases }`, so the saved file carries the derived beat — the
  // whole point of this entry point is a capture outliving its maths.
  writeFileSync(out, `${JSON.stringify(summaries, null, 2)}\n`);
  console.log(`\nWrote ${out}`);
  return summaries;
}

if (isMain(import.meta.url)) runMain(analyzeCapture);
