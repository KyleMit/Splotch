import { createHash } from 'node:crypto';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertCandidateManifest,
  assertDeclaredCandidateImports,
  assertOnePackageIdentity,
  readJson,
  resolveNativePackage,
} from '../lib/native-identity.mjs';
import {
  assertMetroOwnership,
  assertShippingConfigEvidence,
  inspectShippingPluginPaths,
} from '../lib/native-config.mjs';
import {
  assertAlignmentUpdateOwner,
  assertShippingImports,
  assertWorkspacePolicy,
  readPolicyYaml,
} from '../lib/topology-policy.mjs';

const repoRoot = join(import.meta.dirname, '../../..');
const alignment = readJson(join(repoRoot, CANDIDATE_DIRECTORY, 'alignment.json'));
const manifest = readJson(join(repoRoot, CANDIDATE_DIRECTORY, 'package.json'));
const fixtures = [];
function fixture() {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-owner-test-')));
  fixtures.push(path);
  return path;
}
function write(root, path, content) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), content);
}
afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

describe('candidate ownership and identity', () => {
  it.each(['expo-asset', 'expo-audio'])(
    'requires actual %s SDK alignment and a root-wide update owner',
    (name) => {
      expect(() => assertCandidateManifest(manifest, alignment)).not.toThrow();
      const missingAlignment = structuredClone(alignment);
      delete missingAlignment.directPackages[name];
      expect(() => assertCandidateManifest(manifest, missingAlignment)).toThrow(
        'SDK alignment changed'
      );
      const missingManifest = structuredClone(manifest);
      delete missingManifest.devDependencies[name];
      expect(() => assertCandidateManifest(missingManifest, alignment)).toThrow(
        'SDK alignment changed'
      );
      for (const scoped of [false, true]) {
        const updates = readPolicyYaml(join(repoRoot, '.github/dependabot.yml'));
        const owner = updates.updates.find((update) => update['package-ecosystem'] === 'npm');
        owner.ignore = owner.ignore.filter((rule) => rule['dependency-name'] !== name);
        if (scoped) owner.ignore.push({ 'dependency-name': name, versions: ['57.x'] });
        expect(() => assertAlignmentUpdateOwner(updates, alignment)).toThrow(
          `manual SDK alignment policy: ${name}`
        );
      }
    }
  );

  it('rejects a removed owner even when hoisted package resolution still succeeds', () => {
    const missing = structuredClone(manifest);
    delete missing.devDependencies.expo;
    expect(resolveNativePackage(join(repoRoot, CANDIDATE_DIRECTORY), 'expo').version).toBe(
      alignment.directPackages.expo
    );
    expect(() => assertCandidateManifest(missing, alignment)).toThrow('SDK alignment changed');
    const root = fixture();
    for (const path of [
      'src/index.ts',
      'src/ProbeApp.tsx',
      'metro.config.cjs',
      'babel.config.cjs',
      'scripts/check-transform.cjs',
    ])
      write(root, path, '');
    write(
      root,
      'babel.config.cjs',
      "module.exports = { presets: [require.resolve('undeclared-preset')] };\n"
    );
    expect(() => assertDeclaredCandidateImports(root, manifest)).toThrow('undeclared');
  });

  it('rejects a production dependency or independently moved React pin', () => {
    const production = structuredClone(manifest);
    production.dependencies = { expo: alignment.directPackages.expo };
    expect(() => assertCandidateManifest(production, alignment)).toThrow('development-only');
    const changed = structuredClone(manifest);
    changed.devDependencies.react = '19.3.0';
    expect(() => assertCandidateManifest(changed, alignment)).toThrow('SDK alignment changed');
  });

  it('detects actual same-version React copies from different provider contexts', () => {
    const root = fixture();
    for (const context of ['entry', 'provider']) {
      write(root, `${context}/package.json`, '{}');
      write(
        root,
        `${context}/node_modules/react/package.json`,
        JSON.stringify({ name: 'react', version: '19.2.3' })
      );
    }
    const entry = resolveNativePackage(join(root, 'entry'), 'react');
    const provider = resolveNativePackage(join(root, 'provider'), 'react');
    expect(() => assertOnePackageIdentity([entry, entry])).not.toThrow();
    expect(() => assertOnePackageIdentity([entry, provider])).toThrow('realpaths');
  });
});

