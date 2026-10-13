import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { readLockFile } from './lock-artifacts.mjs';
import { readPolicyYaml } from './topology-policy.mjs';

const INPUT_PATH = 'tools/migration/inputs/safe-insets-graph.json';
const INPUT_SHA256 = '10117c650c81e8c4793437f9cb84e342016fda4ad45bcb3226173d2023d1f2b4';
const PACKAGE_NAME = 'react-native-safe-area-context';
const PACKAGE_VERSION = '5.7.0';
const ARTIFACT_KEY = `${PACKAGE_NAME}@${PACKAGE_VERSION}`;
const CURRENT_PATHS = [
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'package.json',
  `${CANDIDATE_DIRECTORY}/package.json`,
  `${CANDIDATE_DIRECTORY}/alignment.json`,
];

export function projectSafeInsetsGraph(lock, workspace, prior, priorWorkspace, input, approved) {
  assert.deepEqual(lock, approved, 'Safe-insets actual approved graph changed');
  const delta = input.delta;
  assert.equal(delta.name, PACKAGE_NAME);
  assert.equal(delta.version, PACKAGE_VERSION);
  assert.equal(delta.artifactKey, ARTIFACT_KEY);
  assert.deepEqual(delta.importerEntry, {
    specifier: PACKAGE_VERSION,
    version: delta.importerEntry.version,
  });
  assert.equal(delta.snapshotKey, `${PACKAGE_NAME}@${delta.importerEntry.version}`);
  assert.ok(delta.importerEntry.version.startsWith(`${PACKAGE_VERSION}(`));
  const projected = structuredClone(lock);
  const addedPackages = Object.keys(projected.packages).filter(
    (key) => !Object.hasOwn(prior.packages, key)
  );
  const addedSnapshots = Object.keys(projected.snapshots).filter(
    (key) => !Object.hasOwn(prior.snapshots, key)
  );
  assert.deepEqual(addedPackages, [ARTIFACT_KEY], 'Unexpected safe-insets artifacts');
  assert.deepEqual(addedSnapshots, [delta.snapshotKey], 'Unexpected safe-insets snapshots');
  const dependencies = projected.importers[CANDIDATE_DIRECTORY].devDependencies;
  assert.deepEqual(dependencies[PACKAGE_NAME], delta.importerEntry, 'Safe-insets importer changed');
  assert.deepEqual(
    projected.packages[ARTIFACT_KEY],
    delta.packageEntry,
    'Safe-insets package changed'
  );
  assert.deepEqual(
    projected.snapshots[delta.snapshotKey],
    delta.snapshotEntry,
    'Safe-insets peer snapshot changed'
  );
  delete dependencies[PACKAGE_NAME];
  delete projected.packages[ARTIFACT_KEY];
  delete projected.snapshots[delta.snapshotKey];
  assert.deepEqual(projected, prior, 'Unexpected safe-insets inherited lock delta');
  assert.deepEqual(workspace, priorWorkspace, 'Unexpected safe-insets workspace delta');
  return { lock: projected, workspace: structuredClone(workspace) };
}

function projectedManifest(current, prior, group, label) {
  const projected = structuredClone(current);
  assert.equal(
    projected[group][PACKAGE_NAME],
    PACKAGE_VERSION,
    `${label} safe-insets version changed`
  );
  delete projected[group][PACKAGE_NAME];
  assert.deepEqual(projected, prior, `Unexpected safe-insets ${label} delta`);
}

