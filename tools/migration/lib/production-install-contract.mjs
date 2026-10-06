import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import {
  artifactMap,
  candidateExclusiveArtifacts,
  getImporterArtifactKeys,
  getImporterDirectArtifactKeys,
} from './lock-artifacts.mjs';

function hashFile(root, path) {
  return createHash('sha256')
    .update(readFileSync(join(root, path)))
    .digest('hex');
}

function sortedArtifactRows(artifacts) {
  return artifacts
    .map(({ key, name, version }) => ({ key, name, version }))
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
}

export function deriveProductionInstallContract(root, lock) {
  const artifacts = artifactMap(lock);
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.deepEqual(
    Object.keys(lock.importers['.'].dependencies).sort(),
    Object.keys(manifest.dependencies).sort(),
    'Production manifest and lock ownership differ'
  );
  return {
    schemaVersion: 1,
    candidateDirectory: CANDIDATE_DIRECTORY,
    packageManager: manifest.packageManager,
    lockSha256: hashFile(root, 'pnpm-lock.yaml'),
    rootManifestSha256: hashFile(root, 'package.json'),
    candidateManifestSha256: hashFile(root, `${CANDIDATE_DIRECTORY}/package.json`),
    workspaceSha256: hashFile(root, 'pnpm-workspace.yaml'),
    netlifyConfigSha256: hashFile(root, 'netlify.toml'),
    productionArtifacts: sortedArtifactRows(
      [...getImporterArtifactKeys(lock, '.')].map((key) => artifacts.get(key))
    ),
    productionDirect: sortedArtifactRows(
      getImporterDirectArtifactKeys(lock, '.').map((key) => artifacts.get(key))
    ),
    candidateExclusiveArtifacts: sortedArtifactRows(candidateExclusiveArtifacts(lock)),
  };
}

export function assertProductionInstallContract(record, root, lock) {
  assert.deepEqual(
    record,
    deriveProductionInstallContract(root, lock),
    'Production install contract differs from its reviewed owners'
  );
}
