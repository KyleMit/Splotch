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
  it('detects default node-gyp capability even when metadata claims no install script', async () => {
    const bytes = await archiveFixture({ name: 'probe', version: '2.0.0' }, true);
    const archive = await inspectArchive(bytes);
    expect(archive.rootBindingGyp).toBe(true);
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
          hasInstallScript: false,
          archiveIntegrityVerified: true,
          disposition: 'no-install-hooks',
          ...archive,
        },
      ],
    };
    expect(() =>
      assertArtifactInventory(inventory, artifactMap(lockFixture()), 'lock', baselineFixture())
    ).toThrow();
  });

  it('surfaces metadata-false default install capability after verifying actual archive bytes', async () => {
    const bytes = await archiveFixture({ name: 'probe', version: '2.0.0' }, true);
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    const tarball = 'https://registry.npmjs.org/probe/-/probe-2.0.0.tgz';
    const metadata = {
      versions: { '2.0.0': { hasInstallScript: false, dist: { integrity, tarball } } },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => metadata })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () =>
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        })
    );
    const row = await inspectRegistryArtifact({
      key: 'probe@2.0.0',
      name: 'probe',
      version: '2.0.0',
      integrity,
    });
    expect(row.archiveIntegrityVerified).toBe(true);
    expect(row.metadataContradiction).toBe(true);
    expect(row.disposition).toBe('review-required');
    await expect(
      inspectArchive(await archiveFixture({ name: 'probe', version: '2.0.0' }, 'link'))
    ).rejects.toThrow('binding.gyp link');
  });

  it('detects root hook files without package scripts and rejects ambiguous hook links', async () => {
    const manifest = { name: 'probe', version: '2.0.0' };
    const plain = await inspectArchive(await archiveFixture(manifest));
    expect(plain.rootHookFiles).toEqual([]);
    const bytes = await archiveFixture(manifest, false, 'node publisher-hook.cjs');
    const archive = await inspectArchive(bytes);
    expect(archive.hooks).toEqual({});
    expect(archive.rootHookFiles).toEqual(['.hooks/install']);
    expect(
      (await inspectArchive(await archiveFixture(manifest, false, 'backslash'))).rootHookFiles
    ).toEqual(['.hooks\\install']);
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            versions: {
              '2.0.0': {
                hasInstallScript: false,
                dist: { integrity, tarball: 'https://registry.npmjs.org/probe/-/probe-2.0.0.tgz' },
              },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () =>
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        })
    );
    const row = await inspectRegistryArtifact({
      key: 'probe@2.0.0',
      name: 'probe',
      version: '2.0.0',
      integrity,
    });
    expect(row.metadataContradiction).toBe(true);
    expect(row.disposition).toBe('review-required');
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