export function reviewedSafeInsetsArchiveRow(input, inventory, admission, publication, members) {
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.complete, true, 'Incomplete safe-insets archive inventory');
  assert.equal(inventory.freshArchiveAudit, false);
  assert.equal(inventory.inspectedArtifacts, 1);
  assert.equal(inventory.rows.length, 1);
  const row = inventory.rows[0];
  const expected = input.archive;
  assert.equal(expected.name, PACKAGE_NAME);
  assert.equal(expected.version, PACKAGE_VERSION);
  assert.equal(expected.key, ARTIFACT_KEY);
  assert.match(expected.sha256, /^[a-f0-9]{64}$/);
  assert.match(expected.metadataSha256, /^[a-f0-9]{64}$/);
  assert.match(expected.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/);
  assert.ok(Number.isSafeInteger(expected.bytes) && expected.bytes > 0);
  assert.ok(Number.isSafeInteger(expected.members) && expected.members > 0);
  assert.ok(Number.isSafeInteger(expected.expandedBytes) && expected.expandedBytes > 0);
  assert.equal(row.key, ARTIFACT_KEY);
  assert.equal(row.name, PACKAGE_NAME);
  assert.equal(row.version, PACKAGE_VERSION);
  assert.equal(row.integrity, input.delta.packageEntry.resolution.integrity);
  assert.equal(row.integrity, expected.integrity);
  assert.equal(row.registryIntegrity, expected.integrity);
  assert.equal(row.archiveSha256, expected.sha256);
  assert.equal(row.metadataSha256, expected.metadataSha256);
  assert.equal(row.archiveBytes, expected.bytes);
  assert.equal(row.memberCount, expected.members);
  assert.equal(row.archiveIntegrityVerified, true);
  assert.equal(row.archiveIdentityVerified, true);
  assert.deepEqual(row.rootHookFiles, []);
  assert.equal(row.rootBindingGyp, false);
  assert.deepEqual(row.hooks, expected.hooks);
  assert.deepEqual(row.metadataHooks, expected.hooks);
  assert.deepEqual(Object.keys(row.hooks), ['prepare']);
  assert.equal(row.hooks.prepare, 'bob build');
  assert.equal(row.prepareDisposition, expected.prepareDisposition);
  assert.equal(admission.releasedArchiveSHA256, expected.sha256);
  assert.equal(admission.releasedIntegrity, expected.integrity);
  assert.equal(admission.publicMetadataSHA256, expected.metadataSha256);
  assert.equal(admission.license, 'MIT');
  assert.equal(admission.dependencies, null);
  assert.equal(admission.publicPublicationRootTool, '4079ed/0');
  assert.equal(publication.status, 'PASS_PUBLICATION_READ');
  assert.equal(publication.archive.sha256, expected.sha256);
  assert.equal(publication.archive.bytes, expected.bytes);
  assert.equal(publication.metadata.sha256, expected.metadataSha256);
  assert.equal(publication.integrity, expected.integrity);
  assert.equal(publication.regularMembers, expected.members);
  assert.equal(publication.expandedBytes, expected.expandedBytes);
  assert.equal(publication.packageLicense, 'MIT');
  assert.equal(publication.dependencies, null);
  assert.equal(publication.scripts.prepare, 'bob build');
  assert.equal(members.length, expected.members);
  assert.equal(new Set(members.map(({ path }) => path)).size, expected.members);
  for (const member of members) {
    assert.ok(member.path.startsWith('package/') && !member.path.split('/').includes('..'));
    assert.match(member.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(member.bytes) && member.bytes >= 0);
    assert.notEqual(member.path, 'package/binding.gyp');
    assert.ok(!member.path.startsWith('package/.hooks/'));
  }
  assert.equal(
    members.reduce((sum, { bytes }) => sum + bytes, 0),
    expected.expandedBytes
  );
  assert.equal(
    row.tarball,
    'https://registry.npmjs.org/react-native-safe-area-context/-/react-native-safe-area-context-5.7.0.tgz'
  );
  return {
    ...structuredClone(row),
    disposition: 'registry-publication-only-no-execution-needed',
    rootReviewed: true,
  };
}

