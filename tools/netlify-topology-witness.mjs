import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { ROOT, isMain, runMain } from './lib/proc.mjs';
import { CANDIDATE_DIRECTORY } from './lib/native-candidate.mjs';
import { verifyNetlifyRuntime } from './lib/netlify-runtime.mjs';

import {
  TOPOLOGY_PROOF_BRANCH,
  PRODUCTION_INSTALL_CONTRACT,
  TOPOLOGY_INPUT_PATHS,
  TOPOLOGY_CONTEXTS,
  topologyArtifactKeys,
  assertTopologyGraph,
  TOPOLOGY_INSPECTION_SCOPE,
} from './migration/lib/netlify-topology-report.mjs';

export { TOPOLOGY_PROOF_BRANCH, PRODUCTION_INSTALL_CONTRACT };
const PROCESS_TIMEOUT_MS = 30_000;
const MAX_PROCESS_OUTPUT_BYTES = 1024 * 1024;

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function containedPath(root, path) {
  const canonical = realpathSync(path);
  const fromRoot = relative(root, canonical);
  assert.ok(
    fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`),
    `Path escapes checkout: ${path}`
  );
  assert.ok(!fromRoot.startsWith(sep), `Path escapes checkout: ${path}`);
  return canonical;
}

export function topologyProofContext(env) {
  if (env.BRANCH !== TOPOLOGY_PROOF_BRANCH) return false;
  assert.equal(env.NETLIFY, 'true', 'Named proof ref requires the actual Netlify context');
  assert.equal(env.CONTEXT, 'branch-deploy', 'Named proof ref must never use production context');
  assert.match(env.COMMIT_REF ?? '', /^[a-f0-9]{40}$/, 'Missing proof checkout identity');
  return true;
}

function installedPackages(root, candidate, contexts) {
  const visited = new Set();
  const visitedModules = new Set();
  const rows = [];
  function packageDirectory(path) {
    const canonical = containedPath(root, path);
    if (visited.has(canonical)) return;
    visited.add(canonical);
    const manifestPath = join(canonical, 'package.json');
    assert.ok(existsSync(manifestPath), `Installed package has no manifest: ${path}`);
    const manifest = json(containedPath(root, manifestPath));
    if (canonical !== candidate) {
      assert.equal(typeof manifest.name, 'string', `Installed package has no name: ${path}`);
      assert.equal(typeof manifest.version, 'string', `Installed package has no version: ${path}`);
      rows.push({ key: `${manifest.name}@${manifest.version}`, path: relative(root, canonical) });
    }
    modulesDirectory(join(canonical, 'node_modules'));
  }
  function modulesDirectory(path) {
    if (!existsSync(path)) return;
    const canonical = containedPath(root, path);
    if (visitedModules.has(canonical)) return;
    visitedModules.add(canonical);
    for (const entry of readdirSync(canonical, { withFileTypes: true })) {
      const target = join(canonical, entry.name);
      if (entry.name === '.pnpm') {
        containedPath(root, target);
        for (const stored of readdirSync(target, { withFileTypes: true })) {
          if (stored.isDirectory() || stored.isSymbolicLink())
            modulesDirectory(
              stored.name === 'node_modules'
                ? join(target, stored.name)
                : join(target, stored.name, 'node_modules')
            );
        }
      } else if (entry.name.startsWith('@')) {
        for (const scoped of readdirSync(containedPath(root, target)))
          packageDirectory(join(target, scoped));
      } else if (!entry.name.startsWith('.') && (entry.isDirectory() || entry.isSymbolicLink())) {
        packageDirectory(target);
      }
    }
  }
  for (const context of contexts) modulesDirectory(join(context, 'node_modules'));
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

function resolveInstalledMetadata(root, context, name) {
  const require = createRequire(join(context, 'package.json'));
  const directories = require.resolve.paths(name);
  assert.ok(directories, `Production dependency cannot resolve: ${name}`);
  for (const directory of directories) {
    const path = join(directory, name, 'package.json');
    if (!existsSync(path)) continue;
    const canonical = containedPath(root, path);
    const manifest = json(canonical);
    assert.equal(manifest.name, name, `Resolved package identity differs: ${name}`);
    return {
      key: `${manifest.name}@${manifest.version}`,
      path: relative(root, dirname(canonical)),
    };
  }
  throw new Error(`Missing required production package: ${name}`);
}

export function inspectNetlifyProductionInstall(rootDirectory, contract, facts) {
  assert.equal(
    topologyProofContext(facts.env),
    true,
    'Install inspection requires the named proof context'
  );
  const root = realpathSync(rootDirectory);
  assert.equal(facts.env.COMMIT_REF, facts.headSha, 'Netlify ref differs from the actual checkout');
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.candidateDirectory, CANDIDATE_DIRECTORY);
  const candidate = containedPath(root, join(root, CANDIDATE_DIRECTORY));
  for (const [key, path] of Object.entries(TOPOLOGY_INPUT_PATHS))
    assert.equal(
      sha256(containedPath(root, join(root, path))),
      contract[key],
      `Proof input changed: ${path}`
    );
  const manifest = json(join(root, 'package.json'));
  const candidateManifest = json(join(candidate, 'package.json'));
  assert.equal(candidateManifest.private, true, 'Candidate workspace must remain private');
  assert.equal(manifest.packageManager, contract.packageManager);
  verifyNetlifyRuntime(root, manifest, facts);
  const production = topologyArtifactKeys(contract.productionArtifacts, 'production');
  const direct = topologyArtifactKeys(contract.productionDirect, 'direct production');
  const exclusive = topologyArtifactKeys(
    contract.candidateExclusiveArtifacts,
    'candidate-exclusive'
  );
  assert.deepEqual(
    contract.productionDirect.map((row) => row.name).sort(),
    Object.keys(manifest.dependencies).sort(),
    'Direct production ownership differs'
  );
  for (const key of direct)
    assert.ok(production.has(key), `Direct package outside production closure: ${key}`);
  for (const key of exclusive)
    assert.ok(!production.has(key), `Invalid candidate-exclusive ownership: ${key}`);
  const contexts = TOPOLOGY_CONTEXTS.map((context) => join(root, context));
  const installed = installedPackages(root, candidate, contexts);
  for (const row of installed) {
    assert.ok(
      !exclusive.has(row.key),
      `Candidate-exclusive installed contamination: ${row.key} at ${row.path}`
    );
    assert.ok(
      production.has(row.key),
      `Installed package outside production graph: ${row.key} at ${row.path}`
    );
  }
  const resolutions = contexts.flatMap((context) =>
    contract.productionDirect.map((row) => {
      const resolved = resolveInstalledMetadata(root, context, row.name);
      assert.equal(
        resolved.key,
        row.key,
        `Production dependency version differs from ${relative(root, context)}: ${row.name}`
      );
      return { context: relative(root, context) || '.', ...resolved };
    })
  );
  const record = {
    disposition: 'production-installed-tree-passed',
    proofBranch: TOPOLOGY_PROOF_BRANCH,
    context: facts.env.CONTEXT,
    commit: facts.headSha,
    nodeVersion: facts.nodeVersion,
    packageManager: manifest.packageManager,
    packageManagerVersion: facts.packageManagerVersion,
    productionFlags: facts.env.PNPM_FLAGS,
    ...Object.fromEntries(Object.keys(TOPOLOGY_INPUT_PATHS).map((key) => [key, contract[key]])),
    candidateExclusiveArtifactCount: exclusive.size,
    installedPackageCount: installed.length,
    installed,
    resolutions,
    scope: TOPOLOGY_INSPECTION_SCOPE,
  };
  assertTopologyGraph(record, contract);
  return record;
}

export function runNetlifyTopologyWitness() {
  if (!topologyProofContext(process.env)) return { disposition: 'not-the-selected-proof-ref' };
  const options = {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: PROCESS_TIMEOUT_MS,
    maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
  };
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], options).trim();
  const packageManagerVersion = execFileSync('pnpm', ['--version'], {
    ...options,
    env: { ...process.env, COREPACK_ENABLE_NETWORK: '0' },
  }).trim();
  return inspectNetlifyProductionInstall(ROOT, json(join(ROOT, PRODUCTION_INSTALL_CONTRACT)), {
    env: process.env,
    headSha,
    nodeVersion: process.version,
    packageManagerVersion,
  });
}

if (isMain(import.meta.url))
  runMain(async () => console.log(JSON.stringify(runNetlifyTopologyWitness())));
