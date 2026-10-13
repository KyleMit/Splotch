import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { readPolicyYaml } from '../lib/topology-policy.mjs';
import { freezeSource, sha256, sourceGitBytes } from '../lib/web-host-source.mjs';
import { requireFrozenDependencies } from '../lib/web-host-dependencies.mjs';

const control = vi.hoisted(() => ({ field: null }));
vi.mock('../lib/native-joint-graph.mjs', async (original) => {
  const actual = await original();
  return {
    ...actual,
    qualifyJointNativeInputs(root) {
      const joint = actual.qualifyJointNativeInputs(root);
      if (control.field === 'baseline') joint.audio.baselineLockSha256 = '0'.repeat(64);
      if (control.field === 'actual') joint.qualification.actualLockSha256 = '0'.repeat(64);
      return joint;
    },
  };
});
const root = join(import.meta.dirname, '../../..');
const env = readPolicyYaml(join(root, '.github/workflows/test.yml')).jobs[
  'retained-web-host-control'
].env;
const options = {
  root,
  topologySha: env.TOPOLOGY_SHA,
  topologyLockSha256: env.TOPOLOGY_LOCK_SHA256,
  provisional: true,
};
afterEach(() => {
  control.field = null;
});
it('freezes the actual installed joint graph with its real lock and complete native provenance', () => {
  const snapshot = freezeSource(options);
  expect(snapshot.lockSha256).toBe(sha256(readFileSync(join(root, 'pnpm-lock.yaml'))));
  expect(snapshot.lockSha256).not.toBe(snapshot.topologyLockSha256);
  expect(snapshot.nativeQualification.audio.baselineLockSha256).toBe(snapshot.topologyLockSha256);
  expect(snapshot.nativeQualification.audio.patchQualification.installedFiles).toBe(190);
  expect(snapshot.nativeQualification.qualification.svg.installed.files).toBeGreaterThan(0);
  expect(snapshot.nativeQualification.qualification.actualLockSha256).toBe(snapshot.lockSha256);
  expect(requireFrozenDependencies(root, snapshot.lockSha256)).toBe(join(root, 'node_modules'));
});
it.each(['baseline', 'actual'])(
  'refuses changed %s identity after real whole-joint qualification',
  (field) => {
    control.field = field;
    let failure;
    try {
      freezeSource(options);
    } catch (error) {
      failure = error;
    }
    expect(failure?.message).toContain('joint native qualification failed');
    expect(failure?.cause?.message).toMatch(
      field === 'baseline' ? /baseline differs/ : /actual source inputs/
    );
  }
);

const DEFAULT_EXEC_OUTPUT_MAX_BYTES = 1024 * 1024;
const PATCH_FIXTURE_BYTES = 2 * DEFAULT_EXEC_OUTPUT_MAX_BYTES;
it('freezes a real patch above the default exec buffer and preserves raw Git blob bytes', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'splotch-source-bound-'));
  const git = (...args) => execFileSync('git', ['-C', fixture, ...args]);
  const binary = Buffer.from([0, 255, 128, 254]);
  try {
    git('init', '--quiet');
    writeFileSync(join(fixture, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    writeFileSync(join(fixture, 'payload.txt'), 'original\n');
    writeFileSync(join(fixture, 'raw.bin'), binary);
    git('add', '.');
    git(
      '-c',
      'user.name=Source fixture',
      '-c',
      'user.email=source@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'source fixture'
    );
    const topologySha = git('rev-parse', 'HEAD').toString().trim();
    writeFileSync(join(fixture, 'payload.txt'), Buffer.alloc(PATCH_FIXTURE_BYTES, 97));
    const patch = sourceGitBytes(fixture, ['diff', '--binary', 'HEAD']);
    expect(Buffer.isBuffer(patch)).toBe(true);
    expect(patch.length).toBeGreaterThan(DEFAULT_EXEC_OUTPUT_MAX_BYTES);
    expect(sourceGitBytes(fixture, ['show', 'HEAD:raw.bin'])).toEqual(binary);
    expect(() => git('diff', '--binary', 'HEAD')).toThrow(/ENOBUFS/);
    const frozen = freezeSource({
      root: fixture,
      topologySha,
      topologyLockSha256: sha256(readFileSync(join(fixture, 'pnpm-lock.yaml'))),
      provisional: true,
    });
    expect(frozen.patchSha256).toBe(sha256(patch));
    expect(frozen.entries.find((entry) => entry.path === 'payload.txt').sha256).toBe(
      sha256(Buffer.alloc(PATCH_FIXTURE_BYTES, 97))
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
