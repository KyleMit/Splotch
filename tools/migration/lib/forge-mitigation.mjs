import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import {
  artifactMap,
  getImporterArtifactKeys,
  getImporterDependencyPaths,
} from './lock-artifacts.mjs';
import {
  collectForgeInstallPackages,
  inspectForgeReferences,
  verifyInstalledForgeFiles,
} from './forge-installed.mjs';
import { runForgeConsumerControls, runForgeRsaControls } from './forge-controls.mjs';

const MITIGATION_INPUT = 'tools/migration/inputs/forge-mitigation.json';
const MITIGATION_INPUT_SHA256 = 'd9b082687498d8017f4f07289aeed49600c5606b0e9b60384d822996d4213bde';
const PATCH_IDENTITY = 'node-forge@1.4.0';
const FORGE_ADVISORY = 'GHSA-86w9-cpqp-85rv';

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function reviewedInput(root) {
  const path = join(root, MITIGATION_INPUT);
  assert.ok(
    lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(),
    'Forge mitigation input is not a regular file'
  );
  const bytes = readFileSync(path);
  assert.equal(digest(bytes), MITIGATION_INPUT_SHA256, 'Reviewed forge mitigation input changed');
  const mitigation = JSON.parse(bytes);
  assert.equal(mitigation.schemaVersion, 1);
  assert.equal(mitigation.advisory, FORGE_ADVISORY);
  assert.equal(mitigation.version, '1.4.0');
  return mitigation;
}

