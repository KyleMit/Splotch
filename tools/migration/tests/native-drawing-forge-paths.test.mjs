import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { assertForgeMitigationPolicy } from '../lib/forge-mitigation.mjs';
import { getImporterDependencyPaths } from '../lib/lock-artifacts.mjs';
import { qualifyAudioInputs } from '../lib/native-audio-qualification.mjs';
import {
  projectDrawingForgeLock,
  readDrawingForgeInputs,
} from '../lib/native-drawing-forge-paths.mjs';

const root = join(import.meta.dirname, '../../..');
const audio = qualifyAudioInputs(root);
const lock = audio.lock;
const manifest = audio.inheritedManifest;
const workspace = audio.inheritedWorkspace;
const mitigation = JSON.parse(
  readFileSync(join(root, 'tools/migration/inputs/forge-mitigation.json'))
);
const qualified = readDrawingForgeInputs(root);
const forgeVersion = `1.4.0(patch_hash=${mitigation.patchSha256})`;
const fixtures = [];

function sourceFixture() {
  const path = mkdtempSync(join(tmpdir(), 'splotch-drawing-forge-'));
  fixtures.push(path);
  const inputPath = join(path, qualified.inputPath);
  mkdirSync(dirname(inputPath), { recursive: true });
  writeFileSync(inputPath, readFileSync(join(root, qualified.inputPath)));
  mkdirSync(join(path, CANDIDATE_DIRECTORY), { recursive: true });
  writeFileSync(join(path, CANDIDATE_DIRECTORY, 'package.json'), JSON.stringify(manifest));
  for (const { name } of qualified.input.roots) {
    const target = join(path, 'node_modules', name, 'package.json');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(root, 'node_modules', name, 'package.json')));
  }
  return path;
}

afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

function project(selected = lock, selectedManifest = manifest) {
  return projectDrawingForgeLock(selected, selectedManifest, qualified);
}

function policy(selected) {
  return assertForgeMitigationPolicy(root, project(selected).lock, workspace, mitigation);
}

