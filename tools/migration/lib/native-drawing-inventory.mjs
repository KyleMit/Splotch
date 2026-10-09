import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { artifactMap, getImporterArtifactKeys } from './lock-artifacts.mjs';
import { assertArtifactInventory } from './topology-policy.mjs';

const DRAWING_EVIDENCE = 'docs/migration/evidence/native-drawing-development-01';

export function readDrawingArchiveInventory(root, lock, lockSha256, original) {
  const read = (name) => JSON.parse(readFileSync(join(root, DRAWING_EVIDENCE, name), 'utf8'));
  const additional = read('script-inventory.json');
  const qualification = assertArtifactInventory(
    additional,
    artifactMap(lock),
    lockSha256,
    read('baseline-artifact-resolutions.json')
  );
  const existingKeys = new Set(original.rows.map(({ key }) => key));
  const rows = [...original.rows, ...additional.rows.filter(({ key }) => !existingKeys.has(key))];
  const closure = getImporterArtifactKeys(lock, CANDIDATE_DIRECTORY, true);
  return {
    inventory: { ...original, rows, inspectedArtifacts: rows.length },
    qualification: {
      ...qualification,
      addedArchiveRows: rows.length - original.rows.length,
      newCandidateRows: rows.filter(({ key }) => closure.has(key) && !existingKeys.has(key)).length,
      sourceInventory: `${DRAWING_EVIDENCE}/script-inventory.json`,
      scope:
        'Only the source-pinned 195-to-drawing artifact delta was inspected; prior archive rows remain unchanged.',
    },
  };
}
