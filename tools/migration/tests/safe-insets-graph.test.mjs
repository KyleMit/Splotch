import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJointNativeProjection } from '../lib/native-joint-graph.mjs';
import { projectSafeInsetsGraph, reviewedSafeInsetsArchiveRow } from '../lib/safe-insets-graph.mjs';
import { copyJointGraphFixture } from './joint-graph-fixtures.mjs';

const NAME = 'react-native-safe-area-context';
const KEY = `${NAME}@5.7.0`;
const IMPORTER = 'experiments/native-architecture';

function fixture() {
  const prior = {
    lockfileVersion: '9.0',
    importers: {
      '.': { dependencies: { shipping: { specifier: '1.0.0', version: '1.0.0' } } },
      [IMPORTER]: { devDependencies: { react: { specifier: '19.2.3', version: '19.2.3' } } },
    },
    packages: { 'react@19.2.3': { resolution: { integrity: 'sha512-react' } } },
    snapshots: { 'react@19.2.3': {} },
  };
  const workspace = { packages: [IMPORTER], allowBuilds: { esbuild: false } };
  const importerEntry = { specifier: '5.7.0', version: '5.7.0(react@19.2.3)' };
  const packageEntry = {
    resolution: { integrity: 'sha512-safe-insets' },
    peerDependencies: { react: '*', 'react-native': '*' },
  };
  const snapshotEntry = { dependencies: { react: '19.2.3' } };
  const snapshotKey = `${NAME}@${importerEntry.version}`;
  const input = {
    delta: {
      name: NAME,
      version: '5.7.0',
      artifactKey: KEY,
      snapshotKey,
      importerEntry,
      packageEntry,
      snapshotEntry,
    },
  };
  const lock = structuredClone(prior);
  lock.importers[IMPORTER].devDependencies[NAME] = structuredClone(importerEntry);
  lock.packages[KEY] = structuredClone(packageEntry);
  lock.snapshots[snapshotKey] = structuredClone(snapshotEntry);
  return {
    lock,
    workspace,
    prior,
    priorWorkspace: structuredClone(workspace),
    input,
    approved: structuredClone(lock),
  };
}

function project(value) {
  return projectSafeInsetsGraph(
    value.lock,
    value.workspace,
    value.prior,
    value.priorWorkspace,
    value.input,
    value.approved
  );
}

it('removes exactly the safe-insets importer, package and peer snapshot', () => {
  const value = fixture();
  const before = structuredClone(value);
  expect(project(value)).toEqual({ lock: value.prior, workspace: value.priorWorkspace });
  expect(value).toEqual(before);
});

for (const [name, mutate] of [
  [
    'inherited package mutation',
    (value) => {
      value.lock.packages['react@19.2.3'].resolution.integrity = 'foreign';
    },
  ],
  [
    'new package integrity mutation',
    (value) => {
      value.lock.packages[KEY].resolution.integrity = 'foreign';
    },
  ],
  [
    'new package peer mutation',
    (value) => {
      value.lock.packages[KEY].peerDependencies.react = '^20';
    },
  ],
  [
    'new snapshot peer mutation',
    (value) => {
      value.lock.snapshots[value.input.delta.snapshotKey].dependencies.react = '20.0.0';
    },
  ],
  [
    'private importer mutation',
    (value) => {
      value.lock.importers[IMPORTER].devDependencies[NAME].specifier = '^5.7.0';
    },
  ],
  [
    'shipping root importer mutation',
    (value) => {
      value.lock.importers['.'].dependencies.foreign = { specifier: '1', version: '1' };
    },
  ],
  [
    'extra package',
    (value) => {
      value.lock.packages['foreign@1.0.0'] = { resolution: { integrity: 'foreign' } };
    },
  ],
  [
    'extra snapshot',
    (value) => {
      value.lock.snapshots['foreign@1.0.0'] = {};
    },
  ],
  [
    'policy relaxation',
    (value) => {
      value.workspace.allowBuilds.esbuild = true;
    },
  ],
]) {
  it(`refuses ${name} even when the actual graph is supplied as approved`, () => {
    const value = fixture();
    expect(project(value)).toEqual({ lock: value.prior, workspace: value.priorWorkspace });
    mutate(value);
    value.approved = structuredClone(value.lock);
    expect(() => project(value)).toThrow();
  });
}

it('refuses a graph that differs from its approved lock', () => {
  const value = fixture();
  expect(project(value)).toEqual({ lock: value.prior, workspace: value.priorWorkspace });
  value.lock.packages[KEY].resolution.integrity = 'foreign';
  expect(() => project(value)).toThrow('Safe-insets actual approved graph changed');
});

