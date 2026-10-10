import { afterEach, describe, expect, it } from 'vitest';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { stringify } from 'yaml';
import { readLockFile } from '../lib/lock-artifacts.mjs';
import { readPolicyYaml } from '../lib/topology-policy.mjs';
import { readJointNativeProjection, qualifyJointNativeInputs } from '../lib/native-joint-graph.mjs';
import { projectSvgBackdropPatch } from '../lib/native-svg-backdrop-patch.mjs';

const root = join(import.meta.dirname, '../../..');
const inputPath = 'tools/migration/inputs/native-joint-graph.json';
const input = JSON.parse(readFileSync(join(root, inputPath)));
const fixtures = [];
function fixture() {
  const path = mkdtempSync(join(tmpdir(), 'splotch-joint-graph-'));
  fixtures.push(path);
  for (const name of [
    inputPath,
    'tools/migration/inputs/native-svg-backdrop-patch.json',
    ...input.files.map(({ path }) => path),
  ]) {
    mkdirSync(dirname(join(path, name)), { recursive: true });
    copyFileSync(join(root, name), join(path, name));
  }
  return path;
}
afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

describe('the consumed whole-joint graph boundary before the Audio projection', () => {
  it('projects the supported emitted SVG delta to exact Audio72 without mutating actual inputs', () => {
    const lock = readFileSync(join(root, 'pnpm-lock.yaml'));
    const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'));
    const joint = readJointNativeProjection(root);
    expect(joint.view.lock).toEqual(readLockFile(join(root, input.audioLock)));
    expect(joint.view.workspace).toEqual(readPolicyYaml(join(root, input.audioWorkspace)));
    expect(joint.view.source).toEqual({
      lockSha256: input.files.find(({ path }) => path === 'pnpm-lock.yaml').sha256,
      workspaceSha256: input.files.find(({ path }) => path === 'pnpm-workspace.yaml').sha256,
    });
    expect(readFileSync(join(root, 'pnpm-lock.yaml'))).toEqual(lock);
    expect(readFileSync(join(root, 'pnpm-workspace.yaml'))).toEqual(workspace);
  });
  it('consumes real SVG and Audio source/archive owners after whole-root admission', () => {
    const joint = qualifyJointNativeInputs(root);
    expect(joint.qualification.svg.installed.files).toBeGreaterThan(0);
    expect(joint.audio.patchQualification.installedFiles).toBe(190);
    expect(joint.audio.actualPaths).toHaveLength(18);
    expect(joint.audio.lockSha256).toBe(joint.qualification.actualLockSha256);
    expect(joint.audio.patchQualification.projectionTargetLockSha256).toBe(
      '72a17493f6420ecb78fd914976aac577fa57eceb5124cb44985f97db9176dfce'
    );
  });
  for (const [name, mutate] of [
    [
      'extra dependency',
      (lock) => {
        lock.importers['experiments/native-architecture'].devDependencies.foreign = {
          specifier: '1',
          version: '1',
        };
      },
    ],
    [
      'extra artifact',
      (lock) => {
        lock.packages['foreign@1.0.0'] = { resolution: { integrity: 'sha512-foreign' } };
      },
    ],
    [
      'altered archive integrity',
      (lock) => {
        lock.packages['expo-audio@57.0.5'].resolution.integrity = 'sha512-foreign';
      },
    ],
  ])
    it(`refuses ${name} before resolving any installed package or entering Audio`, () => {
      const path = fixture();
      const lock = readLockFile(join(path, 'pnpm-lock.yaml'));
      mutate(lock);
      writeFileSync(join(path, 'pnpm-lock.yaml'), stringify(lock));
      expect(() => qualifyJointNativeInputs(path)).toThrow(
        'Unqualified joint input: pnpm-lock.yaml'
      );
    });
  it('refuses an extra workspace even without an installed graph', () => {
    const path = fixture();
    const workspace = readPolicyYaml(join(path, 'pnpm-workspace.yaml'));
    workspace.packages.push('foreign');
    writeFileSync(join(path, 'pnpm-workspace.yaml'), stringify(workspace));
    expect(() => qualifyJointNativeInputs(path)).toThrow(
      'Unqualified joint input: pnpm-workspace.yaml'
    );
  });
  it('refuses changed patch bytes, candidate roots and source aliases with exact restoration', () => {
    const path = fixture();
    for (const name of [
      'patches/react-native-svg@15.15.4.patch',
      'patches/expo-audio@57.0.5.patch',
      'experiments/native-architecture/package.json',
    ]) {
      const target = join(path, name);
      const bytes = readFileSync(target);
      writeFileSync(target, Buffer.concat([bytes, Buffer.from('changed')]));
      expect(() => readJointNativeProjection(path)).toThrow(`Unqualified joint input: ${name}`);
      writeFileSync(target, bytes);
      expect(() => readJointNativeProjection(path)).not.toThrow();
    }
    const target = join(path, 'pnpm-lock.yaml');
    rmSync(target);
    symlinkSync(join(root, 'pnpm-lock.yaml'), target);
    expect(() => readJointNativeProjection(path)).toThrow('independent regular file');
  });
  it('independently refuses semantic extras even before using source identities', () => {
    const joint = readJointNativeProjection(root);
    const baseline = readLockFile(join(root, input.audioLock));
    const workspace = readPolicyYaml(join(root, input.audioWorkspace));
    for (const mutate of [
      (lock) => {
        lock.packages['foreign@1.0.0'] = {};
      },
      (lock) => {
        lock.packages['react-native-svg@15.15.4'].resolution.integrity = 'sha512-foreign';
      },
      (lock) => {
        delete lock.patchedDependencies['react-native-svg@15.15.4'];
      },
    ]) {
      const lock = readLockFile(join(root, 'pnpm-lock.yaml'));
      mutate(lock);
      expect(() =>
        projectSvgBackdropPatch(
          lock,
          readPolicyYaml(join(root, 'pnpm-workspace.yaml')),
          baseline,
          workspace,
          joint.svg
        )
      ).toThrow();
    }
    const changedWorkspace = readPolicyYaml(join(root, 'pnpm-workspace.yaml'));
    changedWorkspace.allowUnusedPatches = true;
    expect(() =>
      projectSvgBackdropPatch(
        readLockFile(join(root, 'pnpm-lock.yaml')),
        changedWorkspace,
        baseline,
        workspace,
        joint.svg
      )
    ).toThrow('Unexpected SVG workspace delta');
  });
});
