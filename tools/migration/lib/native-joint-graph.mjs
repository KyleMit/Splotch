import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { readLockFile } from './lock-artifacts.mjs';
import { readPolicyYaml } from './topology-policy.mjs';
import { qualifyAudioProjectedInputs } from './native-audio-qualification.mjs';
import {
  projectSvgBackdropPatch,
  readSvgBackdropPatchInputs,
  verifySvgBackdropPackage,
} from './native-svg-backdrop-patch.mjs';

const INPUT_PATH = 'tools/migration/inputs/native-joint-graph.json';
const INPUT_SHA256 = '0fadb5b1b4d9cf6ee417793ba224a9d041e4451232fba10bae25ffa297c77338';

function authenticatedFile(root, record) {
  const path = join(root, record.path);
  const info = lstatSync(path);
  const local = relative(realpathSync(root), realpathSync(path));
  assert.ok(
    info.isFile() && !info.isSymbolicLink() && info.nlink === 1,
    'Joint input is not an independent regular file'
  );
  assert.ok(
    local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local),
    'Joint input escapes owner'
  );
  const bytes = readFileSync(path);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    record.sha256,
    `Unqualified joint input: ${record.path}`
  );
  if (record.bytes !== undefined) assert.equal(bytes.length, record.bytes);
  return bytes;
}

export function readJointNativeProjection(root) {
  const input = JSON.parse(authenticatedFile(root, { path: INPUT_PATH, sha256: INPUT_SHA256 }));
  assert.equal(input.schemaVersion, 1);
  for (const record of input.files) authenticatedFile(root, record);
  const lock = readLockFile(join(root, 'pnpm-lock.yaml'));
  const workspace = readPolicyYaml(join(root, 'pnpm-workspace.yaml'));
  const svg = readSvgBackdropPatchInputs(root);
  const baseline = readLockFile(join(root, input.audioLock));
  assert.equal(
    baseline.packages[svg.identity].resolution.integrity,
    svg.archive.integrity,
    'Joint SVG archive changed'
  );
  const projected = projectSvgBackdropPatch(
    lock,
    workspace,
    baseline,
    readPolicyYaml(join(root, input.audioWorkspace)),
    svg
  );
  const identity = (path) => input.files.find((record) => record.path === path).sha256;
  return {
    svg,
    view: {
      source: {
        lockSha256: identity('pnpm-lock.yaml'),
        workspaceSha256: identity('pnpm-workspace.yaml'),
      },
      ...projected,
    },
    qualification: {
      inputPath: INPUT_PATH,
      inputSha256: INPUT_SHA256,
      actualLockSha256: identity('pnpm-lock.yaml'),
      actualWorkspaceSha256: identity('pnpm-workspace.yaml'),
      scope: input.scope,
    },
  };
}

export function qualifyJointNativeInputs(root) {
  const joint = readJointNativeProjection(root);
  const require = createRequire(join(root, CANDIDATE_DIRECTORY, 'package.json'));
  const source = dirname(realpathSync(require.resolve('react-native-svg/package.json')));
  const installed = verifySvgBackdropPackage(root, source, joint.svg);
  const audio = qualifyAudioProjectedInputs(root, joint.view);
  return {
    audio,
    qualification: {
      ...joint.qualification,
      svg: { installed, patchSha256: joint.svg.patch.sha256 },
    },
  };
}