export function assertForgeMitigationPolicy(root, lock, workspace, mitigation) {
  assert.ok(
    workspace.auditConfig?.ignoreGhsas?.includes(FORGE_ADVISORY),
    'Forge mitigation must retain its exact advisory record'
  );
  assert.ok(
    workspace.allowUnusedPatches === undefined || workspace.allowUnusedPatches === false,
    'Unused patch bypass or ambiguous option is forbidden'
  );
  assert.deepEqual(
    workspace.patchedDependencies,
    { [PATCH_IDENTITY]: mitigation.patchPath },
    'Forge patch registration changed'
  );
  assert.deepEqual(
    lock.patchedDependencies,
    { [PATCH_IDENTITY]: mitigation.patchSha256 },
    'Forge lock patch identity changed'
  );
  const patch = join(root, mitigation.patchPath);
  assert.ok(
    lstatSync(patch).isFile() && !lstatSync(patch).isSymbolicLink(),
    'Forge patch is not a regular file'
  );
  assert.equal(digest(readFileSync(patch)), mitigation.patchSha256, 'Forge patch bytes changed');
  const forges = [...artifactMap(lock).values()].filter(({ name }) => name === 'node-forge');
  assert.equal(forges.length, 1, 'Unsupported forge version or alias in lock');
  assert.equal(forges[0].key, PATCH_IDENTITY, 'Unsupported forge version in lock');
  assert.equal(forges[0].integrity, mitigation.integrity, 'Forge registry integrity changed');
  assert.ok(
    !forges[0].tarball || forges[0].tarball === mitigation.archiveUrl,
    'Forge source type changed'
  );
  assert.equal(
    getImporterArtifactKeys(lock, '.').has(PATCH_IDENTITY),
    false,
    'Forge entered the shipping production closure'
  );
  const expected = [
    `${CANDIDATE_DIRECTORY}>expo>@expo/cli>node-forge`,
    `${CANDIDATE_DIRECTORY}>expo>@expo/cli>@expo/code-signing-certificates>node-forge`,
    `${CANDIDATE_DIRECTORY}>babel-preset-expo>expo>@expo/cli>node-forge`,
    `${CANDIDATE_DIRECTORY}>babel-preset-expo>expo>@expo/cli>@expo/code-signing-certificates>node-forge`,
  ].sort();
  const paths = getImporterDependencyPaths(lock, PATCH_IDENTITY);
  assert.deepEqual(paths, expected, 'Unsupported forge importer or dependency path');
  for (const [key, snapshot] of Object.entries(lock.snapshots)) {
    if (key.replace(/\(.*$/, '') === PATCH_IDENTITY)
      assert.equal(
        key,
        `${PATCH_IDENTITY}(patch_hash=${mitigation.patchSha256})`,
        'Unpatched forge lock snapshot'
      );
    for (const group of ['dependencies', 'optionalDependencies']) {
      if (snapshot[group]?.['node-forge'])
        assert.equal(
          snapshot[group]['node-forge'],
          `1.4.0(patch_hash=${mitigation.patchSha256})`,
          'Unpatched forge dependency reference'
        );
    }
  }
  return paths;
}

function verifyConsumerSources(packages, mitigation) {
  for (const name of ['@expo/cli', '@expo/code-signing-certificates']) {
    const consumers = packages.filter(({ manifest }) => manifest.name === name);
    assert.ok(consumers.length, `Actual forge consumer missing: ${name}`);
    for (const consumer of consumers) {
      const sourceRecords = mitigation.consumers.filter((record) => record.name === name);
      assert.ok(sourceRecords.length, `Unreviewed consumer: ${name}`);
      assert.equal(
        consumer.manifest.version,
        sourceRecords[0].version,
        `Actual forge consumer version changed: ${name}`
      );
      assert.equal(
        consumer.manifest.dependencies?.['node-forge'],
        '^1.3.3',
        `Actual forge consumer range changed: ${name}`
      );
      for (const record of sourceRecords)
        assert.equal(
          digest(readFileSync(join(consumer.path, record.path))),
          record.sha256,
          `Actual forge consumer source changed: ${name}/${record.path}`
        );
    }
  }
}

export async function verifyForgeMitigation(root, lock, workspace) {
  root = realpathSync(root);
  const mitigation = reviewedInput(root);
  const lockedPaths = assertForgeMitigationPolicy(root, lock, workspace, mitigation);
  const packages = collectForgeInstallPackages(root);
  const installed = packages.filter(({ manifest }) => manifest.name === 'node-forge');
  assert.ok(installed.length, 'Installed forge mitigation missing');
  const directories = new Set(installed.map(({ path }) => path));
  const copies = installed.map(({ path, manifest }) => {
    assert.equal(
      manifest.version,
      mitigation.version,
      `Unsupported installed forge version: ${path}`
    );
    assert.equal(manifest.main, 'lib/index.js', `Unsupported installed forge main: ${path}`);
    verifyInstalledForgeFiles(path, mitigation, digest);
    const require = createRequire(join(path, 'package.json'));
    assert.equal(
      realpathSync(require.resolve(path)),
      realpathSync(join(path, 'lib/index.js')),
      `Forge main resolution changed: ${path}`
    );
    return {
      path: relative(root, path),
      rsaSha256: mitigation.patchedRsaSha256,
      controls: runForgeRsaControls(require(path), mitigation.publicForgedVector),
    };
  });
  verifyConsumerSources(packages, mitigation);
  const references = inspectForgeReferences(packages, lock);
  for (const reference of references) {
    assert.ok(
      mitigation.consumers.some(
        (record) => record.name === reference.package && record.version === reference.version
      ),
      `Unreviewed forge source consumer: ${reference.path}`
    );
    const require = createRequire(reference.path);
    const path = realpathSync(require.resolve('node-forge/package.json'));
    assert.ok(
      directories.has(realpathSync(join(path, '..'))),
      `Consumer resolves an uninspected forge: ${reference.path}`
    );
    assert.equal(
      realpathSync(require.resolve('node-forge')),
      realpathSync(join(path, '../lib/index.js')),
      `Consumer bypasses forge main: ${reference.path}`
    );
  }
  assert.ok(
    references.some((reference) => reference.package === '@expo/cli'),
    'Actual CLI forge resolution missing'
  );
  assert.ok(
    references.some((reference) => reference.package === '@expo/code-signing-certificates'),
    'Actual helper forge resolution missing'
  );
  const consumers = await runForgeConsumerControls(packages);
  return {
    status: 'affected-published-version-with-guarded-lib-only-local-mitigation',
    advisory: mitigation.advisory,
    issue: mitigation.issue,
    patchedRsaSha256: mitigation.patchedRsaSha256,
    lockedPaths,
    installedCopies: copies,
    consumers,
    scannedPackages: packages.length,
    staticMainReferences: references.map((reference) => ({
      ...reference,
      path: relative(root, reference.path),
    })),
    unpatchedDistBundles: 'registry bytes preserved; static subpath consumers forbidden',
    limits:
      'Static import/require and subpath literal references plus exact known consumer bytes; not a general proof about arbitrary computed code or live certificate-fetch/signing workflows',
  };
}
