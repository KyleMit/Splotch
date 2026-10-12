import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertExpoModuleSources,
  assertExpoSearchOwnership,
  runCandidateNode,
} from '../lib/native-config.mjs';
import { readJson, resolveNativePackage } from '../lib/native-identity.mjs';

const repoRoot = join(import.meta.dirname, '../../..');
const candidate = join(repoRoot, CANDIDATE_DIRECTORY);
const expo = resolveNativePackage(candidate, 'expo');
const autolinking = resolveNativePackage(expo.directory, 'expo-modules-autolinking');
const executable = join(
  autolinking.directory,
  readJson(autolinking.manifestPath).bin['expo-modules-autolinking']
);
const fixtures = [];
const CONTROL_NAME = 'topology-expo-control';
function write(root, path, contents) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), contents);
}
afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

describe('published Expo scanner manifest ownership', () => {
  it('excludes a root-only native module and includes it when the candidate owns the dependency', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-scanner-test-')));
    fixtures.push(root);
    const app = join(root, CANDIDATE_DIRECTORY);
    write(
      root,
      'package.json',
      JSON.stringify({ private: true, dependencies: { [CONTROL_NAME]: '1.0.0' } })
    );
    write(
      root,
      'pnpm-workspace.yaml',
      `packages:\n  - ${CANDIDATE_DIRECTORY}\nnodeLinker: hoisted\n`
    );
    write(
      app,
      'package.json',
      JSON.stringify({ private: true, devDependencies: { expo: expo.version } })
    );
    write(
      root,
      `node_modules/${CONTROL_NAME}/package.json`,
      JSON.stringify({ name: CONTROL_NAME, version: '1.0.0' })
    );
    write(
      root,
      `node_modules/${CONTROL_NAME}/expo-module.config.json`,
      JSON.stringify({
        platforms: ['android'],
        android: { modules: ['test.topology.ControlModule'] },
      })
    );
    write(root, `node_modules/${CONTROL_NAME}/android/build.gradle`, '');
    symlinkSync(expo.directory, join(root, 'node_modules/expo'), 'dir');
    const scan = () =>
      JSON.parse(
        runCandidateNode(root, [
          executable,
          'resolve',
          '--platform',
          'android',
          '--json',
          '--project-root',
          app,
        ])
      ).modules.map((module) => module.packageName);
    expect(scan()).not.toContain(CONTROL_NAME);
    write(
      app,
      'package.json',
      JSON.stringify({
        private: true,
        devDependencies: { expo: expo.version, [CONTROL_NAME]: '1.0.0' },
      })
    );
    expect(scan()).toContain(CONTROL_NAME);
  });
  it('rejects actual same-version duplicate search paths and sources outside the owning package', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-scanner-duplicates-')));
    fixtures.push(root);
    const app = join(root, CANDIDATE_DIRECTORY);
    const provider = 'topology-provider';
    write(root, 'package.json', JSON.stringify({ private: true }));
    write(
      root,
      'pnpm-workspace.yaml',
      `packages:\n  - ${CANDIDATE_DIRECTORY}\nnodeLinker: hoisted\n`
    );
    write(
      app,
      'package.json',
      JSON.stringify({ private: true, devDependencies: { [CONTROL_NAME]: '1.0.0' } })
    );
    const moduleRoot = join(root, 'node_modules', CONTROL_NAME);
    const writeModule = (path) => {
      write(path, 'package.json', JSON.stringify({ name: CONTROL_NAME, version: '1.0.0' }));
      write(
        path,
        'expo-module.config.json',
        JSON.stringify({
          platforms: ['android'],
          android: { modules: ['test.topology.ControlModule'] },
        })
      );
      write(path, 'android/build.gradle', '');
    };
    writeModule(moduleRoot);
    const scan = (command) =>
      JSON.parse(
        runCandidateNode(root, [
          executable,
          command,
          '--platform',
          'android',
          '--json',
          '--project-root',
          app,
        ])
      );
    const closure = new Set([`${CONTROL_NAME}@1.0.0`]);
    const search = scan('search');
    const ownership = assertExpoSearchOwnership(search, app, closure);
    const resolved = scan('resolve');
    expect(() => assertExpoModuleSources(resolved.modules, ownership)).not.toThrow();
    const wrongPath = structuredClone(search);
    wrongPath[CONTROL_NAME].path = root;
    expect(() => assertExpoSearchOwnership(wrongPath, app, closure)).toThrow('search path differs');
    const escaped = structuredClone(resolved.modules);
    escaped[0].projects[0].sourceDir = root;
    expect(() => assertExpoModuleSources(escaped, ownership)).toThrow('source escaped');
    write(
      root,
      `node_modules/${provider}/package.json`,
      JSON.stringify({
        name: provider,
        version: '1.0.0',
        dependencies: { [CONTROL_NAME]: '1.0.0' },
      })
    );
    writeModule(join(root, 'node_modules', provider, 'node_modules', CONTROL_NAME));
    write(
      app,
      'package.json',
      JSON.stringify({
        private: true,
        devDependencies: { [CONTROL_NAME]: '1.0.0', [provider]: '1.0.0' },
      })
    );
    const duplicated = scan('search');
    expect(duplicated[CONTROL_NAME].duplicates).toHaveLength(1);
    expect(duplicated[CONTROL_NAME].duplicates[0].version).toBe('1.0.0');
    expect(() => assertExpoSearchOwnership(duplicated, app, closure)).toThrow(
      'Duplicate autolinked'
    );
    expect(
      scan('resolve').modules.filter((module) => module.packageName === CONTROL_NAME)
    ).toHaveLength(1);
  });
});
