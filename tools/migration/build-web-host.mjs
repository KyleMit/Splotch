import { pathToFileURL } from 'node:url';
import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import {
  WEB_HOST_COPY_ROLES,
  assertWebHostVariant,
  webHostArtifact,
  WEB_HOST_INPUTS,
  WEB_HOST_RESULT,
  WEB_HOST_VARIANT,
} from '../../migration/probes/web-host/host/contract.ts';
import { copySource, freezeSource, assertSourceUnchanged, sha256 } from './lib/web-host-source.mjs';
import { copyDependencies, requireFrozenDependencies } from './lib/web-host-dependencies.mjs';
import {
  createOwnedArtifact,
  outputParent,
  ownedPath,
  writeOwnedJson,
} from './lib/web-host-ownership.mjs';
import { freezeGitMetadata, pinBuildMetadata } from './lib/web-host-metadata.mjs';
import { buildControlCopies } from './lib/web-host-build.mjs';
import { collectControlEvidence } from './lib/web-host-evidence.mjs';
import {
  captureInputBindings,
  withGeneratedInputs,
  assertFinalInputBindings,
} from './lib/web-host-inputs.mjs';
import { generatedSourcePaths } from './lib/web-host-generated.mjs';
import { assertBorrowedWitness, borrowedWriteWitness } from './lib/web-host-files.mjs';

export function parseWebHostArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      artifact: { type: 'string', default: 'release' },
      variant: { type: 'string', default: WEB_HOST_VARIANT },
      'topology-sha': { type: 'string' },
      'topology-lock-sha256': { type: 'string' },
      'output-parent': { type: 'string', default: tmpdir() },
      provisional: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  assertWebHostVariant(values.variant);
  return {
    artifact: webHostArtifact(values.artifact),
    topologySha: values['topology-sha'],
    topologyLockSha256: values['topology-lock-sha256'],
    outputParent: values['output-parent'],
    provisional: values.provisional,
  };
}

function materializeCopies(snapshot, modules, owned) {
  const copies = {};
  const dependencies = {};
  for (const role of WEB_HOST_COPY_ROLES) {
    const root = ownedPath(owned, role);
    copySource(snapshot, root);
    dependencies[role] = copyDependencies(modules, root);
    copies[role] = root;
  }
  return { copies, dependencies };
}

export async function buildWebHost(argv) {
  const options = parseWebHostArgs(argv);
  if (process.env.CAPACITOR === 'true') throw new Error('Web-host control refuses CAPACITOR=true');
  const sourceRoot = realpathSync(ROOT);
  const snapshot = freezeSource({ root: sourceRoot, ...options });
  const modules = requireFrozenDependencies(sourceRoot, snapshot.lockSha256);
  const parent = outputParent(sourceRoot, options.outputParent);
  const gitMetadata = freezeGitMetadata(snapshot);
  const before = borrowedWriteWitness(sourceRoot);
  const owned = createOwnedArtifact(parent);
  mkdirSync(ownedPath(owned, 'controls'));
  writeOwnedJson(owned, WEB_HOST_INPUTS, {
    artifact: options.artifact,
    variant: WEB_HOST_VARIANT,
    node: process.version,
    snapshot,
    gitMetadata,
    borrowedBefore: before,
  });
  console.log(`Owned web-host artifact: ${owned.root}`);
  try {
    const { copies, dependencies } = materializeCopies(snapshot, modules, owned);
    const initialBindings = captureInputBindings(owned, snapshot);
    const pinned = await pinBuildMetadata(copies.control, gitMetadata);
    const bindings = withGeneratedInputs(
      initialBindings,
      await generatedSourcePaths(owned, initialBindings)
    );
    const prepared = {
      artifact: options.artifact,
      variant: WEB_HOST_VARIANT,
      node: process.version,
      snapshot,
      gitMetadata,
      pinned,
      copies,
      dependencies,
      borrowedBefore: before,
    };
    writeOwnedJson(owned, WEB_HOST_INPUTS, { ...prepared, bindings });
    const built = await buildControlCopies({
      owned,
      copies,
      artifact: options.artifact,
      pinnedMetadata: pinned.env,
      bindings,
    });
    writeOwnedJson(owned, WEB_HOST_INPUTS, {
      ...prepared,
      bindings: built.bindings,
      scriptOwners: built.scriptOwners,
      invocation: built.invocation,
    });
    assertFinalInputBindings(owned, built.bindings);
    const [bundle, pwa] = await Promise.all([
      import(pathToFileURL(join(copies.control, 'tools/check-bundle-budgets.mjs')).href),
      import(pathToFileURL(join(copies.control, 'tools/check-pwa-precache.mjs')).href),
    ]);
    const owner = { bundle, pwa };
    const evidence = collectControlEvidence(
      owned,
      copies.reference,
      copies.control,
      pinned,
      owner,
      options.artifact
    );
    assertFinalInputBindings(owned, built.bindings);
    const after = borrowedWriteWitness(sourceRoot);
    assertBorrowedWitness(before, after);
    assertSourceUnchanged(snapshot);
    writeOwnedJson(owned, WEB_HOST_RESULT, {
      status: 'structural-build-only',
      reviewEvidenceEligible: !snapshot.provisional,
      artifact: options.artifact,
      sourceSha: snapshot.sha,
      topologySha: snapshot.topologySha,
      children: built.children,
      inputsSha256: sha256(readFileSync(ownedPath(owned, WEB_HOST_INPUTS))),
      evidence,
      borrowedAfter: after,
    });
    return owned.root;
  } catch (error) {
    let isolation;
    try {
      const after = borrowedWriteWitness(sourceRoot);
      assertBorrowedWitness(before, after);
      assertSourceUnchanged(snapshot);
      isolation = { unchanged: true, borrowedAfter: after };
    } catch (isolationError) {
      isolation = { unchanged: false, error: isolationError.message };
    }
    writeOwnedJson(owned, WEB_HOST_RESULT, {
      status: 'failed',
      isolation,
      error: error.message,
      child: error.childRecord ?? null,
    });
    throw error;
  }
}

if (isMain(import.meta.url)) runMain(() => buildWebHost(process.argv.slice(2)));
