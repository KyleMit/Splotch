import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { verifyArtifactIntegrity } from './archive-inventory.mjs';
import { getImporterDependencyPaths, readLockFile } from './lock-artifacts.mjs';
import { readPolicyYaml } from './topology-policy.mjs';

const INPUT_PATH = 'tools/migration/inputs/native-audio-reset-patch.json';
const INPUT_SHA256 = '21787c5a4c575782e925ea4410003fab6b0c06d2443fc6dfba7c73f30a61a59d';
const PATCH_IDENTITY = 'expo-audio@57.0.5';
const GENERATED_BIN_DIRECTORIES = new Set(['node_modules', 'node_modules/.bin']);

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function authenticatedFile(root, record, message) {
  const path = join(root, record.path);
  assert.ok(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), message);
  const bytes = readFileSync(path);
  assert.equal(digest(bytes), record.sha256, message);
  return bytes;
}

export function readAudioResetPatchInputs(root) {
  const path = join(root, INPUT_PATH);
  assert.ok(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink());
  const bytes = readFileSync(path);
  assert.equal(digest(bytes), INPUT_SHA256, 'Audio reset input bytes changed');
  const input = JSON.parse(bytes);
  assert.equal(input.schemaVersion, 1);
  assert.equal(input.identity, PATCH_IDENTITY);
  return input;
}

export function projectAudioResetPatch(lock, workspace, baseline, beforeWorkspace, input) {
  assert.equal(
    lock.patchedDependencies[PATCH_IDENTITY],
    input.patch.sha256,
    'Audio reset lock patch identity changed'
  );
  assert.equal(
    workspace.patchedDependencies[PATCH_IDENTITY],
    input.patch.path,
    'Audio reset workspace registration changed'
  );
  const oldEntry = baseline.importers[CANDIDATE_DIRECTORY].devDependencies['expo-audio'];
  const version = oldEntry.version.replace('57.0.5(', `57.0.5(patch_hash=${input.patch.sha256})(`);
  assert.deepEqual(
    lock.importers[CANDIDATE_DIRECTORY].devDependencies['expo-audio'],
    { ...oldEntry, version },
    'Audio reset importer changed'
  );
  const oldKey = `expo-audio@${oldEntry.version}`;
  const newKey = `expo-audio@${version}`;
  assert.ok(!Object.hasOwn(lock.snapshots, oldKey), 'Unpatched Audio snapshot retained');
  assert.deepEqual(
    lock.snapshots[newKey],
    baseline.snapshots[oldKey],
    'Audio reset snapshot contents changed'
  );
  const projectedLock = structuredClone(lock);
  delete projectedLock.patchedDependencies[PATCH_IDENTITY];
  projectedLock.importers[CANDIDATE_DIRECTORY].devDependencies['expo-audio'] =
    structuredClone(oldEntry);
  projectedLock.snapshots[oldKey] = projectedLock.snapshots[newKey];
  delete projectedLock.snapshots[newKey];
  assert.deepEqual(projectedLock, baseline, 'Unexpected Audio reset lock delta');
  const projectedWorkspace = structuredClone(workspace);
  delete projectedWorkspace.patchedDependencies[PATCH_IDENTITY];
  assert.deepEqual(projectedWorkspace, beforeWorkspace, 'Unexpected Audio reset workspace delta');
  return { lock: projectedLock, workspace: projectedWorkspace };
}

function installedInventory(directory) {
  const files = [];
  const links = [];
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      const member = relative(directory, child).split(sep).join('/');
      if (entry.isSymbolicLink()) links.push({ path: member, literal: readlinkSync(child) });
      else if (entry.isDirectory()) {
        if (member === 'node_modules' || member.startsWith('node_modules/'))
          assert.ok(
            GENERATED_BIN_DIRECTORIES.has(member),
            `Unexpected Audio generated directory: ${member}`
          );
        walk(child);
      } else {
        assert.ok(entry.isFile(), `Audio reset package source is not a file: ${child}`);
        const bytes = readFileSync(child);
        files.push({
          path: member,
          bytes: bytes.length,
          sha256: digest(bytes),
          mode: lstatSync(child).mode & 0o777,
        });
      }
    }
  }
  walk(directory);
  const byPath = (left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return { files: files.sort(byPath), links: links.sort(byPath) };
}

