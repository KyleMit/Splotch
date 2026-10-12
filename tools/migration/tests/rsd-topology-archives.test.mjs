import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { qualifyJointNativeInputs } from '../lib/native-joint-graph.mjs';
import { readNativeCandidateArchiveInventory } from '../lib/native-candidate-archive-inventory.mjs';
import { reviewedRsdArchiveRows } from '../lib/rsd-drawing-graph.mjs';
import { readLockFile } from '../lib/lock-artifacts.mjs';
const root = join(import.meta.dirname, '../../..');
const input = JSON.parse(readFileSync(join(root, 'tools/migration/inputs/rsd-drawing-graph.json')));
const reuse = JSON.parse(readFileSync(join(root, input.archiveReuse.path)));
const receipt = JSON.parse(readFileSync(join(root, input.rootArchiveApproval.path)));
it('feeds original seven RSD and one safe-insets authenticated archive through the actual topology inventory consumer', () => {
  const joint = qualifyJointNativeInputs(root);
  expect(
    readNativeCandidateArchiveInventory(root, readLockFile(join(root, 'pnpm-lock.yaml')), joint)
      .rsdReviewedArtifacts
  ).toBe(8);
  const old = { ...joint, rsdArchiveRows: [] };
  expect(
    readNativeCandidateArchiveInventory(
      root,
      readLockFile(join(root, input.baselineFiles['pnpm-lock.yaml'].path)),
      old
    ).rsdReviewedArtifacts
  ).toBe(0);
});
for (const [name, mutate, message] of [
  [
    'missing RSD archive',
    (joint) => {
      const index = joint.rsdArchiveRows.findIndex(({ key }) => key === 'react-strict-dom@0.0.54');
      expect(index).toBeGreaterThanOrEqual(0);
      joint.rsdArchiveRows.splice(index, 1);
    },
    'Missing reviewed candidate archive',
  ],
  [
    'missing safe-insets archive',
    (joint) => {
      const index = joint.rsdArchiveRows.findIndex(
        ({ key }) => key === 'react-native-safe-area-context@5.7.0'
      );
      expect(index).toBeGreaterThanOrEqual(0);
      joint.rsdArchiveRows.splice(index, 1);
    },
    'Missing reviewed candidate archive',
  ],
  [
    'changed RSD archive integrity',
    (joint) => {
      joint.rsdArchiveRows[0].integrity = 'foreign';
    },
    'Artifact changed after review',
  ],
  [
    'duplicate RSD archive',
    (joint) => joint.rsdArchiveRows.push(joint.rsdArchiveRows[0]),
    'Duplicate inventory identity',
  ],
  [
    'install hook smuggling',
    (joint) => {
      joint.rsdArchiveRows[0].hooks = { install: 'foreign' };
    },
    'Unreviewed install hook',
  ],
])
  it(`refuses ${name} in the production topology consumer`, () => {
    const joint = qualifyJointNativeInputs(root);
    expect(
      readNativeCandidateArchiveInventory(root, readLockFile(join(root, 'pnpm-lock.yaml')), joint)
        .rsdReviewedArtifacts
    ).toBe(8);
    mutate(joint);
    expect(() =>
      readNativeCandidateArchiveInventory(root, readLockFile(join(root, 'pnpm-lock.yaml')), joint)
    ).toThrow(message);
  });
it('requires the exact closed prepare review rather than treating prepare as absent', () => {
  const rows = reviewedRsdArchiveRows(input, reuse, receipt);
  expect(rows.find(({ key }) => key === 'styleq@0.2.1')).toMatchObject({
    rootReviewed: true,
    disposition: 'registry-publication-only-no-execution-needed',
    hooks: { prepare: 'npm run test && npm run build' },
  });
  const missing = structuredClone(receipt);
  missing.newArchives = missing.newArchives.filter(({ key }) => key !== 'styleq@0.2.1');
  expect(() => reviewedRsdArchiveRows(input, reuse, missing)).toThrow(
    'RSD archive lacks Root review'
  );
  const changed = structuredClone(reuse);
  changed.rows.find(({ key }) => key === 'styleq@0.2.1').priorClosedRow.hooks.prepare = 'foreign';
  expect(() => reviewedRsdArchiveRows(input, changed, receipt)).toThrow(
    'RSD Root archive hooks changed'
  );
});
