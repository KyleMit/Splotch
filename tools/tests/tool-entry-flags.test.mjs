import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

  // Each entry reads its flags in its isMain branch and hands them to the
  // function it runs; every row fails on a value only the flag could supply.
  it.each([
    ['tools/perf/campaign-status.mjs', ['--target=no-such-target'], 'no-such-target'],
    ['tools/perf/check-matrix-staleness.mjs', ['--manifest=no/such.json'], 'no/such.json'],
    ['tools/perf/gen-performance-matrix.mjs', ['no/such.json'], 'no/such.json'],
    ['tools/perf/keep-capture-evidence.mjs', ['--corpus=x'], '--campaign=<name> is required'],
    ['tools/perf/rescore-captures.mjs', ['--corpus=tools/perf', '--filter=no-such'], 'no-such'],
    ['tools/page-load/run-lighthouse-ci.mjs', ['--samples=4'], '--samples must be an odd'],
  ])('%s hands %j to the function it runs', (script, args, expected) => {
    const result = runEntry(script, args);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expected);
  });

  // `--strict=true` read as absent, so the lenient gate ran and passed.
  it('refuses a switch written with a value', () => {
    const result = runEntry('tools/perf/check-matrix-staleness.mjs', ['--strict=true']);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('--strict is a switch: write --strict with no value\n');
  });
});

// The text between each exported function's opening paren and its matching
// close: its whole parameter list, defaults included.
function exportedParameterLists(source) {
  return [...source.matchAll(/export (?:async )?function (\w+)\(/g)].map((match) => {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    while (depth > 0 && end < source.length) {
      if (source[end] === '(') depth += 1;
      else if (source[end] === ')') depth -= 1;
      end += 1;
    }
    return { name: match[1], parameters: source.slice(start, end - 1) };
  });
}

describe('exported tool functions', () => {
  const toolSources = execFileSync('git', ['ls-files', 'tools'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    // asset-gen is a self-contained package with its own CLI conventions.
    .filter(
      (path) =>
        path.endsWith('.mjs') && !/\/tests\//.test(path) && !path.startsWith('tools/asset-gen/')
    )
    .map((path) => ({ path, source: readFileSync(join(repoRoot, path), 'utf8') }));

  const parameterReads = (pattern) =>
    toolSources.flatMap(({ path, source }) =>
      exportedParameterLists(source)
        .filter(({ parameters }) => pattern.test(parameters))
        .map(({ name }) => `${path}: ${name}`)
    );

  // A flag read in a parameter default runs whenever a caller leaves that
  // option out, so an in-process caller answers to its own process's argv:
  // prepare-capture never passes verifyAndroidInput a gesture count, so its
  // own --gesture-repeats would have set the preflight's. The entry's isMain
  // branch reads the flags and passes them in instead. The capture entries
  // below still read theirs in place; the list can only shrink.
  const KNOWN_FLAG_READING_DEFAULTS = [
    'tools/perf/android/capture-bundled-frames.mjs: captureBundledFrames',
    'tools/perf/split-capture/capture-device-frames.mjs: captureDeviceFrames',
    'tools/perf/split-capture/capture-hand-input.mjs: captureHandInput',
  ];
  const flagReadingDefaults = parameterReads(
    /\barg(?:Flag|Switch|Number)\(|process\.argv\.includes\(/
  );

  it('read no single flag in a parameter default', () => {
    expect(
      flagReadingDefaults.filter((entry) => !KNOWN_FLAG_READING_DEFAULTS.includes(entry))
    ).toEqual([]);
  });

  it('lists only known flag-reading defaults that still exist', () => {
    expect(
      KNOWN_FLAG_READING_DEFAULTS.filter((entry) => !flagReadingDefaults.includes(entry))
    ).toEqual([]);
  });

  // An entry's own run function may default its argv to the process's, since
  // no other CLI calls it; a capability library is imported by other CLIs, so
  // its caller passes argv. tools/lib/proc.mjs is the argv reader itself.
  it('in a capability library take argv from the caller', () => {
    const libraryReads = parameterReads(/process\.argv/).filter(
      (entry) => /\/lib\//.test(entry) && !entry.startsWith('tools/lib/proc.mjs:')
    );

    expect(libraryReads).toEqual([]);
  });
});