function archiveFixture() {
  const integrity = 'sha512-c2FmZQ==';
  const sha256 = 'a'.repeat(64);
  const metadataSha256 = 'b'.repeat(64);
  const hooks = { prepare: 'bob build' };
  const prepareDisposition = 'recorded registry publication only';
  const input = {
    delta: { packageEntry: { resolution: { integrity } } },
    archive: {
      name: NAME,
      version: '5.7.0',
      key: KEY,
      integrity,
      sha256,
      metadataSha256,
      bytes: 100,
      members: 1,
      expandedBytes: 50,
      hooks,
      prepareDisposition,
    },
  };
  const row = {
    key: KEY,
    name: NAME,
    version: '5.7.0',
    integrity,
    registryIntegrity: integrity,
    archiveSha256: sha256,
    metadataSha256,
    archiveBytes: 100,
    memberCount: 1,
    archiveIntegrityVerified: true,
    archiveIdentityVerified: true,
    rootHookFiles: [],
    rootBindingGyp: false,
    hooks: structuredClone(hooks),
    metadataHooks: structuredClone(hooks),
    prepareDisposition,
    tarball:
      'https://registry.npmjs.org/react-native-safe-area-context/-/react-native-safe-area-context-5.7.0.tgz',
  };
  return {
    input,
    inventory: {
      schemaVersion: 1,
      complete: true,
      freshArchiveAudit: false,
      inspectedArtifacts: 1,
      rows: [row],
    },
    admission: {
      releasedArchiveSHA256: sha256,
      releasedIntegrity: integrity,
      publicMetadataSHA256: metadataSha256,
      license: 'MIT',
      dependencies: null,
      publicPublicationRootTool: '4079ed/0',
    },
    publication: {
      status: 'PASS_PUBLICATION_READ',
      archive: { sha256, bytes: 100 },
      metadata: { sha256: metadataSha256 },
      integrity,
      regularMembers: 1,
      expandedBytes: 50,
      packageLicense: 'MIT',
      dependencies: null,
      scripts: { prepare: 'bob build' },
    },
    members: [{ path: 'package/package.json', bytes: 50, sha256 }],
  };
}

it('classifies authenticated publisher prepare as registry publication only', () => {
  const value = archiveFixture();
  expect(
    reviewedSafeInsetsArchiveRow(
      value.input,
      value.inventory,
      value.admission,
      value.publication,
      value.members
    )
  ).toMatchObject({
    hooks: { prepare: 'bob build' },
    disposition: 'registry-publication-only-no-execution-needed',
    rootReviewed: true,
  });
  expect(value.inventory.rows[0]).not.toHaveProperty('rootReviewed');
});

for (const [name, mutate] of [
  [
    'archive size',
    (value) => {
      value.publication.archive.bytes += 1;
    },
  ],
  [
    'archive member count',
    (value) => {
      value.publication.regularMembers += 1;
    },
  ],
  [
    'archive hash',
    (value) => {
      value.inventory.rows[0].archiveSha256 = 'b'.repeat(64);
    },
  ],
  [
    'install hook',
    (value) => {
      value.inventory.rows[0].hooks.install = 'foreign';
    },
  ],
  [
    'metadata hook',
    (value) => {
      value.inventory.rows[0].metadataHooks.prepare = 'foreign';
    },
  ],
  [
    'default binding hook',
    (value) => {
      value.inventory.rows[0].rootBindingGyp = true;
    },
  ],
]) {
  it(`refuses a changed safe-insets ${name}`, () => {
    const value = archiveFixture();
    expect(() =>
      reviewedSafeInsetsArchiveRow(
        value.input,
        value.inventory,
        value.admission,
        value.publication,
        value.members
      )
    ).not.toThrow();
    mutate(value);
    expect(() =>
      reviewedSafeInsetsArchiveRow(
        value.input,
        value.inventory,
        value.admission,
        value.publication,
        value.members
      )
    ).toThrow();
  });
}

for (const subject of [
  'input',
  'rootApproval',
  'archiveInventory',
  'publication',
  'archiveMemberManifest',
]) {
  it(`refuses changed authenticated safe-insets ${subject} evidence through the actual joint reader`, () => {
    const root = join(import.meta.dirname, '../../..');
    const inputPath = 'tools/migration/inputs/safe-insets-graph.json';
    const input = JSON.parse(readFileSync(join(root, inputPath)));
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'splotch-safe-insets-'));
    try {
      copyJointGraphFixture(root, fixtureRoot);
      const name = subject === 'input' ? inputPath : input[subject].path;
      const target = join(fixtureRoot, name);
      const bytes = readFileSync(target);
      expect(() => readJointNativeProjection(fixtureRoot)).not.toThrow();
      writeFileSync(target, Buffer.concat([bytes, Buffer.from(' ')]));
      expect(() => readJointNativeProjection(fixtureRoot)).toThrow(
        `Unqualified joint input: ${name}`
      );
      writeFileSync(target, bytes);
      expect(() => readJointNativeProjection(fixtureRoot)).not.toThrow();
    } finally {
      rmSync(fixtureRoot, { recursive: true });
    }
  });
}
