// Records what one released native build downloads from the hosted origin:
// regenerates that ref's mobile coloring-pack manifest with that ref's own
// generator and static tree, then writes the addressed paths and digests to
// tools/release/coloring-pack-snapshots/<version>.json for the retention guard.
//   npm run gen:coloring-pack-snapshot -- --ref v1.6.0

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { capture, fail, isMain, parseOrFail, tryCapture } from '../lib/proc.mjs';
import {
  COLORING_PACK_SNAPSHOT_DIR,
  snapshotFromManifest,
} from './lib/coloring-pack-retention.mjs';
import { SEMVER } from './lib/release-frontmatter.mjs';

const GENERATOR_INPUTS = ['web/coloringPackManifest.ts', 'web/src/lib', 'web/static/coloring'];
const MANIFEST_FILE = 'manifest.json';

const GENERATE_SCRIPT = `
import { writeFileSync } from 'node:fs';
const { buildColoringPackManifest } = await import('./coloringPackManifest.ts');
const [appVersion, out] = process.argv.slice(-2);
writeFileSync(out, JSON.stringify(buildColoringPackManifest(appVersion, 'mobile').manifest));
`;

function extractGeneratorInputs(ref, directory) {
  const archive = join(directory, 'inputs.tar');
  const steps = [
    ['git', ['archive', '--format=tar', '-o', archive, ref, ...GENERATOR_INPUTS]],
    ['tar', ['-xf', archive, '-C', directory]],
  ];
  for (const [cmd, args] of steps) {
    const result = tryCapture(cmd, args);
    if (!result.ok) throw new Error(`${cmd} failed: ${result.stderr}`);
  }
}

function generateManifest(directory, appVersion) {
  const out = join(directory, MANIFEST_FILE);
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--disable-warning=ExperimentalWarning',
      '--input-type=module',
      '-e',
      GENERATE_SCRIPT,
      appVersion,
      out,
    ],
    { cwd: join(directory, 'web'), encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(`manifest generation failed:\n${result.stderr}`);
  return JSON.parse(readFileSync(out, 'utf8'));
}

export function genColoringPackSnapshot(ref) {
  const commit = capture('git', ['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  const appVersion = JSON.parse(capture('git', ['show', `${commit}:package.json`])).version;
  if (!SEMVER.test(appVersion)) fail(`${ref} has no semver package.json version`);
  const directory = mkdtempSync(join(tmpdir(), 'splotch-pack-snapshot-'));
  try {
    extractGeneratorInputs(commit, directory);
    const manifest = generateManifest(directory, appVersion);
    const snapshot = snapshotFromManifest(manifest, { ref, commit });
    mkdirSync(COLORING_PACK_SNAPSHOT_DIR, { recursive: true });
    const target = join(COLORING_PACK_SNAPSHOT_DIR, `${appVersion}.json`);
    writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`);
    const fileCount = snapshot.books.reduce((sum, book) => sum + Object.keys(book.files).length, 0);
    console.log(`[coloring-pack-snapshot] ${ref} → ${target} (${fileCount} files)`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  const { values } = parseOrFail(() =>
    parseArgs({ options: { ref: { type: 'string' } }, strict: true })
  );
  if (!values.ref) fail('usage: gen-coloring-pack-snapshot.mjs --ref <release tag>');
  genColoringPackSnapshot(values.ref);
}
