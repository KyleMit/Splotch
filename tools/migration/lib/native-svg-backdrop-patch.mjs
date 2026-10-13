import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { readLockFile } from './lock-artifacts.mjs';
import { readPolicyYaml } from './topology-policy.mjs';

const INPUT_PATH = 'tools/migration/inputs/native-svg-backdrop-patch.json';
const INPUT_SHA256 = '5d594882da710ac0b0e10da485600f2a26bd748dc7b4e2f3df300bbf44f569a8';
const PATCH_IDENTITY = 'react-native-svg@15.15.4';

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function contained(root, path, message) {
  const location = relative(realpathSync(root), realpathSync(path));
  assert.ok(
    location !== '..' && !location.startsWith(`..${sep}`) && !isAbsolute(location),
    message
  );
  return location.split(sep).join('/');
}

function authenticatedFile(root, record, message) {
  const path = join(root, record.path);
  const stat = lstatSync(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), message);
  contained(root, path, message);
  const bytes = readFileSync(path);
  assert.equal(digest(bytes), record.sha256, message);
  return bytes;
}

export function readSvgBackdropPatchInputs(root) {
  const bytes = authenticatedFile(
    root,
    { path: INPUT_PATH, sha256: INPUT_SHA256 },
    'SVG backdrop input changed'
  );
  const input = JSON.parse(bytes);
  assert.equal(input.schemaVersion, 1);
  assert.equal(input.identity, PATCH_IDENTITY);
  assert.equal(input.version, '15.15.4');
  return input;
}

export function projectSvgBackdropPatch(lock, workspace, baseline, beforeWorkspace, input) {
  assert.equal(
    lock.patchedDependencies?.[PATCH_IDENTITY],
    input.patch.sha256,
    'SVG lock patch changed'
  );
  assert.equal(
    workspace.patchedDependencies?.[PATCH_IDENTITY],
    input.patch.path,
    'SVG patch registration changed'
  );
  const previous = baseline.importers[CANDIDATE_DIRECTORY].devDependencies['react-native-svg'];
  assert.equal(previous.specifier, input.version);
  assert.ok(previous.version.startsWith(`${input.version}(`));
  const version = previous.version.replace(
    `${input.version}(`,
    `${input.version}(patch_hash=${input.patch.sha256})(`
  );
  assert.deepEqual(
    lock.importers[CANDIDATE_DIRECTORY].devDependencies['react-native-svg'],
    { ...previous, version },
    'SVG importer changed'
  );
  const oldKey = `react-native-svg@${previous.version}`;
  const newKey = `react-native-svg@${version}`;
  assert.ok(!Object.hasOwn(lock.snapshots, oldKey), 'Unpatched SVG snapshot retained');
  assert.deepEqual(
    lock.snapshots[newKey],
    baseline.snapshots[oldKey],
    'SVG snapshot contents changed'
  );
  const projectedLock = structuredClone(lock);
  delete projectedLock.patchedDependencies[PATCH_IDENTITY];
  projectedLock.importers[CANDIDATE_DIRECTORY].devDependencies['react-native-svg'] =
    structuredClone(previous);
  projectedLock.snapshots[oldKey] = projectedLock.snapshots[newKey];
  delete projectedLock.snapshots[newKey];
  assert.deepEqual(projectedLock, baseline, 'Unexpected SVG lock delta');
  const projectedWorkspace = structuredClone(workspace);
  delete projectedWorkspace.patchedDependencies[PATCH_IDENTITY];
  assert.deepEqual(projectedWorkspace, beforeWorkspace, 'Unexpected SVG workspace delta');
  return { lock: projectedLock, workspace: projectedWorkspace };
}

