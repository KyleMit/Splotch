import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
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

// Device entries, each with the argv of its offline mode: spawned in it, an
// entry whose refusal went missing prints a checklist instead of waking a phone.
const DEVICE_ENTRIES = [
  [
    'tools/perf/run-operator-session.mjs',
    ['--plan'],
    [
      'plan',
      'steps',
      'brushes',
      'orientations',
      'theme',
      'seconds',
      'probe-port',
      'android-serial',
      'ios-udid',
    ],
  ],
];

const runEntry = (script, args) =>
  spawnSync(process.execPath, [join(repoRoot, script), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

function expectUnknownFlagRefused(result, known) {
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe(
    `Unknown flag --definitely-not-a-flag — known flags: ${known.toSorted().join(', ')}\n`
  );
}

describe('non-device tool entries', () => {
  // An empty stdout is the proof the refusal came first: every one of these
  // prints, builds, or writes as soon as it starts work.
  it.each(ENTRIES)('%s refuses an unknown flag before doing any work', (script, known) => {
    expectUnknownFlagRefused(runEntry(script, ['--definitely-not-a-flag']), known);
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

describe('device tool entries', () => {
  it.each(DEVICE_ENTRIES)(
    '%s refuses an unknown flag before doing any work',
    (script, offline, known) => {
      expectUnknownFlagRefused(runEntry(script, [...offline, '--definitely-not-a-flag']), known);
    }
  );
});

const hasExportModifier = (node) =>
  ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
const isFunctionValue = (node) =>
  node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));

// Each exported function's parameter list as source text, defaults included:
// `export function`, `export const f = (…) =>`, and a function a later
// `export { … }` names. Parsed rather than matched, so a paren inside a
// string default cannot end the list early.
function exportedParameterLists(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const exportedByName = new Set();
  const functions = [];
  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier) {
      for (const element of statement.exportClause?.elements ?? []) {
        exportedByName.add((element.propertyName ?? element.name).text);
      }
    } else if (ts.isFunctionDeclaration(statement)) {
      const exported = hasExportModifier(statement);
      functions.push({ name: statement.name?.text ?? 'default', node: statement, exported });
    } else if (ts.isVariableStatement(statement)) {
      const exported = hasExportModifier(statement);
      for (const { name, initializer } of statement.declarationList.declarations) {
        if (!isFunctionValue(initializer)) continue;
        functions.push({ name: name.getText(file), node: initializer, exported });
      }
    }
  }
  return functions
    .filter(({ name, exported }) => exported || exportedByName.has(name))
    .map(({ name, node }) => ({
      name,
      parameters: node.parameters.map((parameter) => parameter.getText(file)).join(', '),
    }));
}

const FLAG_READ = /\barg(?:Flag|Switch|Number)\(|process\.argv\.includes\(/;

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
      exportedParameterLists(path, source)
        .filter(({ parameters }) => pattern.test(parameters))
        .map(({ name }) => `${path}: ${name}`)
    );

  it('finds a flag read in every exported form the guards rely on', () => {
    const source = [
      "export function stringParen(label = ')', port = argNumber('port')) {}",
      "export const arrow = ({ strict = argSwitch('strict') } = {}) => strict;",
      "function exportedLater(base = argFlag('base')) {}",
      'export { exportedLater };',
      "function internal(flag = argFlag('flag')) {}",
      'export function clean(argv) {}',
    ].join('\n');

    expect(
      exportedParameterLists('fixture.mjs', source)
        .filter(({ parameters }) => FLAG_READ.test(parameters))
        .map(({ name }) => name)
    ).toEqual(['stringParen', 'arrow', 'exportedLater']);
  });

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
  const flagReadingDefaults = parameterReads(FLAG_READ);

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