function qualifyGeneratedBinLinks(root, source, links, input) {
  assert.deepEqual(
    links,
    input.generatedBinLinks.map(({ path, literal }) => ({ path, literal })),
    'Installed Audio generated executable links changed'
  );
  const owner = realpathSync(root);
  for (const record of input.generatedBinLinks) {
    const path = join(source, record.path);
    assert.ok(existsSync(path), 'Audio generated executable target missing');
    const target = join(owner, record.target);
    assert.equal(
      realpathSync(path),
      target,
      'Audio generated executable target escaped or changed'
    );
    const info = lstatSync(target);
    assert.ok(info.isFile() && !info.isSymbolicLink(), 'Audio executable target is not a file');
    const bytes = readFileSync(target);
    assert.deepEqual(
      { bytes: bytes.length, sha256: digest(bytes), mode: info.mode & 0o777 },
      { bytes: record.bytes, sha256: record.sha256, mode: record.mode },
      'Audio generated executable target bytes or mode changed'
    );
  }
}

export function qualifyAudioResetPatch(root, input, audioInput) {
  authenticatedFile(
    root,
    { path: 'pnpm-lock.yaml', sha256: input.lockSha256 },
    'Unqualified audio reset lock'
  );
  authenticatedFile(
    root,
    { path: 'pnpm-workspace.yaml', sha256: input.workspaceSha256 },
    'Unqualified audio reset workspace'
  );
  const patch = authenticatedFile(root, input.patch, 'Audio reset patch bytes changed');
  assert.equal(patch.length, input.patch.bytes);
  assert.equal(
    input.baselineLock.sha256,
    audioInput.lockSha256,
    'Audio reset baseline differs from original Audio owner'
  );
  authenticatedFile(root, input.baselineLock, 'Audio reset baseline lock changed');
  authenticatedFile(root, input.baselineWorkspace, 'Audio reset baseline workspace changed');
  const record = audioInput.roots[0];
  assert.equal(input.archive.sha256, record.archiveSha256);
  assert.equal(input.archive.integrity, record.artifact.resolution.integrity);
  const archive = authenticatedFile(root, input.archive, 'Audio reset archive changed');
  verifyArtifactIntegrity(archive, input.archive.integrity);
  const require = createRequire(join(root, CANDIDATE_DIRECTORY, 'package.json'));
  const source = dirname(realpathSync(require.resolve('expo-audio/package.json')));
  const location = relative(realpathSync(root), source);
  assert.ok(
    !location.startsWith('../') && !location.startsWith('/'),
    'Audio reset source escapes owner'
  );
  const inventory = installedInventory(source);
  const actualFiles = inventory.files;
  assert.deepEqual(
    actualFiles,
    input.installedFiles,
    'Installed Audio reset package differs from authenticated patched archive'
  );
  qualifyGeneratedBinLinks(root, source, inventory.links, input);
  const lock = readLockFile(join(root, 'pnpm-lock.yaml'));
  const actualPaths = getImporterDependencyPaths(lock, 'node-forge@1.4.0');
  assert.deepEqual(actualPaths, audioInput.forgePaths, 'Unsupported audio reset Forge path');
  const projected = projectAudioResetPatch(
    lock,
    readPolicyYaml(join(root, 'pnpm-workspace.yaml')),
    readLockFile(join(root, input.baselineLock.path)),
    readPolicyYaml(join(root, input.baselineWorkspace.path)),
    input
  );
  return {
    ...projected,
    qualification: {
      inputPath: INPUT_PATH,
      inputSha256: INPUT_SHA256,
      actualLockSha256: input.lockSha256,
      baselineLockSha256: input.baselineLock.sha256,
      patchSha256: input.patch.sha256,
      installedPath: location,
      installedFiles: actualFiles.length,
      generatedBinLinks: input.generatedBinLinks,
      patchedSwiftSha256: input.patchedSwiftSha256,
      actualPaths,
      scope:
        'Exact released archive plus one iOS reset patch; all published source and four exact pnpm executable links checked before the three-field lock/workspace projection. No native compile, runtime, speaker or release-timing acceptance.',
    },
  };
}
