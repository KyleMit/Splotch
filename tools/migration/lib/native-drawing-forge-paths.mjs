import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { getImporterDependencyPaths } from './lock-artifacts.mjs';

const INPUT_PATH = 'tools/migration/inputs/native-drawing-forge-paths.json';
const INPUT_SHA256 = '654c7cf1c93841eb866d7866ae2d8828e72b16b5ce4681f7c80f133ec86fd52c';
const FORGE_IDENTITY = 'node-forge@1.4.0';
const DRAWING_ROOTS = ['expo-file-system', 'expo-sharing'];

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function readDrawingForgeInputs(root) {
  const bytes = readFileSync(join(root, INPUT_PATH));
  assert.equal(digest(bytes), INPUT_SHA256, 'Drawing Forge input bytes changed');
  const input = JSON.parse(bytes);
  assert.equal(input.schemaVersion, 1);
  assert.deepEqual(
    input.roots.map(({ name }) => name),
    DRAWING_ROOTS
  );
  const require = createRequire(join(root, CANDIDATE_DIRECTORY, 'package.json'));
  const installed = input.roots.map((record) => {
    const path = realpathSync(require.resolve(`${record.name}/package.json`));
    const location = relative(realpathSync(root), path);
    assert.ok(
      !location.startsWith('../') && !location.startsWith('/'),
      'Drawing package escapes owner'
    );
    const source = readFileSync(path);
    assert.equal(
      digest(source),
      record.installedManifestSha256,
      `Drawing package source changed: ${record.name}`
    );
    const manifest = JSON.parse(source);
    assert.equal(manifest.name, record.name);
    assert.equal(manifest.version, record.entry.specifier);
    return { name: record.name, version: manifest.version, path: location, sha256: digest(source) };
  });
  return { input, installed, inputPath: INPUT_PATH, inputSha256: INPUT_SHA256 };
}

function expectedPaths(roots) {
  return roots
    .flatMap((name) => [
      `${CANDIDATE_DIRECTORY}>${name}>${name === 'expo' ? '' : 'expo>'}@expo/cli>node-forge`,
      `${CANDIDATE_DIRECTORY}>${name}>${name === 'expo' ? '' : 'expo>'}@expo/cli>@expo/code-signing-certificates>node-forge`,
    ])
    .sort();
}

export function projectDrawingForgeLock(lock, manifest, qualified) {
  const importer = lock.importers[CANDIDATE_DIRECTORY];
  for (const record of qualified.input.roots) {
    assert.equal(
      manifest.devDependencies?.[record.name],
      record.entry.specifier,
      `Drawing direct dependency changed: ${record.name}`
    );
    for (const owner of [manifest, importer])
      for (const group of ['dependencies', 'optionalDependencies'])
        assert.ok(
          !Object.hasOwn(owner[group] ?? {}, record.name),
          `Drawing root entered ${group}: ${record.name}`
        );
    assert.deepEqual(
      importer.devDependencies?.[record.name],
      record.entry,
      `Drawing importer identity changed: ${record.name}`
    );
    assert.deepEqual(
      lock.packages[record.artifactKey],
      record.artifact,
      `Drawing artifact changed: ${record.name}`
    );
    assert.deepEqual(
      lock.snapshots[record.snapshotKey],
      record.snapshot,
      `Drawing snapshot changed: ${record.name}`
    );
  }
  const actualLockedPaths = getImporterDependencyPaths(lock, FORGE_IDENTITY);
  assert.deepEqual(
    actualLockedPaths,
    expectedPaths(['babel-preset-expo', 'expo', ...DRAWING_ROOTS]),
    'Unsupported actual drawing Forge path'
  );
  const projected = structuredClone(lock);
  for (const name of DRAWING_ROOTS)
    delete projected.importers[CANDIDATE_DIRECTORY].devDependencies[name];
  const baselineComparisonPaths = getImporterDependencyPaths(projected, FORGE_IDENTITY);
  assert.deepEqual(
    baselineComparisonPaths,
    expectedPaths(['babel-preset-expo', 'expo']),
    'Drawing projection changed baseline paths'
  );
  return {
    lock: projected,
    provenance: {
      inputPath: qualified.inputPath,
      inputSha256: qualified.inputSha256,
      actualLockedPaths,
      baselineComparisonPaths,
      removedDirectDevRoots: [...DRAWING_ROOTS],
      installed: qualified.installed,
      scope:
        'Actual eight paths validated; only two N1 dev roots omitted from a copied lock for the unchanged four-path Forge policy. Every snapshot, package, other importer and installed-source/RSA/consumer check is retained.',
    },
  };
}
