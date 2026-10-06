import assert from 'node:assert/strict';
import { realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { PRODUCTION_INSTALL_CONTRACT } from '../netlify-topology-witness.mjs';
import { candidateExclusiveArtifacts, readLockFile } from './lib/lock-artifacts.mjs';
import { readJson } from './lib/native-identity.mjs';
import { deriveProductionInstallContract } from './lib/production-install-contract.mjs';
import {
  assertCandidateArchiveInventory,
  assertProductionClosure,
} from './lib/topology-policy.mjs';

if (isMain(import.meta.url))
  runMain(async () => {
    assert.deepEqual(process.argv.slice(2), [], 'This proof-input generator takes no arguments');
    const root = realpathSync(ROOT);
    const evidence = join(root, 'docs/migration/evidence/native-topology-05');
    assert.equal(
      realpathSync(evidence),
      evidence,
      'Proof inputs cannot be written through an alias'
    );
    const contractDirectory = dirname(join(root, PRODUCTION_INSTALL_CONTRACT));
    assert.equal(
      realpathSync(contractDirectory),
      contractDirectory,
      'Current production contract cannot be written through an alias'
    );
    const lock = readLockFile(join(root, 'pnpm-lock.yaml'));
    assertCandidateArchiveInventory(
      readJson(join(evidence, 'script-inventory.json')),
      lock,
      readJson(join(evidence, 'baseline-artifact-resolutions.json'))
    );
    assertProductionClosure(
      lock,
      readJson(join(evidence, 'baseline-production-artifacts.json')).artifacts
    );
    const contract = deriveProductionInstallContract(root, lock);
    const artifacts = candidateExclusiveArtifacts(lock)
      .map(({ key, name, version }) => ({ key, name, version }))
      .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
    const outputs = {
      [PRODUCTION_INSTALL_CONTRACT]: contract,
      'docs/migration/evidence/native-topology-05/candidate-exclusive-artifacts.json': {
        schemaVersion: 1,
        lockSha256: contract.lockSha256,
        artifacts,
      },
    };
    for (const [path, record] of Object.entries(outputs))
      writeFileSync(join(root, path), JSON.stringify(record, null, 2) + '\n');
    console.log(
      JSON.stringify({
        outputs: Object.keys(outputs),
        scope: 'Derived proof inputs only; archive review and executed proof remain separate',
      })
    );
  });
