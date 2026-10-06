import assert from 'node:assert/strict';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';

export const TOPOLOGY_PROOF_BRANCH = 'feature/netlify-migration-topology-05';
export const PRODUCTION_INSTALL_CONTRACT =
  'docs/migration/evidence/netlify-install/production-install-contract.json';
export const TOPOLOGY_EXPORT_PATH = 'web/build/migration-install-topology.json';
export const TOPOLOGY_CONTEXTS = ['.', CANDIDATE_DIRECTORY, 'web', 'netlify/functions', 'tools'];
export const TOPOLOGY_INPUT_PATHS = {
  lockSha256: 'pnpm-lock.yaml',
  rootManifestSha256: 'package.json',
  candidateManifestSha256: `${CANDIDATE_DIRECTORY}/package.json`,
  workspaceSha256: 'pnpm-workspace.yaml',
  netlifyConfigSha256: 'netlify.toml',
};
const EXPORT_OBSERVATION = 'after-web-build-and-shipping-postbuild-guards';
export const TOPOLOGY_INSPECTION_SCOPE =
  'Observed installed tree and identity; cloud install/build/deploy logs remain separate evidence';

function fields(value, names, label) {
  assert.ok(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${label} is missing`
  );
  assert.deepEqual(Object.keys(value).sort(), [...names].sort(), `${label} fields differ`);
}

export function topologyArtifactKeys(rows, label) {
  assert.ok(Array.isArray(rows), `${label} artifact list is missing`);
  const keys = rows.map((row) => {
    fields(row, ['key', 'name', 'version'], `${label} artifact`);
    assert.ok(typeof row.name === 'string' && row.name.length > 0);
    assert.ok(typeof row.version === 'string' && row.version.length > 0);
    assert.equal(row.key, `${row.name}@${row.version}`, `Invalid ${label} artifact identity`);
    return row.key;
  });
  assert.equal(new Set(keys).size, keys.length, `Duplicate ${label} artifact`);
  assert.deepEqual(keys, [...keys].sort(), `Unsorted ${label} artifacts`);
  return new Set(keys);
}

function packagePath(path) {
  assert.equal(typeof path, 'string', 'Installed path is missing');
  const parts = path.split('/');
  assert.ok(
    !path.includes('\\') &&
      !path.includes('\0') &&
      !/^[A-Za-z]:/.test(path) &&
      parts.every((part) => part !== '' && part !== '.' && part !== '..'),
    `Installed path escapes checkout: ${path}`
  );
}

export function assertTopologyGraph(record, contract) {
  const production = topologyArtifactKeys(contract.productionArtifacts, 'production');
  const direct = topologyArtifactKeys(contract.productionDirect, 'direct production');
  const exclusive = topologyArtifactKeys(
    contract.candidateExclusiveArtifacts,
    'candidate-exclusive'
  );
  for (const key of direct)
    assert.ok(production.has(key), `Direct package outside production closure: ${key}`);
  for (const key of exclusive)
    assert.ok(!production.has(key), `Invalid candidate-exclusive ownership: ${key}`);
  assert.equal(
    record.candidateExclusiveArtifactCount,
    exclusive.size,
    'Candidate-exclusive count differs'
  );
  assert.ok(Array.isArray(record.installed), 'Installed rows are missing');
  assert.equal(
    record.installedPackageCount,
    record.installed.length,
    'Installed package count differs'
  );
  const installed = new Map();
  const paths = record.installed.map((row) => {
    fields(row, ['key', 'path'], 'Installed row');
    packagePath(row.path);
    assert.ok(
      !exclusive.has(row.key),
      `Candidate-exclusive installed contamination: ${row.key} at ${row.path}`
    );
    assert.ok(
      production.has(row.key),
      `Installed package outside production graph: ${row.key} at ${row.path}`
    );
    assert.ok(!installed.has(row.path), `Duplicate installed path: ${row.path}`);
    installed.set(row.path, row.key);
    return row.path;
  });
  assert.deepEqual(
    paths,
    [...paths].sort((left, right) => left.localeCompare(right)),
    'Unsorted installed rows'
  );
  assert.ok(Array.isArray(record.resolutions), 'Resolution rows are missing');
  const expected = TOPOLOGY_CONTEXTS.flatMap((context) =>
    contract.productionDirect.map(({ key }) => ({ context, key }))
  );
  assert.deepEqual(
    record.resolutions.map((row) => {
      fields(row, ['context', 'key', 'path'], 'Resolution row');
      packagePath(row.path);
      assert.equal(
        installed.get(row.path),
        row.key,
        `Resolution has no matching installed package: ${row.context} ${row.key}`
      );
      return { context: row.context, key: row.key };
    }),
    expected,
    'Production resolution matrix differs'
  );
}

function assertInspection(record, contract) {
  fields(
    record,
    [
      'disposition',
      'proofBranch',
      'context',
      'commit',
      'nodeVersion',
      'packageManager',
      'packageManagerVersion',
      'productionFlags',
      ...Object.keys(TOPOLOGY_INPUT_PATHS),
      'candidateExclusiveArtifactCount',
      'installedPackageCount',
      'installed',
      'resolutions',
      'scope',
    ],
    'Inspection'
  );
  assert.equal(contract.schemaVersion, 1, 'Contract schema differs');
  assert.equal(contract.candidateDirectory, CANDIDATE_DIRECTORY, 'Contract candidate differs');
  assert.equal(record.disposition, 'production-installed-tree-passed');
  assert.equal(record.proofBranch, TOPOLOGY_PROOF_BRANCH);
  assert.equal(record.context, 'branch-deploy');
  assert.match(record.commit, /^[a-f0-9]{40}$/);
  assert.match(record.nodeVersion, /^v\d+\.\d+\.\d+$/);
  assert.match(record.packageManagerVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(
    record.packageManager,
    `pnpm@${record.packageManagerVersion}`,
    'Observed package manager differs'
  );
  assert.equal(record.packageManager, contract.packageManager);
  assert.equal(record.productionFlags, '--prod');
  for (const key of Object.keys(TOPOLOGY_INPUT_PATHS)) {
    assert.match(record[key], /^[a-f0-9]{64}$/);
    assert.equal(record[key], contract[key], `Proof input differs: ${key}`);
  }
  assert.equal(record.scope, TOPOLOGY_INSPECTION_SCOPE, 'Inspection scope differs');
  assertTopologyGraph(record, contract);
}

function assertDeploy(deploy) {
  fields(deploy, ['id', 'buildId', 'siteId'], 'Deploy identity');
  assert.match(deploy.id, /^[a-f0-9]{24}$/);
  assert.match(deploy.buildId, /^[a-f0-9]{24}$/);
  assert.match(deploy.siteId, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
}

export function createHostedTopologyRecord(inspection, contract, contractSha256, env) {
  const record = {
    schemaVersion: 1,
    observation: EXPORT_OBSERVATION,
    contractSha256,
    deploy: { id: env.DEPLOY_ID, buildId: env.BUILD_ID, siteId: env.SITE_ID },
    inspection,
  };
  assertHostedTopologyRecord(record, contract, contractSha256);
  return record;
}

export function assertHostedTopologyRecord(record, contract, contractSha256) {
  fields(
    record,
    ['schemaVersion', 'observation', 'contractSha256', 'deploy', 'inspection'],
    'Hosted topology'
  );
  assert.equal(record.schemaVersion, 1, 'Hosted topology schema differs');
  assert.equal(record.observation, EXPORT_OBSERVATION, 'Observation timing differs');
  assert.match(contractSha256, /^[a-f0-9]{64}$/);
  assert.equal(record.contractSha256, contractSha256, 'Contract bytes differ');
  assertDeploy(record.deploy);
  assertInspection(record.inspection, contract);
}

export function assertHostedTopologyDeploy(record, expectedCommit, metadata) {
  fields(
    metadata,
    ['id', 'build_id', 'site_id', 'commit_ref', 'branch', 'context', 'state'],
    'Selected deploy metadata'
  );
  assert.match(expectedCommit, /^[a-f0-9]{40}$/, 'Expected commit is missing');
  assert.equal(
    record.inspection.commit,
    expectedCommit,
    'Artifact commit differs from expected source'
  );
  assert.equal(metadata.commit_ref, expectedCommit, 'Deploy commit differs from expected source');
  assert.equal(metadata.branch, TOPOLOGY_PROOF_BRANCH, 'Deploy branch differs');
  assert.equal(metadata.context, 'branch-deploy', 'Deploy context differs');
  assert.equal(metadata.state, 'ready', 'Deploy is not ready');
  assert.deepEqual(
    record.deploy,
    { id: metadata.id, buildId: metadata.build_id, siteId: metadata.site_id },
    'Hosted deploy identity differs'
  );
}
