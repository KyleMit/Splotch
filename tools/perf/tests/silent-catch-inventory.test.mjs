import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';

// Issue 1296's cheap lint: a `catch` binding nothing, or a promise-chain
// `.catch(() => <benign literal>)`, is the exact signature of a swallowed
// failure indistinguishable from a clean negative — the shape that let a
// ReferenceError read as "no cause found" for a whole review cycle. Most of
// the remaining sites below are correct (a narrow try over JSON.parse, a bare
// fetch where network failure IS the meaning), so this is a RATCHET, not a
// ban: the audited count per file is pinned, and a new silent swallow fails
// here with the alternative named. Route broken code out of a swallow with
// `rethrowIfBroken` (lib/error-classification.mjs), or return a reason beside
// the value like `servedBuildFingerprintProblem` does — then, if the swallow
// really is the right shape, update the budget with the review that says so.
const PERF_ROOT = join(ROOT, 'tools', 'perf');

const SILENT_SWALLOW = [
  /catch \{/g,
  /\.catch\(\(\) => (?:null|false|undefined|\[\]|\(\{\}\)|\{\}\))/g,
];

// The audited baseline (2026-08-26, issue 1296): every entry was classified
// SAFE or reviewed-and-kept in that audit. Absence means zero.
const AUDITED_BUDGET = {
  'analyze-chrome-trace.mjs': 3,
  'analyze-frame-capture.mjs': 1,
  'analyze-web-inspector.mjs': 2,
  'android/capture-browser-actions.mjs': 6,
  'campaign-sources.mjs': 1,
  'check-matrix-staleness.mjs': 3,
  'ios/capture-xcuitest-actions.mjs': 6,
  'ios/capture-xcuitest-screen.mjs': 7,
  'keep-capture-evidence.mjs': 1,
  'lib/campaign-plan.mjs': 2,
  'lib/chrome-trace-capture.mjs': 1,
  'lib/instruments-trace.mjs': 1,
  'lib/profile-device-session.mjs': 1,
  'lib/timeline-records.mjs': 1,
  'lib/toddler-session.mjs': 1,
  'lib/webkit-inspector.mjs': 5,
  'prepare-capture.mjs': 8,
  'rescore-captures.mjs': 2,
  'run-campaign.mjs': 1,
  'serve-profile-build.mjs': 2,
  'split-capture/capture-device-frames.mjs': 2,
  'split-capture/capture-hand-input.mjs': 1,
  'split-capture/lib/chrome-tabs.mjs': 2,
  'split-capture/lib/probe-host.mjs': 1,
  'split-capture/measure-probe-overhead.mjs': 1,
  'web/capture-settings-open.mjs': 2,
  'web/capture-web-mount.mjs': 1,
  'web/replay-input-recording.mjs': 3,
  'web/run-undo-scenarios.mjs': 1,
};

function perfSources(dir = PERF_ROOT) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort()) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'tests') found.push(...perfSources(full));
    } else if (entry.name.endsWith('.mjs')) {
      found.push(full);
    }
  }
  return found;
}

describe('silent catches in tools/perf stay at their audited count', () => {
  it('matches the issue-1296 audited budget exactly', () => {
    const counts = {};
    for (const file of perfSources()) {
      const source = readFileSync(file, 'utf8');
      const count = SILENT_SWALLOW.reduce(
        (total, pattern) => total + (source.match(pattern)?.length ?? 0),
        0
      );
      if (count > 0) counts[relative(PERF_ROOT, file)] = count;
    }
    expect(
      counts,
      'A silent swallow was added or removed. New catch: make broken code ' +
        'distinguishable — rethrowIfBroken (lib/error-classification.mjs) or a ' +
        'reason beside the value — or record the reviewed exception here. ' +
        'Removed one: update the budget so the ratchet stays tight.'
    ).toEqual(AUDITED_BUDGET);
  });
});
