// Which version of the capture instrument produced a campaign's banked cells.
//
// A campaign is resumable, and acceptance asks whether a banked artifact
// parses, matches the runtime, passed fidelity, and is in regime — never which
// version of the capture tool produced it. So a campaign resumed after the
// capture path changed silently kept the old path's cells, and the target
// became a mixture of two instruments with nothing in the ledger saying so
// (issue 1293; the 2026-08-24 session fixed three capture-path defects in one
// sitting, and the discard-or-keep decision lived only in the operator's head).
//
// This is the coarse fix the issue recommends first: fingerprint the modules
// that decide what a capture MEASURES, record it beside the ledger, and refuse
// to resume when it moved — naming the changed files and putting the decision
// in front of a human instead of making it silently. `--product-commit` is the
// same idea applied to the product; this is the instrument's half, and the
// instrument changes far more often mid-campaign than the product does.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';

// The modules whose edit means "a capture taken before is a different
// instrument's capture": the page bootstrap and the host that injects it, the
// probe that measures, the two capture drivers (split and Appium — the gesture
// plan lives in the Appium module), and the eraser's ink fill. Deliberately
// NOT scorers or fidelity tables: those re-derive at fold time, so changing
// them re-scores banked cells rather than invalidating them.
export const INSTRUMENT_FILES = [
  'tools/perf/split-capture/lib/page-bootstrap.mjs',
  'tools/perf/split-capture/lib/probe-host.mjs',
  'tools/perf/split-capture/capture-device-frames.mjs',
  'tools/perf/ios/capture-xcuitest-screen.mjs',
  'tools/perf/probes/real-screen-probe.js',
  'tools/perf/lib/eraser-fill.mjs',
];

export function instrumentFingerprint(files = INSTRUMENT_FILES, readFile = defaultRead) {
  const perFile = Object.fromEntries(
    [...files].sort().map((file) => [file, sha256(readFile(file))])
  );
  return {
    fingerprint: sha256(JSON.stringify(perFile)),
    files: perFile,
  };
}

// Null when resuming is safe; otherwise the refusal, naming exactly which
// instrument files changed since the campaign's cells were banked.
export function instrumentChangeProblem(recorded, current) {
  if (!recorded || recorded.fingerprint === current.fingerprint) return null;
  const names = new Set([...Object.keys(recorded.files ?? {}), ...Object.keys(current.files)]);
  const changed = [...names].filter((file) => recorded.files?.[file] !== current.files[file]);
  return (
    'the capture instrument changed since this campaign banked its cells — resuming would ' +
    'silently mix two instruments in one target (issue 1293). Changed:\n' +
    changed.map((file) => `  ${file}`).join('\n') +
    '\nEither start clean (new --output-root, or delete this campaign directory) to recapture ' +
    'everything with the current instrument, or pass --accept-instrument-change to keep the ' +
    'banked cells anyway — deliberately, on record.'
  );
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function defaultRead(file) {
  return readFileSync(join(ROOT, file));
}
