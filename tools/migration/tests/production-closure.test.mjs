import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { candidateOnlyPackageNames } from '../lib/lock-artifacts.mjs';
import {
  assertCandidateArchiveInventory,
  assertProductionClosure,
  assertShippingImports,
} from '../lib/topology-policy.mjs';

const fixtures = [];
afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

function artifactRow(name, version) {
  return {
    key: `${name}@${version}`,
    name,
    version,
    integrity: `sha512-${name}-${version}`,
    tarball: `https://registry.npmjs.org/${name}/-/fixture.tgz`,
    archiveIntegrityVerified: true,
    rootHookFiles: [],
    rootBindingGyp: false,
    hooks: {},
    disposition: 'no-install-hooks',
  };
}

function sharedLock(name, productionVersion, candidateVersion) {
  const packages = {
    'probe@2.0.0': { resolution: { integrity: artifactRow('probe', '2.0.0').integrity } },
  };
  const snapshots = { 'probe@2.0.0': { dependencies: { [name]: candidateVersion } } };
  for (const version of new Set([productionVersion, candidateVersion])) {
    packages[`${name}@${version}`] = {
      resolution: { integrity: artifactRow(name, version).integrity },
    };
    snapshots[`${name}@${version}`] = {};
  }
  return {
    importers: {
      '.': { dependencies: { [name]: { version: productionVersion } } },
      [CANDIDATE_DIRECTORY]: { devDependencies: { probe: { version: '2.0.0' } } },
    },
    packages,
    snapshots,
  };
}

function importFixture(specifier) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-production-names-'));
  fixtures.push(root);
  const files = {
    'web/src/main.ts': `import '${specifier}';`,
    'web/vite.config.ts': 'export default {};',
    'web/svelte.config.js': 'export default {};',
    'knip.production.json': JSON.stringify({ entry: [] }),
  };
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  mkdirSync(join(root, 'netlify/functions'), { recursive: true });
  return root;
}

describe('live production package-name boundary', () => {
  it.each(['shared', '@scope/shared'])('allows reviewed shared %s version updates', (name) => {
    const baselineKey = `${name}@1.0.0`;
    const lock = sharedLock(name, '1.1.0', '1.1.0');
    expect(assertProductionClosure(sharedLock(name, '1.0.0', '1.0.0'), [baselineKey])).toEqual({
      shippingArtifacts: 1,
      candidateArtifacts: 2,
      sharedArtifacts: 1,
    });
    expect(assertProductionClosure(lock, [baselineKey])).toEqual({
      shippingArtifacts: 1,
      candidateArtifacts: 2,
      sharedArtifacts: 1,
    });
    const baseline = {
      schemaVersion: 1,
      sourceRevision: 'a'.repeat(40),
      packages: {
        [baselineKey]: { resolution: { integrity: artifactRow(name, '1.0.0').integrity } },
      },
    };
    const inventory = {
      schemaVersion: 1,
      complete: true,
      inspectedArtifacts: 1,
      rows: [artifactRow('probe', '2.0.0')],
    };
    expect(() => assertCandidateArchiveInventory(inventory, lock, baseline)).toThrow(
      `Missing reviewed candidate archive: ${name}@1.1.0`
    );
    inventory.rows.push(artifactRow(name, '1.1.0'));
    inventory.inspectedArtifacts = inventory.rows.length;
    expect(() => assertCandidateArchiveInventory(inventory, lock, baseline)).not.toThrow();
  });

  it.each(['2.0.0', '3.0.0'])(
    'rejects a candidate-only name entering production at %s',
    (version) => {
      const lock = sharedLock('shared', '1.0.0', '1.0.0');
      expect(() => assertProductionClosure(lock, ['shared@1.0.0'])).not.toThrow();
      lock.packages[`probe@${version}`] = {
        resolution: { integrity: artifactRow('probe', version).integrity },
      };
      lock.snapshots[`probe@${version}`] ??= {};
      lock.importers['.'].dependencies.probe = { version };
      expect(() => assertProductionClosure(lock, ['shared@1.0.0'])).toThrow(
        `Candidate artifacts entered the shipping production graph: probe@${version}`
      );
    }
  );

  it('keeps a shipping import legal across different shared versions and rejects a candidate-only import', () => {
    const lock = sharedLock('shared', '1.0.0', '1.1.0');
    expect(() => assertProductionClosure(lock, ['shared@1.0.0'])).not.toThrow();
    expect(candidateOnlyPackageNames(lock)).toEqual(['probe']);
    const root = importFixture('shared');
    expect(() => assertShippingImports(root, candidateOnlyPackageNames(lock))).not.toThrow();
    writeFileSync(join(root, 'web/src/main.ts'), "import 'probe';");
    expect(() => assertShippingImports(root, candidateOnlyPackageNames(lock))).toThrow(
      'web/src/main.ts imports candidate-only probe'
    );
  });
});
