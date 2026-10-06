import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { c } from 'tar';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inspectArchive,
  inspectRegistryArtifact,
  verifyArtifactIntegrity,
} from '../lib/archive-inventory.mjs';
import {
  artifactMap,
  changedArtifacts,
  getImporterArtifactKeys,
  readLockFile,
} from '../lib/lock-artifacts.mjs';
import {
  assertArtifactInventory,
  assertCandidateArtifactRecord,
  assertCandidateArchiveInventory,
  assertProductionClosure,
} from '../lib/topology-policy.mjs';

const fixtureDirectories = [];
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'splotch-inventory-test-'));
  fixtureDirectories.push(path);
  return path;
}
afterEach(() => {
  fixtureDirectories.splice(0).forEach((path) => rmSync(path, { recursive: true }));
  vi.unstubAllGlobals();
});

function lockFixture() {
  return {
    importers: {
      '.': { dependencies: { shared: { version: '1.0.0' } } },
      'experiments/native-architecture': {
        devDependencies: { alias: { version: 'probe@2.0.0(shared@1.0.0)' } },
      },
    },
    packages: {
      'shared@1.0.0': { resolution: { integrity: 'sha512-shared' } },
      'probe@2.0.0': { resolution: { integrity: 'sha512-probe' } },
      'optional@1.0.0': { resolution: { integrity: 'sha512-optional' } },
    },
    snapshots: {
      'shared@1.0.0': {},
      'probe@2.0.0(shared@1.0.0)': {
        dependencies: { shared: '1.0.0' },
        optionalDependencies: { optional: '1.0.0' },
      },
      'optional@1.0.0': {},
    },
  };
}

function baselineFixture() {
  const packages = structuredClone(lockFixture().packages);
  delete packages['probe@2.0.0'];
  return {
    schemaVersion: 1,
    sourceRevision: 'a'.repeat(40),
    lockSha256: 'baseline-lock',
    packages,
  };
}

async function archiveFixture(manifest, bindingGyp = false, rootHook = null) {
  const root = directory();
  mkdirSync(join(root, 'package'));
  writeFileSync(
    join(root, 'package/package.json'),
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest)
  );
  if (bindingGyp === 'link') symlinkSync('package.json', join(root, 'package/binding.gyp'));
  else if (bindingGyp) writeFileSync(join(root, 'package/binding.gyp'), '{}');
  if (rootHook === 'backslash') writeFileSync(join(root, 'package/.hooks\\install'), 'hook');
  else if (rootHook) {
    mkdirSync(join(root, 'package/.hooks'));
    if (rootHook === 'link') symlinkSync('../package.json', join(root, 'package/.hooks/install'));
    else writeFileSync(join(root, 'package/.hooks/install'), rootHook);
  }
  const chunks = [];
  for await (const chunk of c({ cwd: root, gzip: true }, ['package'])) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function registryArchiveFixture(manifest, bindingGyp = false, rootHook = null) {
  const bytes = await archiveFixture(manifest, bindingGyp, rootHook);
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const tarball = 'https://registry.npmjs.org/probe/-/probe-2.0.0.tgz';
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: { '2.0.0': { dist: { integrity, tarball } } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      })
  );
  return inspectRegistryArtifact({
    key: 'probe@2.0.0',
    name: 'probe',
    version: '2.0.0',
    integrity,
  });
}

function inventoryFromRow(row) {
  const lock = lockFixture();
  lock.packages[row.key].resolution.integrity = row.integrity;
  return {
    lock,
    inventory: {
      schemaVersion: 1,
      complete: true,
      candidateLockSha256: 'lock',
      baselineLockSha256: 'baseline-lock',
      inspectedArtifacts: 1,
      selectedArtifacts: [{ key: row.key, integrity: row.integrity }],
      rows: [row],
    },
  };
}

function candidateInventoryFixture() {
  return inventoryFromRow({
    key: 'probe@2.0.0',
    name: 'probe',
    version: '2.0.0',
    integrity: 'sha512-probe',
    tarball: 'https://registry.npmjs.org/probe/-/probe-2.0.0.tgz',
    hooks: {},
    rootBindingGyp: false,
    rootHookFiles: [],
    archiveIntegrityVerified: true,
    disposition: 'no-install-hooks',
  });
}

function addArtifact(lock, name) {
  lock.packages[`${name}@1.0.0`] = { resolution: { integrity: `sha512-${name}` } };
  lock.snapshots[`${name}@1.0.0`] = {};
}

