import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { getImporterArtifactKeys } from './lock-artifacts.mjs';
import { readJson, resolveNativePackage } from './native-identity.mjs';

const PROCESS_TIMEOUT_MS = 30_000;
const MAX_PROCESS_OUTPUT_BYTES = 8 * 1024 * 1024;

export function runCandidateNode(root, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: PROCESS_TIMEOUT_MS,
    maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
  });
  assert.equal(result.error, undefined, `Candidate command failed: ${result.error?.message}`);
  assert.equal(result.status, 0, `Candidate command failed: ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

export function assertMetroOwnership(config, root, candidate) {
  assert.equal(
    realpathSync(config.projectRoot),
    candidate,
    'Metro project root escaped the candidate'
  );
  const expected = [join(candidate, 'node_modules'), join(root, 'node_modules')];
  assert.deepEqual(
    config.resolver.nodeModulesPaths,
    expected,
    'Unexpected Metro dependency search roots'
  );
  assert.deepEqual(
    config.watchFolders.map((path) => realpathSync(path)).sort(),
    [candidate, realpathSync(join(root, 'node_modules'))].sort(),
    'Unexpected Metro watched sources'
  );
  for (const platform of ['android', 'ios']) {
    assert.ok(
      config.resolver.unstable_conditionsByPlatform[platform].includes('react-native'),
      `Metro lost the ${platform} native condition`
    );
  }
}

export function assertExpoSearchOwnership(search, candidate, closure) {
  return Object.fromEntries(
    Object.entries(search).map(([name, module]) => {
      assert.equal(module.name, name, 'Expo search identity differs from its key');
      assert.ok(
        closure.has(`${name}@${module.version}`),
        `Scanner escaped candidate closure: ${name}`
      );
      assert.deepEqual(module.duplicates, [], `Duplicate autolinked Expo module: ${name}`);
      const installed = resolveNativePackage(candidate, name);
      assert.equal(module.version, installed.version, `Expo search version differs: ${name}`);
      assert.equal(
        realpathSync(module.path),
        installed.directory,
        `Expo search path differs: ${name}`
      );
      return [name, { version: installed.version, directory: installed.directory }];
    })
  );
}

export function assertExpoModuleSources(modules, ownership) {
  const names = modules.map((module) => module.packageName);
  assert.equal(new Set(names).size, modules.length, 'Duplicate resolved Expo modules');
  for (const module of modules) {
    const installed = ownership[module.packageName];
    assert.ok(installed, `Resolved module absent from reviewed search: ${module.packageName}`);
    assert.equal(module.packageVersion, installed.version);
    const sources = [
      ...(module.projects ?? []).map((project) => project.sourceDir),
      ...(module.pods ?? []).map((pod) => pod.podspecDir),
      ...(module.plugins ?? []).map((plugin) => plugin.sourceDir),
    ];
    for (const source of sources) {
      const offset = relative(installed.directory, realpathSync(source));
      assert.ok(
        offset !== '..' && !offset.startsWith('../') && !isAbsolute(offset),
        `Native module source escaped its package: ${module.packageName} ${source}`
      );
    }
  }
}

export function assertDevelopmentPlatforms(platforms) {
  assert.deepEqual(
    platforms,
    ['android', 'ios', 'web'],
    'Unsupported drawing development platforms'
  );
}

export function inspectNativeConfig(root, candidate, identities, lock) {
  assertDevelopmentPlatforms(readJson(join(candidate, 'app.json')).expo?.platforms);
  const require = createRequire(join(candidate, 'package.json'));
  const metro = require(join(candidate, 'metro.config.cjs'));
  assertMetroOwnership(metro, root, candidate);
  const paths = require(join(identities.expoConfig.directory, 'build/paths/paths.js'));
  const { getConfig } = require(identities.expoConfig.directory);
  const config = getConfig(candidate, { skipSDKVersionRequirement: true });
  assert.equal(config.exp._internal.projectRoot, candidate);
  assertDevelopmentPlatforms(config.exp.platforms);
  assert.equal(
    config.exp.android?.package,
    undefined,
    'Probe must not claim the shipping application ID'
  );
  assert.equal(
    config.exp.ios?.bundleIdentifier,
    undefined,
    'Probe must not claim the shipping application ID'
  );
  assert.equal(
    paths.getMetroServerRoot(candidate),
    root,
    'Workspace server-root ownership changed'
  );
  const entries = Object.fromEntries(
    config.exp.platforms.map((platform) => [
      platform,
      paths.resolveEntryPoint(candidate, { platform }),
    ])
  );
  for (const entry of Object.values(entries))
    assert.equal(realpathSync(entry), join(candidate, 'src/index.ts'));
  const autolinkManifest = readJson(identities.autolinking.manifestPath);
  const bin = join(
    identities.autolinking.directory,
    autolinkManifest.bin['expo-modules-autolinking']
  );
  const closure = getImporterArtifactKeys(lock, CANDIDATE_DIRECTORY, true);
  const expoModules = Object.fromEntries(
    ['android', 'apple'].map((platform) => {
      const search = JSON.parse(
        runCandidateNode(root, [
          bin,
          'search',
          '--platform',
          platform,
          '--json',
          '--project-root',
          candidate,
        ])
      );
      const ownership = assertExpoSearchOwnership(search, candidate, closure);
      const output = JSON.parse(
        runCandidateNode(root, [
          bin,
          'resolve',
          '--platform',
          platform,
          '--json',
          '--project-root',
          candidate,
        ])
      );
      assertExpoModuleSources(output.modules, ownership);
      return [platform, { search, ...output }];
    })
  );
  const rnConfig = Object.fromEntries(
    ['android', 'ios'].map((platform) => {
      const output = JSON.parse(
        runCandidateNode(root, [
          bin,
          'react-native-config',
          '--platform',
          platform,
          '--json',
          '--project-root',
          candidate,
        ])
      );
      assert.equal(realpathSync(output.root), candidate);
      assert.equal(
        realpathSync(output.reactNativePath),
        identities.direct['react-native'].directory
      );
      for (const [name, dependency] of Object.entries(output.dependencies)) {
        const installed = resolveNativePackage(candidate, name);
        assert.ok(closure.has(`${name}@${installed.version}`));
        assert.equal(realpathSync(dependency.root), installed.directory);
      }
      return [platform, output];
    })
  );
  return {
    projectRoot: metro.projectRoot,
    entries,
    serverRoot: paths.getMetroServerRoot(candidate),
    nodeModulesPaths: metro.resolver.nodeModulesPaths,
    watchFolders: metro.watchFolders,
    nativeConditions: metro.resolver.unstable_conditionsByPlatform,
    expoModules,
    rnConfig,
    generatedNativeIntegration:
      existsSync(join(candidate, 'android')) || existsSync(join(candidate, 'ios'))
        ? 'Requires separately reviewed template/build result'
        : 'Pending: no generated candidate native trees',
  };
}

export function inspectShippingPluginPaths(root) {
  const files = [
    'capacitor.config.json',
    'android/capacitor.settings.gradle',
    'ios/App/CapApp-SPM/Package.swift',
  ];
  const hashes = Object.fromEntries(
    files.map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(join(root, file)))
        .digest('hex'),
    ])
  );
  const gradle = readFileSync(join(root, files[1]), 'utf8');
  const swift = readFileSync(join(root, files[2]), 'utf8');
  const paths = [...gradle.matchAll(/new File\('([^']+)'\)/g)]
    .map((match) => [files[1], match[1]])
    .concat(
      [...swift.matchAll(/\.package\(name: "[^"]+", path: "([^"]+)"\)/g)].map((match) => [
        files[2],
        match[1],
      ])
    );
  assert.ok(paths.length > 0, 'Committed native plugin paths were not inspected');
  const modulesRoot = realpathSync(join(root, 'node_modules'));
  const plugins = paths.map(([owner, pluginPath]) => {
    const absolute = resolve(dirname(join(root, owner)), pluginPath);
    const fromModules = relative(modulesRoot, absolute);
    assert.ok(
      fromModules &&
        fromModules !== '..' &&
        !fromModules.startsWith('../') &&
        !isAbsolute(fromModules),
      `Capacitor plugin path escapes installed dependencies: ${owner} ${pluginPath}`
    );
    assert.ok(
      !fromModules.split('/').includes('.pnpm'),
      `Capacitor plugin path uses content-addressed store: ${owner} ${pluginPath}`
    );
    assert.equal(
      realpathSync(absolute),
      absolute,
      `Capacitor plugin realpath churn: ${owner} ${pluginPath}`
    );
    return { owner, path: absolute };
  });
  return { hashes, plugins };
}

export function assertShippingConfigEvidence(shipping, expectedHashes) {
  assert.deepEqual(
    shipping.hashes,
    expectedHashes,
    'Shipping configuration differs from the reviewed install evidence'
  );
}