export function verifySvgBackdropPackage(root, directory, input) {
  const location = contained(root, directory, 'SVG package escapes owner');
  const files = [];
  const allowedDirectories = new Set([...input.sourceDirectories, ...input.generatedDirectories]);
  const directories = [];
  const generated = [];
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      const local = relative(directory, child).split(sep).join('/');
      if (entry.isSymbolicLink()) {
        const record = input.generatedPeerBins.find((item) => item.path === local);
        assert.ok(record, `Unreviewed SVG source link: ${local}`);
        assert.equal(readlinkSync(child), record.literal, `SVG generated link changed: ${local}`);
        assert.equal(
          realpathSync(child),
          join(realpathSync(root), record.target.path),
          `SVG generated target escapes owner: ${local}`
        );
        const target = join(root, record.target.path);
        const bytes = authenticatedFile(
          root,
          record.target,
          `SVG generated target bytes changed: ${local}`
        );
        const stat = lstatSync(target);
        assert.equal(stat.nlink, 1, `SVG generated target is not independent: ${local}`);
        assert.equal(
          stat.mode & 0o777,
          record.target.mode,
          `SVG generated target mode changed: ${local}`
        );
        assert.equal(
          bytes.length,
          record.target.bytes,
          `SVG generated target size changed: ${local}`
        );
        generated.push(local);
      } else if (entry.isDirectory()) {
        directories.push(local);
        assert.ok(allowedDirectories.has(local), `Unreviewed SVG directory: ${local}`);
        walk(child);
      } else {
        const stat = lstatSync(child);
        assert.ok(
          stat.isFile() && stat.nlink === 1,
          `SVG source is not an independent regular file: ${local}`
        );
        const bytes = readFileSync(child);
        files.push({
          path: local,
          bytes: bytes.length,
          mode: stat.mode & 0o777,
          sha256: digest(bytes),
        });
      }
    }
  }
  walk(directory);
  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  assert.deepEqual(files, input.installedFiles, 'Effective SVG package source changed');
  assert.deepEqual(
    directories.sort(),
    [...allowedDirectories].sort(),
    'SVG directory inventory changed'
  );
  assert.deepEqual(
    generated.sort(),
    input.generatedPeerBins.map((record) => record.path).sort(),
    'SVG generated links changed'
  );
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'react-native-svg');
  assert.equal(manifest.version, input.version);
  return { path: location, files: files.length, generatedPeerBins: generated };
}

export function qualifySvgBackdropPatch(root) {
  const input = readSvgBackdropPatchInputs(root);
  authenticatedFile(
    root,
    { path: 'pnpm-lock.yaml', sha256: input.lockSha256 },
    'Unqualified SVG lock'
  );
  authenticatedFile(
    root,
    { path: 'pnpm-workspace.yaml', sha256: input.workspaceSha256 },
    'Unqualified SVG workspace'
  );
  const patch = authenticatedFile(root, input.patch, 'SVG backdrop patch bytes changed');
  assert.equal(patch.length, input.patch.bytes);
  authenticatedFile(root, input.baselineLock, 'SVG inherited lock changed');
  authenticatedFile(root, input.baselineWorkspace, 'SVG inherited workspace changed');
  const lock = readLockFile(join(root, 'pnpm-lock.yaml'));
  const baseline = readLockFile(join(root, input.baselineLock.path));
  assert.equal(
    baseline.packages[PATCH_IDENTITY].resolution.integrity,
    input.archive.integrity,
    'SVG source archive integrity changed'
  );
  const workspace = readPolicyYaml(join(root, 'pnpm-workspace.yaml'));
  const projected = projectSvgBackdropPatch(
    lock,
    workspace,
    baseline,
    readPolicyYaml(join(root, input.baselineWorkspace.path)),
    input
  );
  const require = createRequire(join(root, CANDIDATE_DIRECTORY, 'package.json'));
  const directory = dirname(realpathSync(require.resolve('react-native-svg/package.json')));
  const installed = verifySvgBackdropPackage(root, directory, input);
  return {
    ...projected,
    baselineLockSha256: input.originalLockSha256,
    qualification: {
      inputPath: INPUT_PATH,
      inputSha256: INPUT_SHA256,
      actualLockSha256: input.lockSha256,
      patchSha256: input.patch.sha256,
      installed,
      scope: input.scope,
    },
  };
}
