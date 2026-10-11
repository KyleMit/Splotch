import { join } from 'node:path';
import { readJson } from './native-identity.mjs';
import { readDrawingArchiveInventory } from './native-drawing-inventory.mjs';
import { assertCandidateArchiveInventory } from './topology-policy.mjs';
export function readNativeCandidateArchiveInventory(root, actualLock, joint) {
  const evidence = join(root, 'docs/migration/evidence/native-topology-05');
  const drawing = readDrawingArchiveInventory(
    root,
    joint.audio.lock,
    joint.audio.baselineLockSha256,
    readJson(join(evidence, 'script-inventory.json'))
  );
  const rows = [...drawing.inventory.rows, ...joint.audio.archiveRows, ...joint.rsdArchiveRows];
  const inventory = assertCandidateArchiveInventory(
    { ...drawing.inventory, rows, inspectedArtifacts: rows.length },
    actualLock,
    readJson(join(evidence, 'baseline-artifact-resolutions.json'))
  );
  return {
    ...inventory,
    drawingInputs: drawing.qualification,
    rsdReviewedArtifacts: joint.rsdArchiveRows.length,
  };
}
