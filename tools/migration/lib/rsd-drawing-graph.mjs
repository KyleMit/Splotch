import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { readLockFile } from './lock-artifacts.mjs';
import { readPolicyYaml } from './topology-policy.mjs';
import { readSafeInsetsProjection } from './safe-insets-graph.mjs';
const INPUT_PATH = 'tools/migration/inputs/rsd-drawing-graph.json';
const INPUT_SHA256 = 'cd2ddc8a3349f527807dffd5314caa7736b6c38cdd2a3e33b798f762fcac983e';
export function projectRsdDrawingGraph(
  lock,
  workspace,
  baseline,
  beforeWorkspace,
  input,
  approved
) {
  assert.deepEqual(lock, approved, 'RSD actual approved graph changed');
  const projected = structuredClone(lock);
  const artifacts = Object.keys(projected.packages)
    .filter((key) => !Object.hasOwn(baseline.packages, key))
    .sort();
  assert.deepEqual(artifacts, [...input.addedArtifacts].sort(), 'Unexpected RSD artifacts');
  for (const key of artifacts) delete projected.packages[key];
  const snapshots = Object.keys(projected.snapshots).filter(
    (key) => !Object.hasOwn(baseline.snapshots, key)
  );
  assert.equal(snapshots.length, input.addedArtifacts.length, 'Unexpected RSD snapshots');
  for (const key of snapshots) {
    assert.ok(
      input.addedArtifacts.includes(key.replace(/\(.*$/, '')),
      'Unexpected RSD snapshot family'
    );
    delete projected.snapshots[key];
  }
  const entry = projected.importers[CANDIDATE_DIRECTORY].devDependencies['react-strict-dom'];
  assert.equal(entry.specifier, '0.0.54');
  assert.ok(entry.version.startsWith('0.0.54(patch_hash='));
  delete projected.importers[CANDIDATE_DIRECTORY].devDependencies['react-strict-dom'];
  const policy = structuredClone(workspace);
  for (const [key, value] of Object.entries(input.overrides)) {
    assert.equal(projected.overrides[key], value, 'RSD lock override changed');
    assert.equal(policy.overrides[key], value, 'RSD workspace override changed');
    delete projected.overrides[key];
    delete policy.overrides[key];
  }
  for (const [key, patch] of Object.entries(input.patches)) {
    assert.equal(
      projected.patchedDependencies[key],
      patch.sha256,
      'RSD lock declaration patch changed'
    );
    assert.equal(
      policy.patchedDependencies[key],
      patch.path,
      'RSD workspace declaration patch changed'
    );
    delete projected.patchedDependencies[key];
    delete policy.patchedDependencies[key];
  }
  assert.deepEqual(projected, baseline, 'Unexpected RSD inherited lock delta');
  assert.deepEqual(policy, beforeWorkspace, 'Unexpected RSD inherited workspace delta');
  return { lock: projected, workspace: policy };
}
export function reviewedRsdArchiveRows(input, reuse, rootReceipt) {
  assert.deepEqual(
    reuse.rows.map(({ key }) => key).sort(),
    [...input.addedArtifacts].sort(),
    'RSD reviewed archive membership changed'
  );
  return reuse.rows.map((record) => {
    const row = record.priorClosedRow;
    assert.equal(record.key, row.key, 'RSD archive identity changed');
    assert.equal(record.integrity, row.integrity, 'RSD archive integrity changed');
    assert.equal(record.archiveSha256, row.archiveSha256, 'RSD archive bytes changed');
    assert.equal(
      record.metadataAndArchiveRowsEqualClosedManifest,
      true,
      'RSD archive provenance unverified'
    );
    assert.equal(
      record.closedRootArchiveReceipt.sha256,
      input.rootArchiveApproval.sha256,
      'RSD Root archive receipt changed'
    );
    assert.equal(
      record.priorManifest.sha256,
      rootReceipt.manifestSha256,
      'RSD prior archive manifest changed'
    );
    const closed = rootReceipt.newArchives.find(({ key }) => key === row.key);
    assert.ok(closed, 'RSD archive lacks Root review');
    assert.equal(closed.archiveSha256, row.archiveSha256, 'RSD Root archive bytes changed');
    assert.deepEqual(closed.hooks, row.hooks, 'RSD Root archive hooks changed');
    assert.equal(closed.disposition, row.disposition, 'RSD Root archive disposition changed');
    if (Object.keys(row.hooks).length) {
      assert.equal(row.key, 'styleq@0.2.1', 'Unreviewed RSD publication hook');
      assert.deepEqual(
        row.hooks,
        { prepare: 'npm run test && npm run build' },
        'Unreviewed RSD prepare command'
      );
      assert.equal(row.disposition, 'registry-prepare-only');
      assert.equal(
        row.prepareDisposition,
        'recorded; exact registry publication only; pnpm 11.22.0 runPostinstallHooks omits prepare'
      );
      return {
        ...row,
        disposition: 'registry-publication-only-no-execution-needed',
        rootReviewed: true,
      };
    }
    assert.equal(row.disposition, 'no-install-hooks');
    return structuredClone(row);
  });
}
export function readRsdDrawingProjection(root, inherited, authenticate) {
  if (!existsSync(join(root, INPUT_PATH))) return null;
  const input = JSON.parse(authenticate(root, { path: INPUT_PATH, sha256: INPUT_SHA256 }));
  assert.equal(input.schemaVersion, 1);
  const safeInsets = readSafeInsetsProjection(root, authenticate);
  for (const row of input.actualFiles) {
    const prior = safeInsets?.priorActualFiles[row.path] ?? row;
    assert.equal(prior.sha256, row.sha256, 'Safe-insets inherited RSD source changed');
    authenticate(root, prior);
  }
  for (const row of [
    input.approvedLock,
    input.archiveReuse,
    input.rootApproval,
    input.rootArchiveApproval,
  ])
    authenticate(root, row);
  for (const [name, row] of Object.entries(input.baselineFiles)) {
    const old = inherited.files.find((value) => value.path === name);
    assert.ok(old, 'Unexpected RSD inherited source owner');
    assert.equal(row.sha256, old.sha256, 'RSD inherited source checksum changed');
    authenticate(root, row);
  }
  const baseline = readLockFile(join(root, input.baselineFiles['pnpm-lock.yaml'].path));
  const before = readPolicyYaml(join(root, input.baselineFiles['pnpm-workspace.yaml'].path));
  const projected = projectRsdDrawingGraph(
    safeInsets?.lock ?? readLockFile(join(root, 'pnpm-lock.yaml')),
    readPolicyYaml(join(root, 'pnpm-workspace.yaml')),
    baseline,
    before,
    input,
    readLockFile(join(root, input.approvedLock.path))
  );
  const archives = reviewedRsdArchiveRows(
    input,
    JSON.parse(authenticate(root, input.archiveReuse)),
    JSON.parse(authenticate(root, input.rootArchiveApproval))
  );
  return {
    ...projected,
    archiveRows: [...archives, ...(safeInsets?.archiveRows ?? [])],
    currentActualFiles: safeInsets?.currentActualFiles ?? input.actualFiles,
    safeInsets,
    input,
    inputPath: INPUT_PATH,
    inputSHA256: INPUT_SHA256,
  };
}
