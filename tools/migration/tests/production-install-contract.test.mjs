import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import {
  deriveProductionInstallContract,
  assertProductionInstallContract,
} from '../lib/production-install-contract.mjs';

const fixtures = [];
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-install-contract-test-')));
  fixtures.push(root);
  mkdirSync(join(root, CANDIDATE_DIRECTORY), { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ packageManager: 'pnpm@11.22.0', dependencies: { shared: '1.0.0' } })
  );
  writeFileSync(join(root, `${CANDIDATE_DIRECTORY}/package.json`), '{}');
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'nodeLinker: hoisted');
  writeFileSync(join(root, 'netlify.toml'), '[build]');
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'reviewed-lock-fixture');
  const lock = {
    importers: {
      '.': { dependencies: { shared: { version: '1.0.0' } } },
      [CANDIDATE_DIRECTORY]: { devDependencies: { probe: { version: '2.0.0(shared@1.0.0)' } } },
    },
    packages: {
      'shared@1.0.0': { resolution: { integrity: 'sha512-shared' } },
      'probe@2.0.0': { resolution: { integrity: 'sha512-probe' } },
    },
    snapshots: {
      'shared@1.0.0': {},
      'probe@2.0.0(shared@1.0.0)': { dependencies: { shared: '1.0.0' } },
    },
  };
  return { root, lock };
}
afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

describe('production install contract owner binding', () => {
  it('distinguishes shared production artifacts and binds manifests/workspace/Netlify bytes', () => {
    const { root, lock } = fixture();
    const record = deriveProductionInstallContract(root, lock);
    expect(record.productionDirect).toEqual([
      { key: 'shared@1.0.0', name: 'shared', version: '1.0.0' },
    ]);
    expect(record.candidateExclusiveArtifacts).toEqual([
      { key: 'probe@2.0.0', name: 'probe', version: '2.0.0' },
    ]);
    expect(() => assertProductionInstallContract(record, root, lock)).not.toThrow();
    writeFileSync(join(root, 'netlify.toml'), '[build]\ncommand="changed"');
    expect(() => assertProductionInstallContract(record, root, lock)).toThrow('reviewed owners');
  });

  it('rejects missing artifact rows and manifest/lock dependency-owner divergence', () => {
    const { root, lock } = fixture();
    const record = deriveProductionInstallContract(root, lock);
    record.productionArtifacts = [];
    expect(() => assertProductionInstallContract(record, root, lock)).toThrow('reviewed owners');
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ packageManager: 'pnpm@11.22.0', dependencies: { leaked: '1.0.0' } })
    );
    expect(() => deriveProductionInstallContract(root, lock)).toThrow(
      'manifest and lock ownership'
    );
  });
});