describe('root policy and shipping boundary', () => {
  it('rejects additional members, unsafe script policy and missing manual SDK update ownership', () => {
    const workspace = readPolicyYaml(join(repoRoot, 'pnpm-workspace.yaml'));
    expect(() => assertWorkspacePolicy(workspace)).not.toThrow();
    const extra = structuredClone(workspace);
    extra.packages.push('other/*');
    expect(() => assertWorkspacePolicy(extra)).toThrow('workspace boundary');
    const ignored = structuredClone(workspace);
    ignored.ignoreScripts = true;
    expect(() => assertWorkspacePolicy(ignored)).toThrow('Ignoring scripts');
    const updates = readPolicyYaml(join(repoRoot, '.github/dependabot.yml'));
    expect(() => assertAlignmentUpdateOwner(updates, alignment)).not.toThrow();
    const npm = updates.updates.find((update) => update['package-ecosystem'] === 'npm');
    npm.ignore = npm.ignore.filter((rule) => rule['dependency-name'] !== 'react');
    expect(() => assertAlignmentUpdateOwner(updates, alignment)).toThrow('manual SDK alignment');
  });

  it('rejects a transitive build-helper candidate import and a relative workspace import', () => {
    const root = fixture();
    mkdirSync(join(root, 'web/src'), { recursive: true });
    mkdirSync(join(root, 'netlify/functions'), { recursive: true });
    write(root, 'knip.production.json', JSON.stringify({ entry: ['tools/build.mjs!'] }));
    write(root, 'web/svelte.config.js', 'export default {};');
    write(root, 'web/vite.config.ts', 'export default {};');
    const localHelperSpecifier = './assets/helper.mjs';
    write(root, 'tools/build.mjs', `export { run } from '${localHelperSpecifier}';`);
    write(root, 'tools/assets/helper.mjs', 'export const run = () => 1;');
    expect(() => assertShippingImports(root, ['react-native'])).not.toThrow();
    write(root, 'tools/assets/helper.mjs', "export const run = () => import('react-native');");
    expect(() => assertShippingImports(root, ['react-native'])).toThrow(
      'tools/assets/helper.mjs imports candidate-only'
    );
    const candidateSpecifier = `../../${CANDIDATE_DIRECTORY}/src/index.ts`;
    write(root, 'tools/assets/helper.mjs', `import '${candidateSpecifier}';`);
    expect(() => assertShippingImports(root, ['react-native'])).toThrow('candidate workspace');
  });

  it('keeps live plugin paths canonical while exact proof rejects shipping byte drift', () => {
    const root = fixture();
    const files = {
      'capacitor.config.json': JSON.stringify({ appId: 'test.fixture' }),
      'android/capacitor.settings.gradle': "new File('../node_modules/fixture-plugin')",
      'ios/App/CapApp-SPM/Package.swift':
        '.package(name: "FixturePlugin", path: "../../../node_modules/fixture-plugin")',
    };
    for (const [path, source] of Object.entries(files)) write(root, path, source);
    mkdirSync(join(root, 'node_modules/fixture-plugin'), { recursive: true });
    const expected = Object.fromEntries(
      Object.entries(files).map(([path, source]) => [
        path,
        createHash('sha256').update(source).digest('hex'),
      ])
    );
    expect(() =>
      assertShippingConfigEvidence(inspectShippingPluginPaths(root), expected)
    ).not.toThrow();
    write(root, 'capacitor.config.json', JSON.stringify({ appId: 'test.changed' }));
    const current = inspectShippingPluginPaths(root);
    expect(current.plugins).toHaveLength(2);
    expect(() => assertShippingConfigEvidence(current, expected)).toThrow(
      'reviewed install evidence'
    );
    const storePlugin = '.pnpm/fixture-plugin@2.0.0_peer@1.0.0/node_modules/fixture-plugin';
    mkdirSync(join(root, 'node_modules', storePlugin), { recursive: true });
    for (const [owner, source] of [
      ['android/capacitor.settings.gradle', `new File('../node_modules/${storePlugin}')`],
      [
        'ios/App/CapApp-SPM/Package.swift',
        `.package(name: "FixturePlugin", path: "../../../node_modules/${storePlugin}")`,
      ],
    ]) {
      write(root, owner, source);
      expect(() => inspectShippingPluginPaths(root)).toThrow('content-addressed store');
      write(root, owner, files[owner]);
    }
    mkdirSync(join(root, 'foreign-plugin'));
    write(root, 'android/capacitor.settings.gradle', "new File('../foreign-plugin')");
    expect(() => inspectShippingPluginPaths(root)).toThrow('path escapes installed dependencies');
  });

  it('rejects the wrong Metro project root and broadened source watching', () => {
    const root = fixture();
    const candidate = join(root, CANDIDATE_DIRECTORY);
    mkdirSync(candidate, { recursive: true });
    mkdirSync(join(root, 'node_modules'));
    const config = {
      projectRoot: candidate,
      watchFolders: [candidate, join(root, 'node_modules')],
      resolver: {
        nodeModulesPaths: [join(candidate, 'node_modules'), join(root, 'node_modules')],
        unstable_conditionsByPlatform: { android: ['react-native'], ios: ['react-native'] },
      },
    };
    expect(() => assertMetroOwnership(config, root, candidate)).not.toThrow();
    config.projectRoot = root;
    expect(() => assertMetroOwnership(config, root, candidate)).toThrow('project root');
    config.projectRoot = candidate;
    config.watchFolders.push(root);
    expect(() => assertMetroOwnership(config, root, candidate)).toThrow('watched sources');
  });
});
