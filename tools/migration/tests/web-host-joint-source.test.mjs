import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { readPolicyYaml } from '../lib/topology-policy.mjs';
import { freezeSource, sha256 } from '../lib/web-host-source.mjs';
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
