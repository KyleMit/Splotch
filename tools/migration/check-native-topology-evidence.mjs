import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { CANDIDATE_DIRECTORY } from '../lib/native-candidate.mjs';
import { artifactMap, readLockFile } from './lib/lock-artifacts.mjs';
import { readJson } from './lib/native-identity.mjs';
import { assertShippingConfigEvidence, inspectShippingPluginPaths } from './lib/native-config.mjs';
import { assertProductionInstallContract } from './lib/production-install-contract.mjs';
import { assertArtifactInventory, assertCandidateArtifactRecord } from './lib/topology-policy.mjs';

export function checkNativeTopologyEvidence(argv) {
  assert.deepEqual(argv, [], 'This evidence checker takes no arguments');
  const root = realpathSync(ROOT);
  const evidence = join(root, 'docs/migration/evidence/native-topology-05');
  const lock = readLockFile(join(root, 'pnpm-lock.yaml'));
  const lockSha256 = createHash('sha256')
    .update(readFileSync(join(root, 'pnpm-lock.yaml')))
    .digest('hex');
  assertCandidateArtifactRecord(
    readJson(join(evidence, 'candidate-exclusive-artifacts.json')),
    lock,
    lockSha256
  );
  assertProductionInstallContract(
    readJson(join(evidence, 'production-install-contract.json')),
    root,
    lock
  );
  const inventory = assertArtifactInventory(
    readJson(join(evidence, 'script-inventory.json')),
    artifactMap(lock),
    lockSha256,
    readJson(join(evidence, 'baseline-artifact-resolutions.json'))
  );
  const alignment = readJson(join(root, CANDIDATE_DIRECTORY, 'alignment.json'));
  const shipping = inspectShippingPluginPaths(root);
  assertShippingConfigEvidence(shipping, alignment.shippingConfigHashes);
  return {
    scope: 'Exact topology05 proof inputs; not the live Quality invariants',
    lockSha256,
    inventory,
    shipping,
  };
}

if (isMain(import.meta.url))
  runMain(async () => {
    console.log(JSON.stringify(checkNativeTopologyEvidence(process.argv.slice(2)), null, 2));
  });
