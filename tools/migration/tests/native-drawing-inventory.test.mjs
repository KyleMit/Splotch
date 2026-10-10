import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { qualifyAudioInputs } from '../lib/native-audio-qualification.mjs';
import { readDrawingArchiveInventory } from '../lib/native-drawing-inventory.mjs';
import { assertCandidateArchiveInventory } from '../lib/topology-policy.mjs';

const root = join(import.meta.dirname, '../../..');
const originalEvidence = join(root, 'docs/migration/evidence/native-topology-05');
const adjunctPath = 'docs/migration/evidence/native-drawing-development-01';
const original = JSON.parse(readFileSync(join(originalEvidence, 'script-inventory.json')));
const baseline = JSON.parse(
  readFileSync(join(originalEvidence, 'baseline-artifact-resolutions.json'))
);
const audio = qualifyAudioInputs(root);
const lock = audio.lock;
const lockSha256 = audio.baselineLockSha256;
const fixtures = [];

function fixture(mutate) {
  const path = mkdtempSync(join(tmpdir(), 'splotch-drawing-inventory-'));
  fixtures.push(path);
  cpSync(join(root, adjunctPath), join(path, adjunctPath), { recursive: true });
  const file = join(path, adjunctPath, 'script-inventory.json');
  const inventory = JSON.parse(readFileSync(file));
  mutate(inventory);
  writeFileSync(file, JSON.stringify(inventory));
  return path;
}

function verify(path) {
  const result = readDrawingArchiveInventory(path, lock, lockSha256, original);
  assertCandidateArchiveInventory(result.inventory, lock, baseline);
  return result;
}

afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

describe('the new drawing dependency archive adjunct', () => {
  it('retains every old row and separately reports the actual inspected delta', () => {
    const result = verify(root);
    expect(result.inventory.rows.slice(0, original.rows.length)).toEqual(original.rows);
    expect(result.qualification).toMatchObject({ reviewedArtifacts: 23, newCandidateRows: 21 });
    expect(
      result.inventory.rows.filter(({ key }) => key === 'legacy-javascript@0.0.3')
    ).toHaveLength(1);
  });

  it('rejects omitted, additional or duplicate new archive rows', () => {
    for (const mutate of [
      (inventory) => inventory.rows.pop(),
      (inventory) => inventory.rows.push(inventory.rows[0]),
      (inventory) => inventory.selectedArtifacts.pop(),
    ])
      expect(() => verify(fixture(mutate))).toThrow();
  });

  it('rejects changed integrity and lock ownership through the production composition', () => {
    expect(() =>
      verify(
        fixture((inventory) => {
          inventory.rows.find(({ name }) => name === 'react-native-svg').integrity =
            'sha512-corrupt';
        })
      )
    ).toThrow('Artifact changed');
    expect(() =>
      verify(
        fixture((inventory) => {
          inventory.candidateLockSha256 = 'unreviewed';
        })
      )
    ).toThrow('Lock changed');
    expect(() =>
      verify(
        fixture((inventory) => {
          inventory.baselineLockSha256 = 'unreviewed';
        })
      )
    ).toThrow('baseline');
  });

  it('requires the exact inert prepare disposition and rejects install, binding or root-hook edges', () => {
    for (const mutate of [
      (row) => {
        row.rootReviewed = false;
      },
      (row) => {
        row.hooks.install = 'execute unreviewed code';
      },
      (row) => {
        row.rootBindingGyp = true;
      },
      (row) => {
        row.rootHookFiles = ['.hooks/postinstall'];
      },
    ])
      expect(() =>
        verify(
          fixture((inventory) =>
            mutate(inventory.rows.find(({ name }) => name === 'react-native-svg'))
          )
        )
      ).toThrow();
  });
});