describe('the N1 save/share Forge adjunct', () => {
  it('rejects changed exact input and installed package bytes through the actual source consumer', () => {
    const path = sourceFixture();
    expect(readDrawingForgeInputs(path).installed).toHaveLength(2);
    const inputPath = join(path, qualified.inputPath);
    const original = readFileSync(inputPath);
    writeFileSync(inputPath, Buffer.concat([original, Buffer.from('\n')]));
    expect(() => readDrawingForgeInputs(path)).toThrow('input bytes changed');
    writeFileSync(inputPath, original);
    const packagePath = join(path, 'node_modules/expo-sharing/package.json');
    const source = readFileSync(packagePath);
    writeFileSync(packagePath, Buffer.concat([source, Buffer.from('\n')]));
    expect(() => readDrawingForgeInputs(path)).toThrow('package source changed');
    writeFileSync(packagePath, source);
    expect(readDrawingForgeInputs(path).installed).toHaveLength(2);
  });

  it('rejects an installed manifest resolving outside the declared owner', () => {
    const path = sourceFixture();
    const target = join(path, 'node_modules/expo-sharing');
    rmSync(target, { recursive: true });
    symlinkSync(join(root, 'node_modules/expo-sharing'), target);
    expect(() => readDrawingForgeInputs(path)).toThrow('escapes owner');
  });

  it('checks the real eight routes before preserving every other lock entry for the old guard', () => {
    const original = structuredClone(lock);
    const { lock: projected, provenance } = project();
    expect(provenance.actualLockedPaths).toEqual(
      getImporterDependencyPaths(lock, 'node-forge@1.4.0')
    );
    expect(provenance.actualLockedPaths).toHaveLength(8);
    expect(provenance.installed.map(({ name, version }) => ({ name, version }))).toEqual([
      { name: 'expo-file-system', version: '57.0.7' },
      { name: 'expo-sharing', version: '57.0.22' },
    ]);
    expect(provenance.baselineComparisonPaths).toHaveLength(4);
    expect(projected.packages).toEqual(lock.packages);
    expect(projected.snapshots).toEqual(lock.snapshots);
    const expected = structuredClone(lock);
    delete expected.importers[CANDIDATE_DIRECTORY].devDependencies['expo-file-system'];
    delete expected.importers[CANDIDATE_DIRECTORY].devDependencies['expo-sharing'];
    expect(projected).toEqual(expected);
    expect(lock).toEqual(original);
    expect(policy(lock)).toEqual(provenance.baselineComparisonPaths);
    expect(() => assertForgeMitigationPolicy(root, lock, workspace, mitigation)).toThrow('path');
  });

  it.each(['expo-file-system', 'expo-sharing'])(
    'rejects missing or changed %s direct identity',
    (name) => {
      const selected = structuredClone(lock);
      delete selected.importers[CANDIDATE_DIRECTORY].devDependencies[name];
      expect(() => project(selected)).toThrow('importer identity');
      const changedManifest = structuredClone(manifest);
      changedManifest.devDependencies[name] = '^57.0.0';
      expect(() => project(lock, changedManifest)).toThrow('direct dependency');
      const changed = structuredClone(lock);
      changed.importers[CANDIDATE_DIRECTORY].devDependencies[name].specifier = '^57.0.0';
      expect(() => project(changed)).toThrow('importer identity');
    }
  );

  it.each(['dependencies', 'optionalDependencies'])(
    'cannot omit a direct %s drawing root',
    (group) => {
      const selected = structuredClone(lock);
      selected.importers[CANDIDATE_DIRECTORY][group] = {
        ...(selected.importers[CANDIDATE_DIRECTORY][group] ?? {}),
        'expo-sharing': selected.importers[CANDIDATE_DIRECTORY].devDependencies['expo-sharing'],
      };
      expect(() => project(selected)).toThrow(`entered ${group}`);
      const changedManifest = structuredClone(manifest);
      changedManifest[group] = { 'expo-sharing': '57.0.22' };
      expect(() => project(lock, changedManifest)).toThrow(`entered ${group}`);
    }
  );

  it('rejects a changed save/share artifact or snapshot before projection', () => {
    for (const record of qualified.input.roots) {
      const selected = structuredClone(lock);
      selected.packages[record.artifactKey].resolution.integrity = 'sha512-corrupt';
      expect(() => project(selected)).toThrow('artifact changed');
      const changed = structuredClone(lock);
      changed.snapshots[record.snapshotKey].dependencies['foreign'] = '1.0.0';
      expect(() => project(changed)).toThrow('snapshot changed');
    }
  });

  it('rejects foreign, extra, aliased direct and shipping-production paths', () => {
    const fixtures = [
      (selected) => {
        selected.importers.foreign = {
          devDependencies: { 'node-forge': { version: forgeVersion } },
        };
      },
      (selected) => {
        selected.importers[CANDIDATE_DIRECTORY].devDependencies['node-forge'] = {
          version: forgeVersion,
        };
      },
      (selected) => {
        selected.importers[CANDIDATE_DIRECTORY].devDependencies['alias'] =
          selected.importers[CANDIDATE_DIRECTORY].devDependencies['expo-sharing'];
      },
      (selected) => {
        selected.importers['.'].dependencies['expo-sharing'] =
          selected.importers[CANDIDATE_DIRECTORY].devDependencies['expo-sharing'];
      },
    ];
    for (const mutate of fixtures) {
      const selected = structuredClone(lock);
      mutate(selected);
      expect(() => project(selected)).toThrow(/path|Unresolved/);
    }
  });

  it('retains the accepted guard refusal for unpatched or corrupt Forge references and bytes', () => {
    const unpatched = structuredClone(lock);
    unpatched.snapshots['node-forge@1.4.0'] = {};
    unpatched.snapshots['@expo/code-signing-certificates@0.0.6'].dependencies['node-forge'] =
      '1.4.0';
    expect(() => policy(unpatched)).toThrow('Unpatched');
    const orphan = structuredClone(lock);
    orphan.snapshots['unrooted@1.0.0'] = { dependencies: { 'node-forge': '1.4.0' } };
    orphan.snapshots['node-forge@1.4.0'] = {};
    expect(() => policy(orphan)).toThrow('Unpatched');
    const corrupt = structuredClone(lock);
    corrupt.packages['node-forge@1.4.0'].resolution.integrity = 'sha512-corrupt';
    expect(() => policy(corrupt)).toThrow('integrity');
    const patch = structuredClone(lock);
    patch.patchedDependencies['node-forge@1.4.0'] = 'foreign';
    expect(() => policy(patch)).toThrow('patch identity');
  });
});
