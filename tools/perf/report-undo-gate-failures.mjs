// Reads the undo gate's own artifact and reports WHAT failed, so the post-merge
// retry job can ask whether a failure reproduced instead of only whether one
// happened. See tools/perf/lib/undo-gate-failures.mjs for why that distinction is
// the whole point of the retry.
//
//   node tools/perf/report-undo-gate-failures.mjs
//     → this run's failure fingerprint, e.g. `multi-finger:breach`
//
//   node tools/perf/report-undo-gate-failures.mjs --first=<fingerprint>
//     → the subset this run reproduced from that one; empty when nothing did, and
//       GATE_COMPARISON_UNKNOWN when the two runs cannot be compared at all
//
// Both modes print one line to stdout and exit 0: the caller decides what a
// reproduction means, and a reporting script that exits non-zero would be
// indistinguishable from the gate it reports on. Empty output means "nothing
// reproduced" ONLY in the second mode's comparable case — which is why an
// uncomparable pair prints a sentinel rather than an empty line.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isMain, ROOT } from '../lib/proc.mjs';
import { rethrowIfBroken } from './lib/error-classification.mjs';
import {
  comparableFingerprints,
  formatGateFailures,
  GATE_COMPARISON_UNKNOWN,
  gateFailureFingerprint,
  parseGateFailures,
  reproducedGateFailures,
} from './lib/undo-gate-failures.mjs';

const PROFILE_ROOT = join(ROOT, 'perf-profiles');
const SUMMARY_FILE = 'undo-scenarios.json';

// Newest by mtime: a run directory is timestamped, but the fingerprint has to
// describe the run that just happened even if a directory name sorts oddly.
export function newestSummaryPath(profileRoot = PROFILE_ROOT) {
  let newest = null;
  let newestMtimeMs = -Infinity;
  let entries;
  try {
    entries = readdirSync(profileRoot, { withFileTypes: true });
  } catch (error) {
    // No profile directory at all is a run that wrote no artifact — an empty
    // fingerprint, which fails closed downstream. Any OTHER read failure is
    // this tool being broken, and must not wear the same face (issue 1296).
    if (error?.code !== 'ENOENT') throw error;
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(profileRoot, entry.name, SUMMARY_FILE);
    // throwIfNoEntry: false, so a profile directory from another run that
    // wrote no undo summary is skipped rather than caught.
    const stats = statSync(candidate, { throwIfNoEntry: false });
    if (stats == null) continue;
    if (stats.mtimeMs > newestMtimeMs) {
      newestMtimeMs = stats.mtimeMs;
      newest = candidate;
    }
  }
  return newest;
}

export function readFingerprint(profileRoot = PROFILE_ROOT) {
  const path = newestSummaryPath(profileRoot);
  if (path == null) return [];
  try {
    return gateFailureFingerprint(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    // Reported, never thrown: an unreadable artifact must leave the caller with
    // an empty fingerprint (which fails closed) rather than with a crash it
    // would have to tell apart from a gate failure. Broken code still escapes.
    rethrowIfBroken(error);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`! could not read ${path}: ${message}`);
    return [];
  }
}

function main(argv) {
  const firstFlag = argv.find((arg) => arg.startsWith('--first='));
  const current = readFingerprint();
  if (firstFlag == null) {
    console.log(formatGateFailures(current));
    return;
  }
  const first = parseGateFailures(firstFlag.slice('--first='.length));
  if (!comparableFingerprints(first, current)) {
    console.error(
      '! one of the two runs left no readable failure fingerprint, so nothing can ' +
        'be compared. Reporting that rather than an acquittal.'
    );
    console.log(GATE_COMPARISON_UNKNOWN);
    return;
  }
  console.log(formatGateFailures(reproducedGateFailures(first, current)));
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
