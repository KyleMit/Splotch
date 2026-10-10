import { afterEach, describe, it, expect } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readLockFile } from '../lib/lock-artifacts.mjs';
import { readAudioResetPatchInputs } from '../lib/native-audio-reset-patch.mjs';
import {
  projectDrawingForgeLock,
  readDrawingForgeInputs,
} from '../lib/native-drawing-forge-paths.mjs';
import {
  AUDIO_EVIDENCE,
  projectAudioLock,
  qualifyAudioInputs,
} from '../lib/native-audio-qualification.mjs';
const root = join(import.meta.dirname, '../../..');
const baseline = readLockFile(
  join(root, AUDIO_EVIDENCE, 'controls/source-window-0541/before-pnpm-lock.yaml.txt')
);
const input = JSON.parse(readFileSync(join(root, AUDIO_EVIDENCE, 'audio-lock-inputs.json')));
const manifest = JSON.parse(
  readFileSync(join(root, 'experiments/native-architecture/package.json'))
);
const resetInput = readAudioResetPatchInputs(root);
const lock = readLockFile(join(root, resetInput.baselineLock.path));
const fixtures = [];
function actualQualificationFixture() {
  const path = mkdtempSync(join(tmpdir(), 'splotch-audio-qualification-'));
  fixtures.push(path);
  const copy = (name) => {
    mkdirSync(dirname(join(path, name)), { recursive: true });
    cpSync(join(root, name), join(path, name), { recursive: true, verbatimSymlinks: true });
  };
  for (const name of [
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tools/migration/inputs/native-audio-reset-patch.json',
    resetInput.patch.path,
    resetInput.baselineLock.path,
    resetInput.baselineWorkspace.path,
    'node_modules/expo-audio',
    ...resetInput.generatedBinLinks.map(({ target }) => target),
    'experiments/native-architecture/package.json',
    `${AUDIO_EVIDENCE}/audio-lock-inputs.json`,
    `${AUDIO_EVIDENCE}/script-inventory.json`,
    `${AUDIO_EVIDENCE}/controls/source-window-0541/before-pnpm-lock.yaml.txt`,
  ])
    copy(name);
  for (const record of input.roots) {
    copy(`${AUDIO_EVIDENCE}/${record.archive}`);
    copy(`node_modules/${record.name}/package.json`);
  }
  return path;
}
afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));
describe('new audio qualification', () => {
  it('composes the exact qualified audio boundary with the untouched N1 eight-path policy', () => {
    const audio = qualifyAudioInputs(root);
    const inherited = projectDrawingForgeLock(
      audio.lock,
      audio.inheritedManifest,
      readDrawingForgeInputs(root)
    );
    expect(audio.actualPaths).toHaveLength(18);
    expect(inherited.provenance.actualLockedPaths).toHaveLength(8);
    expect(inherited.provenance.baselineComparisonPaths).toHaveLength(4);
    expect(() => projectDrawingForgeLock(lock, manifest, readDrawingForgeInputs(root))).toThrow(
      'Unsupported actual drawing Forge path'
    );
    const expected = structuredClone(manifest);
    delete expected.devDependencies['expo-audio'];
    delete expected.devDependencies['expo-asset'];
    expect(audio.inheritedManifest).toEqual(expected);
  });
  it('qualifies actual installed source, registry archives and eighteen finite paths', () => {
    const result = qualifyAudioInputs(root);
    expect(result.actualPaths).toHaveLength(18);
    expect(result.installed.map((p) => p.version)).toEqual(['57.0.5', '57.0.18']);
    expect(result.lock).toEqual(baseline);
  });
  for (const [name, mutate] of [
    [
      'extra artifact',
      (l) => {
        l.packages['unqualified@1.0.0'] = {};
      },
    ],
    [
      'changed inherited snapshot',
      (l) => {
        l.snapshots[Object.keys(baseline.snapshots)[0]].audioMutation = true;
      },
    ],
    [
      'changed audio SRI',
      (l) => {
        l.packages['expo-audio@57.0.5'].resolution.integrity = 'invalid';
      },
    ],
    [
      'changed audio peer',
      (l) => {
        l.packages['expo-audio@57.0.5'].peerDependencies.expo = '58';
      },
    ],
    [
      'undeclared direct root',
      (l) => {
        l.importers['experiments/native-architecture'].devDependencies.unqualified = {
          specifier: '1',
          version: '1',
        };
      },
    ],
    [
      'audio outside dev graph',
      (l) => {
        l.importers['experiments/native-architecture'].dependencies = {
          'expo-audio': input.roots[0].entry,
        };
      },
    ],
  ])
    it(`rejects ${name}`, () => {
      const changed = structuredClone(lock);
      mutate(changed);
      expect(() => projectAudioLock(changed, baseline, manifest, input)).toThrow();
    });
  it('rejects extra Forge paths in qualification input', () => {
    const changed = structuredClone(input);
    changed.forgePaths.push('unqualified>node-forge');
    expect(() => projectAudioLock(lock, baseline, manifest, changed)).toThrow();
  });

  it('rejects malformed extra audio paths before reading the actual lock and restores pristine qualification', () => {
    const path = actualQualificationFixture();
    expect(qualifyAudioInputs(path).actualPaths).toHaveLength(18);
    const file = join(path, AUDIO_EVIDENCE, 'audio-lock-inputs.json');
    const original = readFileSync(file);
    const changed = JSON.parse(original);
    changed.forgePaths.push('foreign>expo-audio>node-forge');
    writeFileSync(file, JSON.stringify(changed));
    expect(() => qualifyAudioInputs(path)).toThrow('Audio input bytes changed');
    writeFileSync(file, original);
    expect(qualifyAudioInputs(path).actualPaths).toHaveLength(18);
  });
  it('rejects changed actual roots at the lock boundary before projecting inherited inputs', () => {
    const path = actualQualificationFixture();
    const file = join(path, 'pnpm-lock.yaml');
    const original = readFileSync(file, 'utf8');
    expect(original).toContain('specifier: 57.0.5');
    writeFileSync(file, original.replace('specifier: 57.0.5', 'specifier: 57.0.6'));
    expect(() => qualifyAudioInputs(path)).toThrow('Unqualified audio lock');
    writeFileSync(file, original);
    expect(qualifyAudioInputs(path).actualPaths).toHaveLength(18);
  });
  it('rejects a corrupt actual archive before invoking the projection even with a corrupt direct manifest', () => {
    const path = actualQualificationFixture();
    const archive = join(path, AUDIO_EVIDENCE, input.roots[0].archive);
    const bytes = readFileSync(archive);
    const changed = Buffer.from(bytes);
    changed[0] ^= 1;
    writeFileSync(archive, changed);
    const manifestPath = join(path, 'experiments/native-architecture/package.json');
    const originalManifest = readFileSync(manifestPath);
    const changedManifest = JSON.parse(originalManifest);
    changedManifest.devDependencies['expo-audio'] = 'unqualified';
    writeFileSync(manifestPath, JSON.stringify(changedManifest));
    expect(() => qualifyAudioInputs(path)).toThrow('Archive integrity mismatch');
    writeFileSync(archive, bytes);
    writeFileSync(manifestPath, originalManifest);
    expect(qualifyAudioInputs(path).actualPaths).toHaveLength(18);
  });
});
