import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { readLockFile, getImporterDependencyPaths, artifactMap } from './lock-artifacts.mjs';
import { verifyArtifactIntegrity } from './archive-inventory.mjs';
import { assertArtifactInventory } from './topology-policy.mjs';
import { qualifyAudioResetPatch, readAudioResetPatchInputs } from './native-audio-reset-patch.mjs';

export const AUDIO_EVIDENCE = 'docs/migration/evidence/native-audio-settings-20261009';
const BASELINE_SHA = '9fed398b8fda5f309d40f35e7d65296bfc70bef356229ec5c44f144ffb0efd57';
const ROOTS = ['expo-audio', 'expo-asset'];
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
export function projectAudioLock(lock, baseline, manifest, input) {
  const importer = lock.importers[CANDIDATE_DIRECTORY];
  for (const record of input.roots) {
    assert.equal(manifest.devDependencies[record.name], record.entry.specifier);
    for (const owner of [manifest, importer])
      for (const group of ['dependencies', 'optionalDependencies'])
        assert.ok(
          !Object.hasOwn(owner[group] ?? {}, record.name),
          'Audio root moved outside dev graph'
        );
    assert.deepEqual(importer.devDependencies[record.name], record.entry);
    assert.deepEqual(lock.packages[record.artifactKey], record.artifact);
    assert.deepEqual(lock.snapshots[record.snapshotKey], record.snapshot);
  }
  assert.deepEqual(
    input.roots.map(({ name }) => name),
    ROOTS
  );
  const actualPaths = getImporterDependencyPaths(lock, 'node-forge@1.4.0');
  assert.deepEqual(actualPaths, input.forgePaths, 'Unsupported audio Forge path');
  const projected = structuredClone(lock);
  for (const record of input.roots)
    delete projected.importers[CANDIDATE_DIRECTORY].devDependencies[record.name];
  delete projected.packages['expo-audio@57.0.5'];
  delete projected.snapshots[input.roots[0].snapshotKey];
  assert.deepEqual(projected, baseline, 'Audio delta changed inherited lock entries');
  return { lock: projected, actualPaths };
}
function qualifyAudioInputView(root, projectedView) {
  const evidence = join(root, AUDIO_EVIDENCE);
  const inputBytes = readFileSync(join(evidence, 'audio-lock-inputs.json'));
  const input = JSON.parse(inputBytes);
  assert.equal(sha256(inputBytes), AUDIO_INPUT_SHA256, 'Audio input bytes changed');
  const baselinePath = join(evidence, 'controls/source-window-0541/before-pnpm-lock.yaml.txt');
  assert.equal(sha256(readFileSync(baselinePath)), BASELINE_SHA);
  const baseline = readLockFile(baselinePath);
  const patchInput = readAudioResetPatchInputs(root);
  const lockBytes = readFileSync(join(root, 'pnpm-lock.yaml'));
  if (!projectedView)
    assert.equal(sha256(lockBytes), patchInput.lockSha256, 'Unqualified audio lock');
  const manifest = JSON.parse(readFileSync(join(root, CANDIDATE_DIRECTORY, 'package.json')));
  const require = createRequire(join(root, CANDIDATE_DIRECTORY, 'package.json'));
  const installed = input.roots.map((record) => {
    const path = realpathSync(require.resolve(`${record.name}/package.json`));
    const location = relative(realpathSync(root), path);
    assert.ok(
      !location.startsWith('../') && !location.startsWith('/'),
      'Audio source escapes owner'
    );
    const bytes = readFileSync(path);
    assert.equal(sha256(bytes), record.manifestSha256);
    const packageManifest = JSON.parse(bytes);
    assert.equal(packageManifest.version, record.entry.specifier);
    assert.deepEqual(packageManifest.peerDependencies, record.peers);
    const archive = readFileSync(join(evidence, record.archive));
    verifyArtifactIntegrity(archive, record.artifact.resolution.integrity);
    assert.equal(sha256(archive), record.archiveSha256);
    return {
      name: record.name,
      version: packageManifest.version,
      path: location,
      sha256: sha256(bytes),
    };
  });
  const patch = qualifyAudioResetPatch(root, patchInput, input, projectedView);
  const fresh = JSON.parse(readFileSync(join(evidence, 'script-inventory.json')));
  assertArtifactInventory(fresh, artifactMap(patch.lock), input.lockSha256, {
    schemaVersion: 1,
    sourceRevision: input.sourceRevision,
    lockSha256: BASELINE_SHA,
    packages: baseline.packages,
  });
  assert.equal(fresh.baselineLockSha256, BASELINE_SHA);
  assert.equal(fresh.candidateLockSha256, input.lockSha256);
  assert.deepEqual(
    fresh.rows.map((row) => row.key),
    ['expo-audio@57.0.5']
  );
  assert.ok(fresh.complete && fresh.rows[0].archiveIntegrityVerified);
  assert.deepEqual(fresh.rows[0].hooks, {});
  assert.equal(fresh.rows[0].disposition, 'no-install-hooks');
  const projected = projectAudioLock(patch.lock, baseline, manifest, input);
  const inheritedManifest = structuredClone(manifest);
  for (const record of input.roots) delete inheritedManifest.devDependencies[record.name];
  return {
    inheritedManifest,
    inheritedWorkspace: patch.workspace,
    patchQualification: patch.qualification,
    ...projected,
    baselineLockSha256: BASELINE_SHA,
    archiveRows: fresh.rows,
    lockSha256: sha256(lockBytes),
    inputSha256: sha256(inputBytes),
    installed,
    scope:
      'Exact two-dev-root/one-artifact delta, authenticated iOS reset patch and eighteen finite Forge paths; inherited Audio/N1 inputs preserved. No native output or product acceptance.',
  };
}
const AUDIO_INPUT_SHA256 = 'f47a10918fafcfe5c0ebe471b96e291f1441c9b7dfc452ea7fadb9fff55cb980';

export function qualifyAudioInputs(root) {
  return qualifyAudioInputView(root);
}

export function qualifyAudioProjectedInputs(root, projectedView) {
  assert.ok(projectedView, 'Missing authenticated Audio projection view');
  return qualifyAudioInputView(root, projectedView);
}
