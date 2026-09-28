import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..');

// Entries that read their flags one at a time through argFlag and argSwitch, so
// the list each hands rejectUnknownFlags is the only place a typo can be caught.
// A near-miss spelling ran a different job than the one asked for and exited 0.
const ENTRIES = [
  ['tools/adrs/check-adr-integrity.mjs', ['base']],
  ['tools/e2e-tuning/run-worker-sweep.mjs', ['workers', 'reps', 'grep', 'prebuilt', 'out']],
  [
    'tools/page-load/run-lighthouse-ci.mjs',
    ['baseline', 'out', 'port', 'samples', 'no-build', 'report-only'],
  ],
  ['tools/perf/campaign-status.mjs', ['target', 'output-root', 'ledger', 'modes', 'items']],
  ['tools/perf/check-matrix-staleness.mjs', ['manifest', 'base', 'strict', 'release-gate-age']],
  ['tools/perf/gen-crayon-glaze-sheet.mjs', ['returns', 'passes', 'out-dir', 'engine', 'port']],
  ['tools/perf/gen-performance-matrix.mjs', ['strict']],
  [
    'tools/perf/keep-capture-evidence.mjs',
    [
      'corpus',
      'campaign',
      'product-commit',
      'target',
      'filter',
      'force',
      'keep-all',
      'study',
      'allow-failed',
    ],
  ],
  [
    'tools/perf/rescore-captures.mjs',
    ['corpus', 'filter', 'target', 'json', 'include-unattributable'],
  ],
];

const runEntry = (script, args) =>
  spawnSync(process.execPath, [join(repoRoot, script), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

describe('non-device tool entries', () => {
  // An empty stdout is the proof the refusal came first: every one of these
  // prints, builds, or writes as soon as it starts work.
  it.each(ENTRIES)('%s refuses an unknown flag before doing any work', (script, known) => {
    const result = runEntry(script, ['--definitely-not-a-flag']);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      `Unknown flag --definitely-not-a-flag — known flags: ${known.toSorted().join(', ')}\n`
    );
  });

  // gen:performance-matrix takes its manifest positionally; given the staleness
  // checker's `--manifest=` it regenerated the DEFAULT matrix and exited 0.
  it('refuses the staleness checker spelling of a manifest on the generator', () => {
    const manifest =
      '--manifest=scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json';
    const result = runEntry('tools/perf/gen-performance-matrix.mjs', [manifest]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`Unknown flag ${manifest} — known flags: strict\n`);
  });

  // `--strict=true` read as absent, so the lenient gate ran and passed.
  it('refuses a switch written with a value', () => {
    const result = runEntry('tools/perf/check-matrix-staleness.mjs', ['--strict=true']);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('--strict is a switch: write --strict with no value\n');
  });
});
