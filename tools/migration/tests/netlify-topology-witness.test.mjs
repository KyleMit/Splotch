import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PRODUCTION_INSTALL_CONTRACT,
  TOPOLOGY_PROOF_BRANCH,
  inspectNetlifyProductionInstall,
  runNetlifyTopologyWitness,
  topologyProofContext,
} from '../../netlify-topology-witness.mjs';
import { ROOT } from '../../lib/proc.mjs';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';

const CLI_TIMEOUT_MS = 30_000;
const roots = [];
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const artifact = (name, version) => ({ key: `${name}@${version}`, name, version });

function put(root, relative, value) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-topology-witness-'));
  roots.push(root);
  put(root, 'package.json', {
    packageManager: 'pnpm@11.22.0',
    engines: { node: '>=22.13.0' },
    dependencies: { required: '2.0.0' },
  });
  put(root, `${CANDIDATE_DIRECTORY}/package.json`, {
    name: '@splotch/native-architecture',
    private: true,
    devDependencies: { expo: '57.0.26' },
  });
  put(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  put(root, 'pnpm-workspace.yaml', 'nodeLinker: hoisted\n');
  put(root, 'netlify.toml', '[build.environment]\nNODE_VERSION = "22"\nPNPM_FLAGS = "--prod"\n');
  put(root, 'node_modules/required/package.json', { name: 'required', version: '2.0.0' });
  put(root, 'node_modules/required/node_modules/shared/package.json', {
    name: 'shared',
    version: '1.0.0',
  });
  for (const path of ['web', 'netlify/functions', 'tools'])
    mkdirSync(join(root, path), { recursive: true });
  const hashes = {
    lockSha256: 'pnpm-lock.yaml',
    rootManifestSha256: 'package.json',
    candidateManifestSha256: `${CANDIDATE_DIRECTORY}/package.json`,
    workspaceSha256: 'pnpm-workspace.yaml',
    netlifyConfigSha256: 'netlify.toml',
  };
  const contract = {
    schemaVersion: 1,
    candidateDirectory: CANDIDATE_DIRECTORY,
    packageManager: 'pnpm@11.22.0',
    ...Object.fromEntries(
      Object.entries(hashes).map(([key, path]) => [key, sha256(join(root, path))])
    ),
    productionArtifacts: [artifact('required', '2.0.0'), artifact('shared', '1.0.0')],
    productionDirect: [artifact('required', '2.0.0')],
    candidateExclusiveArtifacts: [artifact('expo', '57.0.26')],
  };
  const headSha = '1'.repeat(40);
  const facts = {
    headSha,
    nodeVersion: 'v22.23.2',
    packageManagerVersion: '11.22.0',
    env: {
      NETLIFY: 'true',
      CONTEXT: 'branch-deploy',
      BRANCH: TOPOLOGY_PROOF_BRANCH,
      COMMIT_REF: headSha,
      PNPM_FLAGS: '--prod',
    },
  };
  return { root, contract, facts };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Netlify topology production-install observer', () => {
  it('accepts a clean production tree with a legitimate shared nested dependency', () => {
    const { root, contract, facts } = fixture();
    const result = inspectNetlifyProductionInstall(root, contract, facts);
    expect(result.disposition).toBe('production-installed-tree-passed');
    expect(result.installedPackageCount).toBe(2);
    expect(result.resolutions).toHaveLength(5);
    expect(result.installed.some((row) => row.key === 'shared@1.0.0')).toBe(true);
  });

  it.each([
    'node_modules/expo/package.json',
    'node_modules/required/node_modules/expo/package.json',
    'node_modules/.pnpm/expo@57.0.26/node_modules/expo/package.json',
    `${CANDIDATE_DIRECTORY}/node_modules/expo/package.json`,
    'web/node_modules/expo/package.json',
    'netlify/functions/node_modules/expo/package.json',
    'tools/node_modules/expo/package.json',
  ])('rejects installed candidate contamination at %s without pruning it', (path) => {
    const { root, contract, facts } = fixture();
    put(root, path, { name: 'expo', version: '57.0.26' });
    const before = readFileSync(join(root, path), 'utf8');
    expect(() => inspectNetlifyProductionInstall(root, contract, facts)).toThrow(
      'Candidate-exclusive installed contamination'
    );
    expect(readFileSync(join(root, path), 'utf8')).toBe(before);
  });

  it('rejects a package manifest that resolves outside the checkout', () => {
    const { root, contract, facts } = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'splotch-topology-outside-'));
    roots.push(outside);
    put(outside, 'package.json', { name: 'shared', version: '1.0.0' });
    const manifest = join(root, 'node_modules/required/node_modules/shared/package.json');
    rmSync(manifest);
    symlinkSync(join(outside, 'package.json'), manifest);
    expect(() => inspectNetlifyProductionInstall(root, contract, facts)).toThrow(
      'Path escapes checkout'
    );
  });

  it('inspects symlinked package-store entries for candidate contamination', () => {
    const { root, contract, facts } = fixture();
    put(root, 'store/expo@57.0.26/node_modules/expo/package.json', {
      name: 'expo',
      version: '57.0.26',
    });
    mkdirSync(join(root, 'node_modules/.pnpm'), { recursive: true });
    symlinkSync(join(root, 'store/expo@57.0.26'), join(root, 'node_modules/.pnpm/expo@57.0.26'));
    expect(() => inspectNetlifyProductionInstall(root, contract, facts)).toThrow(
      'Candidate-exclusive installed contamination'
    );
  });

  it('terminates on an in-checkout package-store symlink cycle', () => {
    const { root, contract, facts } = fixture();
    mkdirSync(join(root, 'node_modules/.pnpm'), { recursive: true });
    symlinkSync(root, join(root, 'node_modules/.pnpm/loop'));
    expect(inspectNetlifyProductionInstall(root, contract, facts).installedPackageCount).toBe(2);
  });

  it('accepts the private candidate workspace alias without counting it as an external artifact', () => {
    const { root, contract, facts } = fixture();
    mkdirSync(join(root, 'node_modules/@splotch'), { recursive: true });
    symlinkSync(
      join(root, CANDIDATE_DIRECTORY),
      join(root, 'node_modules/@splotch/native-architecture')
    );
    expect(inspectNetlifyProductionInstall(root, contract, facts).installedPackageCount).toBe(2);
  });

  it('rejects cached development packages outside the complete production graph', () => {
    const { root, contract, facts } = fixture();
    put(root, 'node_modules/old-dev/package.json', { name: 'old-dev', version: '1.0.0' });
    expect(() => inspectNetlifyProductionInstall(root, contract, facts)).toThrow(
      'outside production graph'
    );
  });

  it('rejects a missing direct production dependency', () => {
    const { root, contract, facts } = fixture();
    rmSync(join(root, 'node_modules/required'), { recursive: true });
    expect(() => inspectNetlifyProductionInstall(root, contract, facts)).toThrow(
      'Missing required production package'
    );
  });

  it('rejects input changes, an unreviewed record and a wrong checked-out commit', () => {
    const { root, contract, facts } = fixture();
    expect(() =>
      inspectNetlifyProductionInstall(root, { ...contract, lockSha256: 'wrong' }, facts)
    ).toThrow('Proof input changed');
    expect(() =>
      inspectNetlifyProductionInstall(root, { ...contract, schemaVersion: 2 }, facts)
    ).toThrow();
    expect(() =>
      inspectNetlifyProductionInstall(root, contract, { ...facts, headSha: '2'.repeat(40) })
    ).toThrow('actual checkout');
    put(root, 'pnpm-workspace.yaml', 'nodeLinker: isolated\n');
    expect(() => inspectNetlifyProductionInstall(root, contract, facts)).toThrow(
      'Proof input changed'
    );
  });

  it.each([{ CONTEXT: 'production' }, { NETLIFY: 'false' }, { COMMIT_REF: 'missing' }])(
    'fails the named proof ref in an invalid service context %j',
    (change) => {
      const { facts } = fixture();
      expect(() => topologyProofContext({ ...facts.env, ...change })).toThrow();
    }
  );

  it('refuses wrong production flags, package manager and Node runtime', () => {
    const { root, contract, facts } = fixture();
    for (const change of [
      { env: { ...facts.env, PNPM_FLAGS: '--filter app' } },
      { packageManagerVersion: '11.21.0' },
      { nodeVersion: 'v22.12.0' },
      { nodeVersion: 'v24.16.0' },
    ])
      expect(() =>
        inspectNetlifyProductionInstall(root, contract, { ...facts, ...change })
      ).toThrow();
  });

  it('remains a no-op outside the selected proof ref before reading evidence', () => {
    expect(topologyProofContext({ NETLIFY: 'true', CONTEXT: 'production', BRANCH: 'main' })).toBe(
      false
    );
    expect(topologyProofContext({ BRANCH: 'codex/migration-05-native-topology' })).toBe(false);
    expect(runNetlifyTopologyWitness()).toEqual({ disposition: 'not-the-selected-proof-ref' });
  });

  it('exits successfully when the real CLI runs outside the selected proof ref', () => {
    const result = spawnSync(process.execPath, [join(ROOT, 'tools/netlify-topology-witness.mjs')], {
      env: { ...process.env, BRANCH: 'codex/migration-05-native-topology' },
      encoding: 'utf8',
      timeout: CLI_TIMEOUT_MS,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({ disposition: 'not-the-selected-proof-ref' });
  });

  it('fails the real CLI before inspection in a wrong proof service context', () => {
    const result = spawnSync(process.execPath, [join(ROOT, 'tools/netlify-topology-witness.mjs')], {
      env: { ...process.env, BRANCH: TOPOLOGY_PROOF_BRANCH, NETLIFY: 'false' },
      encoding: 'utf8',
      timeout: CLI_TIMEOUT_MS,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Named proof ref requires the actual Netlify context');
  });

  it('runs as the first prebuild action and its exact evidence path exists', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(manifest.scripts.prebuild).toMatch(/^node tools\/netlify-topology-witness\.mjs && /);
    expect(readFileSync(join(ROOT, PRODUCTION_INSTALL_CONTRACT), 'utf8')).toContain(
      '"schemaVersion": 1'
    );
  });
});
