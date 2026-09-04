import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';

// Issue 1296's cheap lint: a `catch` binding nothing, or a promise-chain
// `.catch(() => <benign literal>)`, is the exact signature of a swallowed
// failure indistinguishable from a clean negative — the shape that let a
// ReferenceError read as "no cause found" for a whole review cycle. Most of
// the sites below are correct (a narrow try over JSON.parse, a bare fetch
// where network failure IS the meaning), so this is a RATCHET, not a ban.
//
// Occurrences are pinned by IDENTITY, not by count (the PR 1376 review: a
// per-file total lets one audited-safe swallow be swapped for one risky one
// with no signal, and moving a swallow between files churns two budgets).
// Each signature hashes the swallow's own line plus its neighbours, so a new
// swallow, a moved swallow, and an edited swallow each show up as exactly the
// signature that changed. Route broken code out of a swallow with
// `rethrowIfBroken` (lib/error-classification.mjs), or return a reason beside
// the value like `servedBuildFingerprintProblem` does — then, if the swallow
// really is the right shape, re-run this test's inventory script (its
// docstring below) and update the audited entry with the review that says so.
const PERF_ROOT = join(ROOT, 'tools', 'perf');

const SILENT_SWALLOW = [
  ['bare-catch', /catch \{/g],
  ['benign-catch', /\.catch\(\(\) => (?:null|false|undefined|\[\]|\(\{\}\)|\{\}\))/g],
];

// The audited baseline (issue 1296, updated by the PR 1376 review round):
// every entry was classified SAFE or reviewed-and-kept. Absence means zero.
const AUDITED_SWALLOWS = {
  'analyze-chrome-trace.mjs': [
    'bare-catch@2433b1a5be6e',
    'bare-catch@26d026501a48',
    'bare-catch@79eaceadfc75',
  ],
  'analyze-frame-capture.mjs': ['bare-catch@e3b82b6230ea'],
  'analyze-web-inspector.mjs': ['bare-catch@7811a0b0c7fb', 'bare-catch@c4c2eb6c7ad8'],
  'android/capture-browser-actions.mjs': [
    'bare-catch@c6a34e31adb5',
    'bare-catch@f34a0355df5f',
    'benign-catch@10c7623c23ee',
    'benign-catch@6667cb768f1e',
    'benign-catch@8838e0ff63b8',
    'benign-catch@f8bf0febf110',
  ],
  'campaign-sources.mjs': ['bare-catch@0c0deda10ec3'],
  'check-matrix-staleness.mjs': [
    'bare-catch@128f2f5c7510',
    'bare-catch@b79fc68a609d',
    'bare-catch@c908b42fdfff',
  ],
  'ios/capture-xcuitest-actions.mjs': [
    'benign-catch@02b480484846',
    'benign-catch@0f2d23941df5',
    'benign-catch@12e17f951c5c',
    'benign-catch@7f74df790887',
    'benign-catch@923be2c55c3e',
    'benign-catch@b2083a51c7bc',
  ],
  'ios/capture-xcuitest-screen.mjs': [
    'bare-catch@406e6568d91f',
    'benign-catch@3e5e8e88d212',
    'benign-catch@7a5ac8eb2037',
    'benign-catch@d56f8881e947',
    'benign-catch@ef8dbecbf1d8',
    'benign-catch@fbc8c7c95b75',
  ],
  'keep-capture-evidence.mjs': ['bare-catch@4f60ec3d7800'],
  'lib/campaign-plan.mjs': ['bare-catch@3485282c5118', 'bare-catch@6f532e4905f5'],
  'lib/chrome-trace-capture.mjs': ['bare-catch@0aca3a70fed0'],
  'lib/instruments-trace.mjs': ['bare-catch@89e258b2d4bd'],
  'lib/profile-device-session.mjs': ['benign-catch@42fff9a3b9a8'],
  'lib/timeline-records.mjs': ['benign-catch@77c9328c971e'],
  'lib/toddler-session.mjs': ['benign-catch@a52ea638ab63'],
  'lib/webkit-inspector.mjs': [
    'bare-catch@3224363f053e',
    'bare-catch@3bf750ac94bd',
    'bare-catch@709470fa5c48',
    'benign-catch@3e436334ff84',
    'benign-catch@4828694def01',
  ],
  'prepare-capture.mjs': [
    'bare-catch@509719cc3b5e',
    'bare-catch@57b9d9dd0e9e',
    'benign-catch@366746039e57',
    'benign-catch@39adc2a771e1',
    'benign-catch@3d3f50d36eb5',
    'benign-catch@553d2b2bbc88',
    'benign-catch@7b77350bc7e3',
    'benign-catch@855c8907d99b',
  ],
  'rescore-captures.mjs': ['bare-catch@35c8f9cb0465', 'bare-catch@fc92e0eec18b'],
  'run-campaign.mjs': ['bare-catch@90e6c3c41aa0'],
  'serve-profile-build.mjs': ['bare-catch@6617bf068df7', 'bare-catch@9a2c060a4fa1'],
  'split-capture/capture-device-frames.mjs': [
    'benign-catch@09d7336a7f15',
    'benign-catch@25459d000b15',
  ],
  'split-capture/capture-hand-input.mjs': ['bare-catch@31986c96fa97'],
  'split-capture/lib/chrome-tabs.mjs': ['bare-catch@ecd020e49256', 'bare-catch@f34a0355df5f'],
  'split-capture/lib/probe-host.mjs': ['benign-catch@32f2b1e97fd2'],
  'split-capture/measure-probe-overhead.mjs': ['benign-catch@89634d1274b4'],
  'web/capture-settings-open.mjs': ['bare-catch@d89464ceced4', 'benign-catch@bbe8be48cbd1'],
  'web/capture-web-mount.mjs': ['bare-catch@45c51b025422'],
  'web/replay-input-recording.mjs': [
    'bare-catch@1c32d5d75f73',
    'bare-catch@22b7eee07a18',
    'benign-catch@101e08d432a8',
  ],
  'web/run-undo-scenarios.mjs': ['benign-catch@d89740044734'],
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

// One signature per occurrence: kind plus a short hash of the swallow's line
// and its immediate neighbours (trimmed), so identity survives reindenting
// but not a change to what the swallow actually wraps.
export function swallowSignatures(source) {
  const lines = source.split('\n');
  const signatures = [];
  lines.forEach((line, index) => {
    for (const [kind, pattern] of SILENT_SWALLOW) {
      for (const _match of line.matchAll(pattern)) {
        const context = lines
          .slice(Math.max(0, index - 1), index + 2)
          .map((neighbour) => neighbour.trim())
          .join('\n');
        const digest = createHash('sha256').update(context).digest('hex').slice(0, 12);
        signatures.push(`${kind}@${digest}`);
      }
    }
  });
  return signatures.sort();
}

describe('silent catches in tools/perf stay at their audited identities', () => {
  it('matches the audited swallow inventory exactly', () => {
    const found = {};
    for (const file of perfSources()) {
      const signatures = swallowSignatures(readFileSync(file, 'utf8'));
      if (signatures.length > 0) found[relative(PERF_ROOT, file)] = signatures;
    }
    expect(
      found,
      'A silent swallow was added, moved, or edited. New or changed catch: make ' +
        'broken code distinguishable — rethrowIfBroken or a reason beside the ' +
        'value — or record the reviewed occurrence here. Removed one: delete its ' +
        'signature so the ratchet stays tight.'
    ).toEqual(AUDITED_SWALLOWS);
  });
});