export function readSafeInsetsProjection(root, authenticate) {
  if (!existsSync(join(root, INPUT_PATH))) return null;
  const input = JSON.parse(authenticate(root, { path: INPUT_PATH, sha256: INPUT_SHA256 }));
  assert.equal(input.schemaVersion, 1);
  assert.deepEqual(input.actualFiles.map(({ path }) => path).sort(), [...CURRENT_PATHS].sort());
  assert.deepEqual(Object.keys(input.priorActualFiles).sort(), [...CURRENT_PATHS].sort());
  const actual = new Map(
    input.actualFiles.map((record) => [record.path, authenticate(root, record)])
  );
  const prior = new Map(
    Object.entries(input.priorActualFiles).map(([path, record]) => [
      path,
      authenticate(root, record),
    ])
  );
  for (const record of [input.approvedLock, input.priorApprovedLock, input.wholeMetadata])
    authenticate(root, record);
  const approval = JSON.parse(authenticate(root, input.rootApproval));
  assert.equal(approval.owner, '/root');
  assert.equal(approval.approvedActualLockSHA256, input.approvedLock.sha256);
  assert.equal(approval.approvedWholeMetadataSHA256, input.wholeMetadata.sha256);
  assert.equal(
    approval.workspaceSHA256,
    input.actualFiles.find(({ path }) => path === 'pnpm-workspace.yaml').sha256
  );
  assert.deepEqual(approval.newArtifactIdentities, [ARTIFACT_KEY]);
  assert.equal(approval.allExisting1526FullPackageObjectsUnchanged, true);
  assert.equal(approval.everyExistingSnapshotUnchanged, true);
  assert.equal(approval.shippingRootImporterDeepEqual, true);
  assert.equal(approval.shippingTransitiveClosureUnchanged, true);
  assert.equal(input.priorActualFiles['pnpm-lock.yaml'].sha256, input.priorApprovedLock.sha256);
  assert.equal(
    input.actualFiles.find(({ path }) => path === 'pnpm-lock.yaml').sha256,
    input.approvedLock.sha256
  );
  for (const path of ['package.json', 'pnpm-workspace.yaml'])
    assert.ok(
      actual.get(path).equals(prior.get(path)),
      `Unexpected safe-insets source delta: ${path}`
    );
  for (const [path, group, label] of [
    [`${CANDIDATE_DIRECTORY}/package.json`, 'devDependencies', 'manifest'],
    [`${CANDIDATE_DIRECTORY}/alignment.json`, 'directPackages', 'alignment'],
  ])
    projectedManifest(JSON.parse(actual.get(path)), JSON.parse(prior.get(path)), group, label);
  const projected = projectSafeInsetsGraph(
    readLockFile(join(root, 'pnpm-lock.yaml')),
    readPolicyYaml(join(root, 'pnpm-workspace.yaml')),
    readLockFile(join(root, input.priorApprovedLock.path)),
    readPolicyYaml(join(root, input.priorActualFiles['pnpm-workspace.yaml'].path)),
    input,
    readLockFile(join(root, input.approvedLock.path))
  );
  const inventory = JSON.parse(authenticate(root, input.archiveInventory));
  const admission = JSON.parse(authenticate(root, input.archiveAdmission));
  const publication = JSON.parse(authenticate(root, input.publication));
  const members = JSON.parse(authenticate(root, input.archiveMemberManifest));
  const packageManifest = JSON.parse(authenticate(root, input.packageManifest));
  assert.equal(packageManifest.name, PACKAGE_NAME);
  assert.equal(packageManifest.version, PACKAGE_VERSION);
  assert.equal(packageManifest.license, 'MIT');
  assert.equal(packageManifest.dependencies ?? null, null);
  assert.deepEqual(packageManifest.peerDependencies, input.delta.packageEntry.peerDependencies);
  assert.equal(packageManifest.scripts.prepare, 'bob build');
  return {
    ...projected,
    input,
    inputPath: INPUT_PATH,
    inputSHA256: INPUT_SHA256,
    currentActualFiles: input.actualFiles,
    priorActualFiles: input.priorActualFiles,
    archiveRows: [reviewedSafeInsetsArchiveRow(input, inventory, admission, publication, members)],
  };
}
