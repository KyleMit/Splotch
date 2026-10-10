import { afterEach, describe, expect, it } from 'vitest';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readLockFile } from '../lib/lock-artifacts.mjs';
import { readPolicyYaml } from '../lib/topology-policy.mjs';
import { AUDIO_EVIDENCE } from '../lib/native-audio-qualification.mjs';
import {
  projectAudioResetPatch,
  qualifyAudioResetPatch,
  readAudioResetPatchInputs,
} from '../lib/native-audio-reset-patch.mjs';

const root = join(import.meta.dirname, '../../..');
const input = readAudioResetPatchInputs(root);
const audioInput = JSON.parse(readFileSync(join(root, AUDIO_EVIDENCE, 'audio-lock-inputs.json')));
const baseline = readLockFile(join(root, input.baselineLock.path));
const beforeWorkspace = readPolicyYaml(join(root, input.baselineWorkspace.path));
const fixtures = [];

function fixture() {
  const path = mkdtempSync(join(tmpdir(), 'splotch-audio-reset-qualification-'));
  fixtures.push(path);
  for (const name of [
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    input.patch.path,
    input.baselineLock.path,
    input.baselineWorkspace.path,
    input.archive.path,
    'tools/migration/inputs/native-audio-reset-patch.json',
    'experiments/native-architecture/package.json',
    'node_modules/expo-audio',
    ...input.generatedBinLinks.map(({ target }) => target),
  ]) {
    mkdirSync(dirname(join(path, name)), { recursive: true });
    cpSync(join(root, name), join(path, name), { recursive: true, verbatimSymlinks: true });
  }
  writeFileSync(
    join(path, 'pnpm-lock.yaml'),
    readFileSync(
      join(root, 'docs/migration/evidence/native-joint-graph-20261010/audio-pnpm-lock.yaml.txt')
    )
  );
  writeFileSync(
    join(path, 'pnpm-workspace.yaml'),
    readFileSync(
      join(
        root,
        'docs/migration/evidence/native-joint-graph-20261010/audio-pnpm-workspace.yaml.txt'
      )
    )
  );
  return path;
}

afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

