import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import ts from 'typescript';

const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall', 'prepare'];
export { assertDeclaredCandidateImports } from './candidate-imports.mjs';

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function assertCandidateManifest(manifest, alignment) {
  assert.equal(manifest.private, true, 'Candidate must be private');
  assert.equal(manifest.name, '@splotch/native-architecture');
  assert.equal(manifest.main, 'src/index.ts');
  assert.deepEqual(manifest.dependencies ?? {}, {}, 'Candidate packages are development-only');
  assert.deepEqual(
    manifest.optionalDependencies ?? {},
    {},
    'Candidate has no production optional packages'
  );
  assert.deepEqual(manifest.scripts ?? {}, {}, 'Candidate commands require an exercised owner');
  assert.deepEqual(
    manifest.devDependencies,
    alignment.directPackages,
    'SDK alignment changed without its reviewed record'
  );
  for (const hook of INSTALL_HOOKS)
    assert.equal(manifest.scripts?.[hook], undefined, `Project hook: ${hook}`);
  assert.equal(
    manifest.devDependencies.react,
    alignment.rendererReactVersion,
    'React/renderer alignment differs'
  );
}

export function dependencySpecifiers(source, filename) {
  const ast = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const imports = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      imports.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require') ||
        (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'require' &&
          node.expression.name.text === 'resolve')) &&
      node.arguments.length &&
      ts.isStringLiteral(node.arguments[0])
    )
      imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return imports;
}

export function resolveNativePackage(contextDirectory, name) {
  const require = createRequire(join(contextDirectory, 'package.json'));
  const manifestPath = realpathSync(require.resolve(`${name}/package.json`));
  const manifest = readJson(manifestPath);
  return { name, version: manifest.version, directory: dirname(manifestPath), manifestPath };
}

export function assertOnePackageIdentity(entries) {
  assert.ok(entries.length > 0, 'Identity needs a real resolution');
  for (const entry of entries) {
    assert.equal(entry.version, entries[0].version, `Duplicate ${entry.name} versions`);
    assert.equal(entry.directory, entries[0].directory, `Duplicate ${entry.name} realpaths`);
  }
}

export function inspectNativeIdentities(candidate, alignment) {
  const identities = Object.fromEntries(
    Object.keys(alignment.directPackages).map((name) => [
      name,
      resolveNativePackage(candidate, name),
    ])
  );
  for (const [name, expected] of Object.entries(alignment.directPackages)) {
    assert.equal(identities[name].version, expected, `Unexpected installed ${name}`);
  }
  const expo = identities.expo.directory;
  const rn = identities['react-native'].directory;
  assertOnePackageIdentity([
    identities.react,
    resolveNativePackage(expo, 'react'),
    resolveNativePackage(rn, 'react'),
  ]);
  assertOnePackageIdentity([
    identities['react-native'],
    resolveNativePackage(expo, 'react-native'),
  ]);
  const wrapper = resolveNativePackage(expo, '@expo/metro');
  assert.equal(wrapper.version, alignment.expoMetroVersion);
  const metro = resolveNativePackage(wrapper.directory, 'metro');
  const config = resolveNativePackage(expo, '@expo/metro-config');
  assert.equal(metro.version, alignment.metroVersion);
  const configWrapper = resolveNativePackage(config.directory, '@expo/metro');
  assertOnePackageIdentity([metro, resolveNativePackage(configWrapper.directory, 'metro')]);
  const wrapperManifest = readJson(wrapper.manifestPath);
  const metroFamily = Object.fromEntries(
    Object.entries(wrapperManifest.dependencies)
      .filter(([name]) => name === 'metro' || name.startsWith('metro-'))
      .map(([name, version]) => {
        const installed = resolveNativePackage(wrapper.directory, name);
        assert.equal(installed.version, version, `Expo-owned Metro family changed: ${name}`);
        assertOnePackageIdentity([installed, resolveNativePackage(metro.directory, name)]);
        return [name, installed];
      })
  );
  const preset = identities['babel-preset-expo'].directory;
  const presetManifest = readJson(join(preset, 'package.json'));
  assert.equal(presetManifest.peerDependencies['react-refresh'], alignment.requiredRefreshPeer);
  assert.equal(presetManifest.peerDependenciesMeta?.['react-refresh']?.optional, undefined);
  const refresh = resolveNativePackage(preset, 'react-refresh');
  const refreshVersion = /^(\d+)\.(\d+)\.(\d+)/.exec(refresh.version);
  assert.ok(
    refreshVersion && Number(refreshVersion[1]) === 0 && Number(refreshVersion[2]) >= 14,
    'Required refresh peer must satisfy >=0.14.0 <1.0.0'
  );
  const refreshBabel = createRequire(join(preset, 'package.json')).resolve('react-refresh/babel');
  const fabric = readFileSync(
    join(rn, 'Libraries/Renderer/implementations/ReactFabric-dev.js'),
    'utf8'
  );
  const rendererVersion = /reconcilerVersion:\s*"([^"]+)"/.exec(fabric)?.[1];
  assert.equal(
    rendererVersion,
    identities.react.version,
    'Installed RN renderer and React versions differ'
  );
  return {
    direct: identities,
    wrapper,
    metro,
    metroFamily,
    config,
    refresh,
    refreshBabel,
    rendererVersion,
    cli: resolveNativePackage(expo, '@expo/cli'),
    expoConfig: resolveNativePackage(expo, '@expo/config'),
    autolinking: resolveNativePackage(expo, 'expo-modules-autolinking'),
  };
}
