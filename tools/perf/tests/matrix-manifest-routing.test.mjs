import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateDeploymentMatrixReport } from '../gen-performance-matrix.mjs';

const manifestIn = (dir) => {
  writeFileSync(
    join(dir, 'sources.json'),
    JSON.stringify({
      schemaVersion: 3,
      recordedOn: '2026-08-23',
      productCommit: '6e211ddc4f27aed28f4864c7486d4410be44d2b9',
      snapshotKind: 'test',
      architecture: 'test',
      sourceRoot: '.',
      limitations: [],
      candidateActions: [],
      targets: [],
    })
  );
  return join(dir, 'sources.json');
};

describe('matrix manifest routing', () => {
  // The regression this covers: the staleness check was chained with a shell `&&`,
  // and npm appends forwarded arguments to the END of a compound command — so
  // `gen:performance-matrix -- <manifest>` handed the path to the CHECKER while the
  // generator wrote the default manifest, and the command exited 0 having verified
  // a different file than it produced.
  it('generates and checks the manifest it was given, not the default', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'splotch-matrix-'));

    await generateDeploymentMatrixReport(manifestIn(dir));

    for (const file of ['data.json', 'index.md', 'index.html']) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }
  });

  it('fails on a manifest that does not exist rather than falling back', async () => {
    await expect(
      generateDeploymentMatrixReport('/definitely/not/a/manifest.json')
    ).rejects.toThrow();
  });
});