describe('lock artifact trust and graph boundaries', () => {
  it('follows alias/peer snapshots and optional dependencies without making dev packages production', () => {
    const lock = lockFixture();
    expect([...getImporterArtifactKeys(lock, '.')]).toEqual(['shared@1.0.0']);
    expect(
      [...getImporterArtifactKeys(lock, 'experiments/native-architecture', true)].sort()
    ).toEqual(['optional@1.0.0', 'probe@2.0.0', 'shared@1.0.0']);
    expect(() => assertProductionClosure(lock, ['shared@1.0.0'])).not.toThrow();
    lock.importers['.'].dependencies.probe = { version: '2.0.0(shared@1.0.0)' };
    expect(() => assertProductionClosure(lock, ['shared@1.0.0'])).toThrow('entered the shipping');
  });

  it('binds the complete sorted candidate-only record to the exact lock', () => {
    const lock = lockFixture();
    const record = {
      schemaVersion: 1,
      lockSha256: 'lock',
      artifacts: [
        { key: 'optional@1.0.0', name: 'optional', version: '1.0.0' },
        { key: 'probe@2.0.0', name: 'probe', version: '2.0.0' },
      ],
    };
    expect(() => assertCandidateArtifactRecord(record, lock, 'lock')).not.toThrow();
    expect(() => assertCandidateArtifactRecord(record, lock, 'other-lock')).toThrow(
      'does not match'
    );
    record.artifacts.pop();
    expect(() => assertCandidateArtifactRecord(record, lock, 'lock')).toThrow(
      'incomplete or changed'
    );
  });

  it('selects a changed integrity and rejects missing/unsupported source identities', () => {
    const before = lockFixture();
    const after = structuredClone(before);
    after.packages['probe@2.0.0'].resolution.integrity = 'sha512-changed';
    expect(changedArtifacts(before, after).map((artifact) => artifact.key)).toEqual([
      'probe@2.0.0',
    ]);
    delete after.packages['probe@2.0.0'].resolution.integrity;
    expect(() => artifactMap(after)).toThrow('Missing integrity');
    after.packages['probe@2.0.0'].resolution = {
      integrity: 'sha512-x',
      tarball: 'https://example.test/probe.tgz',
    };
    expect(() => artifactMap(after)).toThrow('Nonregistry artifact');
    after.importers['experiments/native-architecture'].devDependencies.alias.version =
      'workspace:*';
    expect(() => getImporterArtifactKeys(after, 'experiments/native-architecture', true)).toThrow(
      'Workspace dependency'
    );
  });

  it('rejects malformed lock YAML and a missing snapshot instead of accepting a partial graph', () => {
    const path = join(directory(), 'lock.yaml');
    writeFileSync(path, 'lockfileVersion: 9.0\nlockfileVersion: 9.0\n');
    expect(() => readLockFile(path)).toThrow('Invalid lock YAML');
    const lock = lockFixture();
    delete lock.snapshots['optional@1.0.0'];
    expect(() => getImporterArtifactKeys(lock, 'experiments/native-architecture', true)).toThrow(
      'Unresolved lock snapshot'
    );
  });
});

