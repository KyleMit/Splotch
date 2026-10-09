import { verifyForgeMitigation } from './lib/forge-mitigation.mjs';
import {
  projectDrawingForgeLock,
  readDrawingForgeInputs,
} from './lib/native-drawing-forge-paths.mjs';
import { readDrawingArchiveInventory } from './lib/native-drawing-inventory.mjs';
import { CANDIDATE_DIRECTORY } from '../lib/native-candidate.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { artifactMap, candidateOnlyPackageNames, readLockFile } from './lib/lock-artifacts.mjs';
import {
  assertCandidateManifest,
  assertDeclaredCandidateImports,
  inspectNativeIdentities,
  readJson,
} from './lib/native-identity.mjs';
import {
  inspectNativeConfig,
  inspectShippingPluginPaths,
  runCandidateNode,
} from './lib/native-config.mjs';
import {
  assertAlignmentUpdateOwner,
  assertCandidateArchiveInventory,
  assertJavaScriptLocks,
  assertProductionClosure,
  assertShippingImports,
  assertWorkspacePolicy,
  readPolicyYaml,
} from './lib/topology-policy.mjs';

export async function checkNativeTopology(argv) {
  assert.deepEqual(argv, [], 'This ownership checker takes no arguments');
  const root = realpathSync(ROOT);
  const candidate = realpathSync(join(root, CANDIDATE_DIRECTORY));
  const evidence = join(root, 'docs/migration/evidence/native-topology-05');
  const alignment = readJson(join(candidate, 'alignment.json'));
  const manifest = readJson(join(candidate, 'package.json'));
  assertCandidateManifest(manifest, alignment);
  const candidateImports = assertDeclaredCandidateImports(candidate, manifest);
  const workspace = readPolicyYaml(join(root, 'pnpm-workspace.yaml'));
  assertWorkspacePolicy(workspace);
  assertJavaScriptLocks(
    execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
  );
  assertAlignmentUpdateOwner(readPolicyYaml(join(root, '.github/dependabot.yml')), alignment);
  const lock = readLockFile(join(root, 'pnpm-lock.yaml'));
  const drawingForge = projectDrawingForgeLock(lock, manifest, readDrawingForgeInputs(root));
  const forgeMitigation = await verifyForgeMitigation(root, drawingForge.lock, workspace);
  const lockSha256 = createHash('sha256')
    .update(readFileSync(join(root, 'pnpm-lock.yaml')))
    .digest('hex');
  const drawingArchives = readDrawingArchiveInventory(
    root,
    lock,
    lockSha256,
    readJson(join(evidence, 'script-inventory.json'))
  );
  const inventory = assertCandidateArchiveInventory(
    drawingArchives.inventory,
    lock,
    readJson(join(evidence, 'baseline-artifact-resolutions.json'))
  );
  const production = assertProductionClosure(
    lock,
    readJson(join(evidence, 'baseline-production-artifacts.json')).artifacts
  );
  const shippingImports = assertShippingImports(root, candidateOnlyPackageNames(lock));
  const identities = inspectNativeIdentities(candidate, alignment);
  const config = inspectNativeConfig(root, candidate, identities, lock);
  runCandidateNode(root, [
    join(root, 'node_modules/typescript/bin/tsc'),
    '--project',
    join(candidate, 'tsconfig.json'),
    '--noEmit',
  ]);
  const transform = JSON.parse(
    runCandidateNode(root, [join(candidate, 'scripts/check-transform.cjs')])
  );
  const graphMetroVersions = [...artifactMap(lock).values()]
    .filter((artifact) => artifact.name === 'metro')
    .map((artifact) => artifact.version)
    .sort();
  const shipping = inspectShippingPluginPaths(root);
  return {
    scope: 'Candidate topology only; no native compile, mount, performance or upgrade result',
    lockSha256,
    candidateImports,
    forgeMitigation: {
      ...forgeMitigation,
      lockedPaths: drawingForge.provenance.actualLockedPaths,
      n1DrawingInputs: drawingForge.provenance,
    },
    inventory: { ...inventory, drawingInputs: drawingArchives.qualification },
    production,
    shippingImports,
    identities,
    config,
    transform,
    graphMetroVersions,
    shipping,
  };
}

if (isMain(import.meta.url))
  runMain(async () => {
    console.log(JSON.stringify(await checkNativeTopology(process.argv.slice(2)), null, 2));
  });
