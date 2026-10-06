import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import {
  assertDeclaredCandidateImports,
  dependencySpecifiers,
  readJson,
} from '../lib/native-identity.mjs';

const root = join(import.meta.dirname, '../../..');
const candidate = join(root, CANDIDATE_DIRECTORY);
const manifest = readJson(join(candidate, 'package.json'));
const fixtures = [];

function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-candidate-imports-')));
  fixtures.push(directory);
  const target = join(directory, 'candidate');
  cpSync(candidate, target, { recursive: true, filter: (path) => !path.includes('/node_modules') });
  symlinkSync(join(root, 'node_modules'), join(target, 'node_modules'));
  return target;
}

function write(candidate, path, source) {
  mkdirSync(dirname(join(candidate, path)), { recursive: true });
  writeFileSync(join(candidate, path), source);
}

function expectRejectedMutationAndRestore(candidate, path, source, reason) {
  const original = readFileSync(join(candidate, path), 'utf8');
  write(candidate, path, source);
  expect(() => assertDeclaredCandidateImports(candidate, manifest)).toThrow(reason);
  write(candidate, path, original);
  expect(() => assertDeclaredCandidateImports(candidate, manifest)).not.toThrow();
}

afterEach(() =>
  fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
);

describe('candidate source import ownership', () => {
  it('accepts the actual candidate and exposes finite generated subpath exclusions', () => {
    const result = assertDeclaredCandidateImports(candidate, manifest);
    expect(result.scannedCandidateFiles).toEqual([
      'app.json',
      'babel.config.cjs',
      'metro.config.cjs',
      'scripts/check-transform.cjs',
      'src/ProbeApp.tsx',
      'src/index.ts',
      'tsconfig.json',
    ]);
    expect(result.generatedSubpathExclusions).toContain('android/app/build');
    expect(result.generatedSubpathExclusions).not.toContain('android');
    expect(result.generatedSubpathExclusions).not.toContain('ios');
    expect(result.nonCoverage).toContain('Podfile/Gradle provider-context');
  });

  it('accepts maintained platform, extension, dotfile, rename and Node-role positives', () => {
    const target = fixture();
    for (const extension of ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'])
      write(target, `src/feature/Thing.${extension}`, "import 'expo';\n");
    write(
      target,
      'src/feature/Thing.ios.tsx',
      "import { View } from 'react-native'; export const Thing = () => <View />;\n"
    );
    write(target, '.hidden.config.mjs', "import path from 'path'; import 'expo';\n");
    write(target, 'expo-env.d.ts', '/// <reference types="expo/types" />\n');
    write(target, 'metro.config.js', readFileSync(join(target, 'metro.config.cjs')));
    rmSync(join(target, 'metro.config.cjs'));
    write(target, 'scripts/nested/helper.cjs', "require('path'); require('node:fs');\n");
    write(target, '.babelrc.json', '{"presets":["babel-preset-expo"]}');
    const result = assertDeclaredCandidateImports(target, manifest);
    expect(result.scannedCandidateFiles).toContain('src/feature/Thing.ios.tsx');
    expect(result.scannedCandidateFiles).toContain('.hidden.config.mjs');
    expect(result.scannedCandidateFiles).toContain('metro.config.js');
    expect(result.scannedCandidateFiles).toContain('.babelrc.json');
  });

  it('rejects direct and reachable root-only yaml and restores real positives', () => {
    const target = fixture();
    const entry = readFileSync(join(target, 'src/index.ts'), 'utf8');
    expectRejectedMutationAndRestore(
      target,
      'src/index.ts',
      `${entry}\nimport 'yaml';`,
      'src/index.ts imports undeclared yaml'
    );
    write(target, 'src/Extra.ts', "import 'yaml';\n");
    write(target, 'src/index.ts', `${entry}\nimport './Extra';\n`);
    expect(() => assertDeclaredCandidateImports(target, manifest)).toThrow(
      'src/Extra.ts imports undeclared yaml'
    );
    write(target, 'src/Extra.ts', "import 'expo';\n");
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
    write(target, 'src/index.ts', entry);
    rmSync(join(target, 'src/Extra.ts'));
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
  });

  it.each([
    ['import-equals', "import Y = require('yaml');"],
    ['static-template-require', 'require(`yaml`);'],
    ['static-template-import', 'import(`yaml`);'],
    ['element-resolve', "require['resolve']('yaml');"],
    ['import-type', "export type Y = typeof import('yaml');"],
    ['escaped-string', "import '\\u0079aml';"],
    ['JSDoc-type', "/** @type {import('yaml').ParseOptions} */ const options = {};"],
  ])('rejects undeclared %s syntax for its dependency reason', (_name, source) => {
    const target = fixture();
    expectRejectedMutationAndRestore(
      target,
      'src/index.ts',
      source,
      'src/index.ts imports undeclared yaml'
    );
  });

  it.each([
    'src/helper.jsx',
    'src/helper.ios.tsx',
    'src/helper.mts',
    'src/helper.cts',
    '.extra.config.mjs',
    'scripts/build/helper.cjs',
    'android/maintained-helper.js',
  ])('discovers previously unlisted maintained source %s', (path) => {
    const target = fixture();
    write(
      target,
      path,
      path.endsWith('.jsx') ? '<View>{require("yaml")}</View>;' : "import 'yaml';\n"
    );
    expect(() => assertDeclaredCandidateImports(target, manifest)).toThrow(
      `${path} imports undeclared yaml`
    );
    rmSync(join(target, path));
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
  });

  it.each([
    'expo/../yaml',
    'expo/./types',
    'expo//types',
    '@scope',
    'expo\\..\\yaml',
    'file:///tmp/helper.js',
    'data:text/javascript,0',
    '/tmp/helper.js',
    'node:invented',
  ])('rejects malformed package %s', (specifier) => {
    const target = fixture();
    expectRejectedMutationAndRestore(
      target,
      'src/index.ts',
      `import ${JSON.stringify(specifier)};`,
      'malformed package specifier'
    );
  });

  it.each(['node:fs', 'path'])('rejects Node builtin %s in the application bundle', (specifier) => {
    const target = fixture();
    expectRejectedMutationAndRestore(
      target,
      'src/index.ts',
      `import '${specifier}';`,
      'Node builtin into app source'
    );
  });

  it('treats dot-prefixed bare packages as dependencies', () => {
    const target = fixture();
    expectRejectedMutationAndRestore(
      target,
      'src/index.ts',
      "import '.root-only';",
      'imports undeclared .root-only'
    );
  });

  it('refuses app imports of Node-owned config and script sources', () => {
    const target = fixture();
    write(target, 'scripts/helper.cjs', "require('node:fs');");
    expectRejectedMutationAndRestore(
      target,
      'src/index.ts',
      "import '../scripts/helper.cjs';",
      'Node configuration or script into app source'
    );
    expectRejectedMutationAndRestore(
      target,
      'src/index.ts',
      "import '../metro.config';",
      'Node configuration or script into app source'
    );
    symlinkSync(join(target, 'scripts/helper.cjs'), join(target, 'src/helper.cjs'));
    expectRejectedMutationAndRestore(
      target,
      'src/index.ts',
      "import './helper.cjs';",
      'Node configuration or script into app source'
    );
  });

  it('keeps canonical app roles when an internal directory alias is discovered first', () => {
    const target = fixture();
    symlinkSync(join(target, 'src'), join(target, 'scripts/app-alias'));
    const entry = readFileSync(join(target, 'src/index.ts'), 'utf8');
    expectRejectedMutationAndRestore(
      target,
      'src/index.ts',
      `${entry}\nimport 'node:fs';`,
      'Node builtin into app source'
    );
    const result = assertDeclaredCandidateImports(target, manifest);
    expect(result.scannedCandidateFiles).toContain('src/index.ts');
    expect(result.scannedCandidateFiles).not.toContain('scripts/app-alias/index.ts');
  });

  it.each([
    ["const name = 'expo'; import(name);", 'unsupported computed import'],
    ["require('expo' + '/types');", 'unsupported computed import'],
    ["const r = require; r('yaml');", 'unsupported require alias'],
    ["const r = require.resolve; r('yaml');", 'unsupported require alias'],
    [
      "import { createRequire as cr } from 'node:module'; const r = cr(import.meta.url); r('yaml');",
      'unsupported createRequire',
    ],
    ["import.meta.resolve('yaml');", 'unsupported import.meta.resolve'],
    ["const { resolve } = import.meta; resolve('yaml');", 'unsupported import.meta.resolve alias'],
    ["module.require('yaml');", 'unsupported require member'],
    [
      "require.resolve('hermes-compiler', { paths: [require.resolve('react-native/package.json')] });",
      'unsupported provider-context',
    ],
  ])('visibly refuses unsupported resolution syntax %s', (source, reason) => {
    const target = fixture();
    expectRejectedMutationAndRestore(target, 'metro.config.cjs', source, reason);
  });

  it('accepts owned local references and rejects lexical and canonical escapes', () => {
    const target = fixture();
    write(target, 'src/local/index.ts', "import 'expo';\n");
    write(target, 'src/local/types.d.ts', 'export interface Thing {}\n');
    write(target, 'src/local/asset.ttf', 'owned asset fixture');
    write(
      target,
      'src/Local.ts',
      "/// <reference path='./local/types.d.ts' />\nimport './local'; require('./local/asset.ttf');\n"
    );
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
    expectRejectedMutationAndRestore(
      target,
      'src/Local.ts',
      "import '../../web/src/x';",
      'escapes candidate ownership'
    );
    for (const path of [
      'node_modules/expo',
      'android/app/build/helper',
      'ios/Pods/helper',
      'dist/helper',
    ])
      expectRejectedMutationAndRestore(
        target,
        'src/Local.ts',
        `import '../${path}';`,
        'excluded candidate output'
      );
    const external = join(target, '../foreign');
    mkdirSync(external);
    writeFileSync(join(external, 'helper.ts'), "import 'expo';\n");
    symlinkSync(external, join(target, 'src/foreign'));
    expect(() => assertDeclaredCandidateImports(target, manifest)).toThrow(
      'escapes candidate ownership'
    );
    rmSync(join(target, 'src/foreign'));
    symlinkSync(join(external, 'helper.ts'), join(target, 'src/symlink.ts'));
    expect(() => assertDeclaredCandidateImports(target, manifest)).toThrow(
      'escapes candidate ownership'
    );
    rmSync(join(target, 'src/symlink.ts'));
    symlinkSync(join(target, 'src/local'), join(target, 'src/local-alias'));
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
  });

  it('excludes only generated outputs and refuses local edges back into them', () => {
    const target = fixture();
    write(target, 'android/app/build/generated.js', "import 'yaml';");
    write(target, 'ios/Pods/generated.js', "import 'yaml';");
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
    expectRejectedMutationAndRestore(
      target,
      'src/index.ts',
      "import '../android/app/build/generated.js';",
      'excluded candidate output'
    );
    symlinkSync(join(target, 'android/app/build/generated.js'), join(target, 'src/generated.js'));
    expect(() => assertDeclaredCandidateImports(target, manifest)).toThrow(
      'excluded candidate output'
    );
  });

  it('leaves maintained native provider commands to their visible native qualification owner', () => {
    const target = fixture();
    write(
      target,
      'ios/Podfile',
      "node --print require.resolve('hermes-compiler', {paths: [require.resolve('react-native/package.json')]})"
    );
    write(
      target,
      'android/settings.gradle',
      "node --print require.resolve('@react-native/gradle-plugin/package.json')"
    );
    const result = assertDeclaredCandidateImports(target, manifest);
    expect(result.scannedCandidateFiles).not.toContain('ios/Podfile');
    expect(result.scannedCandidateFiles).not.toContain('android/settings.gradle');
    expect(result.nonCoverage).toContain(
      'native source, materialization and toolchain qualification'
    );
  });
});

describe('candidate configuration dependency ownership', () => {
  it('accepts explicit current Babel, Expo and tsconfig dependency references', () => {
    const target = fixture();
    write(target, 'babel.config.cjs', "module.exports = { presets: ['babel-preset-expo'] };\n");
    write(target, 'app.config.ts', "export default { expo: { plugins: [['expo', {}]] } };\n");
    write(target, 'app.json', '{"expo":{"plugins":[["expo",{}]]}}');
    write(target, 'tsconfig.base.json', '{"compilerOptions":{"types":["react"]}}');
    write(target, 'tsconfig.json', '{"extends":"./tsconfig.base.json"}');
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
  });

  it.each([
    ['tsconfig.json', '{"extends":"yaml"}', 'imports undeclared yaml'],
    ['tsconfig.json', '{"compilerOptions":{"types":["node"]}}', 'imports undeclared @types/node'],
    ['tsconfig.json', '{"compilerOptions":{"jsxImportSource":"yaml"}}', 'imports undeclared yaml'],
    ['app.json', '{"expo":{"plugins":["yaml"]}}', 'imports undeclared yaml'],
    [
      'babel.config.cjs',
      "module.exports={plugins:['babel-plugin-missing']};",
      'imports undeclared babel-plugin-missing',
    ],
    ['babel.config.cjs', "module.exports={presets:['expo']};", 'unsupported Babel alias'],
    [
      'babel.config.cjs',
      'module.exports={plugins:pluginNames};',
      'unsupported plugins configuration',
    ],
    [
      'babel.config.cjs',
      "module.exports={['plugins']:['babel-plugin-missing']};",
      'imports undeclared babel-plugin-missing',
    ],
    [
      'babel.config.cjs',
      "const plugins=['babel-plugin-missing']; module.exports={plugins};",
      'unsupported plugins configuration',
    ],
    [
      'tsconfig.json',
      '{"compilerOptions":{"paths":{"alias":["../../web/src/x"]}}}',
      'unsupported tsconfig paths ownership',
    ],
    [
      'tsconfig.json',
      '{"compilerOptions":{"rootDirs":["./src","../foreign"]}}',
      'unsupported tsconfig rootDirs ownership',
    ],
    ['tsconfig.json', '{"extends":"../foreign.json"}', 'escapes candidate ownership'],
    ['tsconfig.json', '{"include":["../foreign/**/*.ts"]}', 'escapes candidate ownership'],
  ])('rejects %s configuration for its stated reason', (path, source, reason) => {
    const target = fixture();
    expectRejectedMutationAndRestore(target, path, source, reason);
  });

  it('rejects dotfile Babel JSON and triple-slash undeclared type references', () => {
    const target = fixture();
    write(target, '.babelrc', '{"plugins":["babel-plugin-missing"]}');
    expect(() => assertDeclaredCandidateImports(target, manifest)).toThrow(
      'imports undeclared babel-plugin-missing'
    );
    rmSync(join(target, '.babelrc'));
    write(target, 'src/Types.d.ts', '/// <reference types="node" />\n');
    expect(() => assertDeclaredCandidateImports(target, manifest)).toThrow(
      'imports undeclared @types/node'
    );
    write(target, 'src/Types.d.ts', '/// <reference types="expo/types" />\n');
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
  });

  it('preserves shared shipping and Forge computed-import semantics', () => {
    expect(dependencySpecifiers('import(name); require(name);', 'shared.mjs')).toEqual([]);
    expect(dependencySpecifiers("require('yaml'); import('expo');", 'shared.mjs')).toEqual([
      'yaml',
      'expo',
    ]);
  });
});