describe('all-archive lifecycle inventory', () => {
  it.each([
    { hooks: {}, bindingGyp: true, rootHook: null, error: 'Unreviewed default install' },
    {
      hooks: { install: 'node install.cjs' },
      bindingGyp: false,
      rootHook: null,
      error: 'Unreviewed install hook',
    },
    { hooks: {}, bindingGyp: false, rootHook: 'node hook.cjs', error: 'Unreviewed root .hooks' },
  ])(
    'reviews archive capability with omitted abbreviated metadata: $error',
    async ({ hooks, bindingGyp, rootHook, error }) => {
      const plain = await registryArchiveFixture({ name: 'probe', version: '2.0.0' });
      expect(plain.hasInstallScript).toBeNull();
      expect(plain.metadataHooks).toEqual({});
      expect(plain).not.toHaveProperty('metadataContradiction');
      expect(plain.disposition).toBe('no-install-hooks');
      const positive = inventoryFromRow(plain);
      expect(() =>
        assertCandidateArchiveInventory(positive.inventory, positive.lock, baselineFixture())
      ).not.toThrow();
      const row = await registryArchiveFixture(
        { name: 'probe', version: '2.0.0', scripts: hooks },
        bindingGyp,
        rootHook
      );
      expect(row.archiveIntegrityVerified).toBe(true);
      expect(row.hasInstallScript).toBeNull();
      expect(row.hooks).toEqual(hooks);
      expect(row.rootBindingGyp).toBe(bindingGyp);
      expect(row.rootHookFiles).toEqual(rootHook ? ['.hooks/install'] : []);
      expect(row.disposition).toBe('review-required');
      const negative = inventoryFromRow(row);
      expect(() =>
        assertCandidateArchiveInventory(negative.inventory, negative.lock, baselineFixture())
      ).toThrow(error);
      expect(() =>
        assertArtifactInventory(
          negative.inventory,
          artifactMap(negative.lock),
          'lock',
          baselineFixture()
        )
      ).toThrow(error);
    }
  );

  it('requires publisher prepare review when abbreviated metadata omits scripts', async () => {
    const row = await registryArchiveFixture({
      name: 'probe',
      version: '2.0.0',
      scripts: { prepare: 'node publish.cjs' },
    });
    expect(row.metadataHooks).toEqual({});
    expect(row.hooks).toEqual({ prepare: 'node publish.cjs' });
    expect(row.disposition).toBe('review-required');
    const { inventory, lock } = inventoryFromRow(row);
    row.disposition = 'registry-publication-only-no-execution-needed';
    row.rootReviewed = true;
    expect(() => assertCandidateArchiveInventory(inventory, lock, baselineFixture())).not.toThrow();
    expect(() =>
      assertArtifactInventory(inventory, artifactMap(lock), 'lock', baselineFixture())
    ).not.toThrow();
    row.rootReviewed = false;
    expect(() => assertCandidateArchiveInventory(inventory, lock, baselineFixture())).toThrow(
      'needs review'
    );
    expect(() =>
      assertArtifactInventory(inventory, artifactMap(lock), 'lock', baselineFixture())
    ).toThrow('needs review');
  });

  it('rejects ambiguous default-install and root-hook archive links', async () => {
    const manifest = { name: 'probe', version: '2.0.0' };
    expect(
      (await inspectArchive(await archiveFixture(manifest, false, 'backslash'))).rootHookFiles
    ).toEqual(['.hooks\\install']);
    await expect(inspectArchive(await archiveFixture(manifest, 'link'))).rejects.toThrow(
      'binding.gyp link'
    );
    await expect(inspectArchive(await archiveFixture(manifest, false, 'link'))).rejects.toThrow(
      'Ambiguous root .hooks'
    );
  });

  it('rejects corrupt/unsupported integrity and malformed archive JSON/hooks', async () => {
    const bytes = await archiveFixture({
      name: 'probe',
      version: '2.0.0',
      scripts: { prepare: 'node publish.cjs' },
    });
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    expect(() => verifyArtifactIntegrity(bytes, integrity)).not.toThrow();
    expect(() =>
      verifyArtifactIntegrity(Buffer.concat([bytes, Buffer.from('corrupt')]), integrity)
    ).toThrow('integrity mismatch');
    expect(() => verifyArtifactIntegrity(bytes, 'md5-x')).toThrow('Unsupported integrity');
    expect((await inspectArchive(bytes)).hooks).toEqual({ prepare: 'node publish.cjs' });
    await expect(inspectArchive(await archiveFixture('{malformed'))).rejects.toThrow();
    await expect(inspectArchive(await archiveFixture({ scripts: { install: 1 } }))).rejects.toThrow(
      'command string'
    );
  });

  it('rejects an omitted archive row and pending publisher-prepare review', () => {
    const inventory = {
      complete: true,
      candidateLockSha256: 'lock',
      baselineLockSha256: 'baseline-lock',
      inspectedArtifacts: 1,
      selectedArtifacts: [{ key: 'probe@2.0.0', integrity: 'sha512-probe' }],
      rows: [
        {
          key: 'probe@2.0.0',
          integrity: 'sha512-probe',
          hooks: { prepare: 'node publish.cjs' },
          rootBindingGyp: false,
          rootHookFiles: [],
          archiveIntegrityVerified: true,
          disposition: 'registry-publication-only-no-execution-needed',
          rootReviewed: true,
        },
      ],
    };
    expect(() =>
      assertArtifactInventory(inventory, artifactMap(lockFixture()), 'lock', baselineFixture())
    ).not.toThrow();
    const omitted = structuredClone(inventory);
    omitted.rows = [];
    omitted.inspectedArtifacts = 0;
    expect(() =>
      assertArtifactInventory(omitted, artifactMap(lockFixture()), 'lock', baselineFixture())
    ).toThrow('Omitted or extra');
    const jointlyOmitted = structuredClone(inventory);
    jointlyOmitted.rows = [];
    jointlyOmitted.selectedArtifacts = [];
    jointlyOmitted.inspectedArtifacts = 0;
    expect(() =>
      assertArtifactInventory(jointlyOmitted, artifactMap(lockFixture()), 'lock', baselineFixture())
    ).toThrow('actual baseline-to-current lock diff');
    const rootHook = structuredClone(inventory);
    rootHook.rows[0].rootHookFiles = ['.hooks/install'];
    expect(() =>
      assertArtifactInventory(rootHook, artifactMap(lockFixture()), 'lock', baselineFixture())
    ).toThrow('Unreviewed root .hooks');
    delete rootHook.rows[0].rootHookFiles;
    expect(() =>
      assertArtifactInventory(rootHook, artifactMap(lockFixture()), 'lock', baselineFixture())
    ).toThrow('Unreviewed root .hooks');
    inventory.rows[0].rootReviewed = false;
    expect(() =>
      assertArtifactInventory(inventory, artifactMap(lockFixture()), 'lock', baselineFixture())
    ).toThrow('needs review');
  });
});