describe('finite Audio reset patch qualification', () => {
  it('projects only the emitted patch registration, importer and snapshot identity', () => {
    const result = projectAudioResetPatch(
      readLockFile(
        join(root, 'docs/migration/evidence/native-joint-graph-20261010/audio-pnpm-lock.yaml.txt')
      ),
      readPolicyYaml(
        join(
          root,
          'docs/migration/evidence/native-joint-graph-20261010/audio-pnpm-workspace.yaml.txt'
        )
      ),
      baseline,
      beforeWorkspace,
      input
    );
    expect(result.lock).toEqual(baseline);
    expect(result.workspace).toEqual(beforeWorkspace);
    expect(Object.keys(result.workspace.patchedDependencies)).toEqual(['node-forge@1.4.0']);
  });

  for (const [name, mutate] of [
    [
      'extra patch registration',
      (lock) => {
        lock.patchedDependencies['foreign@1.0.0'] = 'foreign';
      },
    ],
    [
      'changed patch hash',
      (lock) => {
        lock.patchedDependencies['expo-audio@57.0.5'] = 'foreign';
      },
    ],
    [
      'changed direct Audio root',
      (lock) => {
        lock.importers['experiments/native-architecture'].devDependencies['expo-audio'].specifier =
          '57.0.6';
      },
    ],
    [
      'changed snapshot body',
      (lock) => {
        const key = Object.keys(lock.snapshots).find((name) => name.startsWith('expo-audio@'));
        lock.snapshots[key].dependencies.expo = 'foreign';
      },
    ],
    [
      'changed unrelated package',
      (lock) => {
        lock.packages['expo-asset@57.0.18'].resolution.integrity = 'foreign';
      },
    ],
  ])
    it(`rejects ${name} before inherited projection`, () => {
      const lock = readLockFile(
        join(root, 'docs/migration/evidence/native-joint-graph-20261010/audio-pnpm-lock.yaml.txt')
      );
      mutate(lock);
      expect(() =>
        projectAudioResetPatch(
          lock,
          readPolicyYaml(
            join(
              root,
              'docs/migration/evidence/native-joint-graph-20261010/audio-pnpm-workspace.yaml.txt'
            )
          ),
          baseline,
          beforeWorkspace,
          input
        )
      ).toThrow();
    });

  it('rejects extra workspace registration without expanding the Forge owner', () => {
    const workspace = readPolicyYaml(
      join(
        root,
        'docs/migration/evidence/native-joint-graph-20261010/audio-pnpm-workspace.yaml.txt'
      )
    );
    workspace.patchedDependencies['foreign@1.0.0'] = 'foreign.patch';
    expect(() =>
      projectAudioResetPatch(
        readLockFile(
          join(root, 'docs/migration/evidence/native-joint-graph-20261010/audio-pnpm-lock.yaml.txt')
        ),
        workspace,
        baseline,
        beforeWorkspace,
        input
      )
    ).toThrow('Unexpected Audio reset workspace delta');
  });

  it('requires the actual whole input and restores its original bytes', () => {
    const path = fixture();
    const file = join(path, 'tools/migration/inputs/native-audio-reset-patch.json');
    const original = readFileSync(file);
    writeFileSync(file, JSON.stringify({ ...input, installedFiles: [] }));
    expect(() => readAudioResetPatchInputs(path)).toThrow('Audio reset input bytes changed');
    writeFileSync(file, original);
    expect(readAudioResetPatchInputs(path)).toEqual(input);
  });

  it('authenticates the entire effective installed package before the projection', () => {
    const result = qualifyAudioResetPatch(fixture(), input, audioInput);
    expect(result.qualification.installedFiles).toBe(190);
    expect(result.qualification.generatedBinLinks).toHaveLength(4);
    expect(result.qualification.actualPaths).toHaveLength(18);
    expect(result.lock).toEqual(baseline);
  });

  for (const member of ['ios/AudioPlayer.swift', 'ios/AudioModule.swift', 'LICENSE'])
    it(`rejects changed installed ${member} and restores pristine qualification`, () => {
      const path = fixture();
      const file = join(path, 'node_modules/expo-audio', member);
      const original = readFileSync(file);
      writeFileSync(file, Buffer.concat([original, Buffer.from('\nchanged\n')]));
      expect(() => qualifyAudioResetPatch(path, input, audioInput)).toThrow(
        'Installed Audio reset package differs from authenticated patched archive'
      );
      writeFileSync(file, original);
      expect(qualifyAudioResetPatch(path, input, audioInput).qualification.installedFiles).toBe(
        190
      );
    });

  it('rejects an extra test overlay in the production installed package', () => {
    const path = fixture();
    const file = join(path, 'node_modules/expo-audio/ios/Tests/Unqualified.swift');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'unqualified');
    expect(() => qualifyAudioResetPatch(path, input, audioInput)).toThrow(
      'Installed Audio reset package differs from authenticated patched archive'
    );
    rmSync(dirname(file), { recursive: true });
    expect(qualifyAudioResetPatch(path, input, audioInput).qualification.installedFiles).toBe(190);
  });

  it('rejects foreign generated links and restores the exact four links', () => {
    const path = fixture();
    const file = join(path, 'node_modules/expo-audio/node_modules/.bin/foreign');
    symlinkSync('../../../expo/bin/cli', file);
    expect(() => qualifyAudioResetPatch(path, input, audioInput)).toThrow(
      'Installed Audio generated executable links changed'
    );
    rmSync(file);
    expect(
      qualifyAudioResetPatch(path, input, audioInput).qualification.generatedBinLinks
    ).toHaveLength(4);
  });

  it('rejects a foreign regular file in the generated executable directory', () => {
    const path = fixture();
    const file = join(path, 'node_modules/expo-audio/node_modules/.bin/foreign');
    writeFileSync(file, 'foreign');
    expect(() => qualifyAudioResetPatch(path, input, audioInput)).toThrow(
      'Installed Audio reset package differs from authenticated patched archive'
    );
    rmSync(file);
    expect(qualifyAudioResetPatch(path, input, audioInput).qualification.installedFiles).toBe(190);
  });

  it('rejects an unknown empty generated directory', () => {
    const path = fixture();
    mkdirSync(join(path, 'node_modules/expo-audio/node_modules/foreign'));
    expect(() => qualifyAudioResetPatch(path, input, audioInput)).toThrow(
      'Unexpected Audio generated directory'
    );
  });

  it('rejects a changed generated link literal even when its target bytes match', () => {
    const path = fixture();
    const file = join(path, 'node_modules/expo-audio', input.generatedBinLinks[0].path);
    rmSync(file);
    symlinkSync(join(path, input.generatedBinLinks[0].target), file);
    expect(() => qualifyAudioResetPatch(path, input, audioInput)).toThrow(
      'Installed Audio generated executable links changed'
    );
  });

  it('rejects an unchanged link literal whose parent escapes the owned root', () => {
    const path = fixture();
    const foreign = mkdtempSync(join(tmpdir(), 'splotch-audio-foreign-bin-'));
    fixtures.push(foreign);
    const expo = join(path, 'node_modules/expo');
    cpSync(expo, join(foreign, 'expo'), { recursive: true });
    rmSync(expo, { recursive: true });
    symlinkSync(join(foreign, 'expo'), expo);
    expect(() => qualifyAudioResetPatch(path, input, audioInput)).toThrow(
      'Audio generated executable target escaped or changed'
    );
  });

  it('rejects a broken generated executable target', () => {
    const path = fixture();
    rmSync(join(path, input.generatedBinLinks[0].target));
    expect(() => qualifyAudioResetPatch(path, input, audioInput)).toThrow(
      'Audio generated executable target missing'
    );
  });

  it('rejects changed generated executable target bytes and restores qualification', () => {
    const path = fixture();
    const file = join(path, input.generatedBinLinks[0].target);
    const original = readFileSync(file);
    writeFileSync(file, Buffer.concat([original, Buffer.from('changed')]));
    expect(() => qualifyAudioResetPatch(path, input, audioInput)).toThrow(
      'Audio generated executable target bytes or mode changed'
    );
    writeFileSync(file, original);
    expect(
      qualifyAudioResetPatch(path, input, audioInput).qualification.generatedBinLinks
    ).toHaveLength(4);
  });

  it('rejects a changed generated executable target mode', () => {
    const path = fixture();
    chmodSync(join(path, input.generatedBinLinks[0].target), 0o644);
    expect(() => qualifyAudioResetPatch(path, input, audioInput)).toThrow(
      'Audio generated executable target bytes or mode changed'
    );
  });
});