describe('live candidate archive review', () => {
  it('accepts an unrelated root-only dependency change with historical whole-lock fields', () => {
    const { inventory, lock } = candidateInventoryFixture();
    expect(() => assertCandidateArchiveInventory(inventory, lock, baselineFixture())).not.toThrow();
    addArtifact(lock, 'root-only');
    lock.importers['.'].dependencies['root-only'] = { version: '1.0.0' };
    expect(assertCandidateArchiveInventory(inventory, lock, baselineFixture())).toEqual({
      candidateArtifacts: 3,
      reviewedArtifacts: 1,
    });
  });

  it.each(['direct', 'optional'])(
    'rejects a new candidate %s artifact without archive review',
    (edge) => {
      const { inventory, lock } = candidateInventoryFixture();
      expect(() =>
        assertCandidateArchiveInventory(inventory, lock, baselineFixture())
      ).not.toThrow();
      addArtifact(lock, 'unreviewed');
      const owner =
        edge === 'direct'
          ? lock.importers['experiments/native-architecture'].devDependencies
          : lock.snapshots['probe@2.0.0(shared@1.0.0)'].optionalDependencies;
      owner.unreviewed = edge === 'direct' ? { version: '1.0.0' } : '1.0.0';
      expect(() => assertCandidateArchiveInventory(inventory, lock, baselineFixture())).toThrow(
        'Missing reviewed candidate archive: unreviewed@1.0.0'
      );
    }
  );

  it.each(['row', 'joint'])(
    'derives required archives independently of a %s omission',
    (omission) => {
      const { inventory, lock } = candidateInventoryFixture();
      expect(() =>
        assertCandidateArchiveInventory(inventory, lock, baselineFixture())
      ).not.toThrow();
      inventory.rows = [];
      inventory.inspectedArtifacts = 0;
      if (omission === 'joint') inventory.selectedArtifacts = [];
      expect(() => assertCandidateArchiveInventory(inventory, lock, baselineFixture())).toThrow(
        'Missing reviewed candidate archive: probe@2.0.0'
      );
    }
  );

  it.each([
    { field: 'integrity', value: 'sha512-changed', error: 'Artifact changed after review' },
    {
      field: 'tarball',
      value: 'https://registry.npmjs.org/probe/-/changed.tgz',
      error: 'Reviewed archive URL changed',
    },
  ])('rejects a same-version candidate $field change', ({ field, value, error }) => {
    const { inventory, lock } = candidateInventoryFixture();
    expect(() => assertCandidateArchiveInventory(inventory, lock, baselineFixture())).not.toThrow();
    lock.packages['probe@2.0.0'].resolution[field] = value;
    expect(() => assertCandidateArchiveInventory(inventory, lock, baselineFixture())).toThrow(
      error
    );
  });

  it.each([
    { url: 'not-a-url', error: 'Invalid reviewed archive URL' },
    {
      url: 'https://registry.npmjs.org.example.test/probe.tgz',
      error: 'Nonregistry reviewed archive',
    },
    { url: 'https://user@registry.npmjs.org/probe.tgz', error: 'Nonregistry reviewed archive' },
  ])('rejects an unowned reviewed archive URL: $url', ({ url, error }) => {
    const { inventory, lock } = candidateInventoryFixture();
    expect(() => assertCandidateArchiveInventory(inventory, lock, baselineFixture())).not.toThrow();
    inventory.rows[0].tarball = url;
    expect(() => assertCandidateArchiveInventory(inventory, lock, baselineFixture())).toThrow(
      error
    );
  });

  it('does not waive production leakage for a fully reviewed candidate archive', () => {
    const { inventory, lock } = candidateInventoryFixture();
    expect(() => assertCandidateArchiveInventory(inventory, lock, baselineFixture())).not.toThrow();
    expect(() => assertProductionClosure(lock, ['shared@1.0.0'])).not.toThrow();
    lock.importers['.'].dependencies.probe = { version: '2.0.0(shared@1.0.0)' };
    expect(() => assertCandidateArchiveInventory(inventory, lock, baselineFixture())).not.toThrow();
    expect(() => assertProductionClosure(lock, ['shared@1.0.0'])).toThrow('entered the shipping');
  });
});
