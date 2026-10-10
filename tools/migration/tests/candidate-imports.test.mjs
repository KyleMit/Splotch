import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertDeclaredCandidateImports } from '../lib/native-identity.mjs';
import { candidateImport, createCandidateFixtures } from './candidate-fixtures.mjs';

const { candidate, manifest, fixture, write, expectRejectedMutationAndRestore, cleanup } =
  createCandidateFixtures();
afterEach(cleanup);

describe('candidate source import ownership', () => {
  it('accepts the actual candidate and exposes finite generated subpath exclusions', () => {
    const result = assertDeclaredCandidateImports(candidate, manifest);
    expect(result.scannedCandidateFiles).toEqual([
      'app.json',
      'babel.config.cjs',
      'metro.config.cjs',
      'scripts/check-transform.cjs',
      'src/DrawingScreen.tsx',
      'src/ProbeApp.tsx',
      'src/drawing/DrawingSurface.tsx',
      'src/drawing/contactCohort.ts',
      'src/drawing/contactResponder.ts',
      'src/drawing/interactions.ts',
      'src/drawing/measurePaper.ts',
      'src/drawing/measurePaper.web.ts',
      'src/drawing/model.ts',
      'src/drawing/palette.ts',
      'src/drawing/paperGeometry.ts',
      'src/drawing/theme.ts',
      'src/drawing/touchBoundary.ts',
      'src/index.ts',
      'src/platform/drawingFiles.ts',
      'src/platform/drawingFiles.web.ts',
      'src/useDrawingScreen.ts',
      'tsconfig.json',
    ]);
    expect(result.generatedSubpathExclusions).toContain('android/app/build');
    expect(result.generatedSubpathExclusions).not.toContain('android');
    expect(result.generatedSubpathExclusions).not.toContain('ios');
    expect(result.nonCoverage).toContain('Podfile/Gradle provider-context');
    expect(result.nonCoverage).toContain('Metro string module references');
    expect(result.nonCoverage).toContain('alternate config lookup');
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
    write(target, 'src/index.ts', `${entry}\n${candidateImport('./Extra')}\n`);
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
      candidateImport('../scripts/helper.cjs'),
      'Node configuration or script into app source'
    );
    expectRejectedMutationAndRestore(
      target,
      'src/index.ts',
      candidateImport('../metro.config'),
      'Node configuration or script into app source'
    );
    symlinkSync(join(target, 'scripts/helper.cjs'), join(target, 'src/helper.cjs'));
    expect(() => assertDeclaredCandidateImports(target, manifest)).toThrow(
      'src/helper.cjs aliases Node configuration or script into app source'
    );
    rmSync(join(target, 'src/helper.cjs'));
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
  });

  it.each(['buffer', 'events', 'url', 'util'])(
    'accepts an explicitly declared bare %s polyfill',
    (specifier) => {
      const target = fixture();
      write(target, 'src/Polyfill.ts', `import '${specifier}';`);
      const declared = {
        ...manifest,
        devDependencies: { ...manifest.devDependencies, [specifier]: 'fixture-only' },
      };
      expect(() => assertDeclaredCandidateImports(target, declared)).not.toThrow();
      write(target, 'src/Polyfill.ts', `import 'node:${specifier}';`);
      expect(() => assertDeclaredCandidateImports(target, declared)).toThrow(
        'Node builtin into app source'
      );
      rmSync(join(target, 'src/Polyfill.ts'));
      expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
    }
  );

  it.each(['file', 'directory'])(
    'rejects an extensionless app import through a Node-owned %s alias',
    (kind) => {
      const target = fixture();
      write(target, 'scripts/helper.ts', "import 'node:fs';");
      const alias = join(target, 'src/alias.ts');
      symlinkSync(join(target, kind === 'file' ? 'scripts/helper.ts' : 'scripts'), alias);
      const entry = readFileSync(join(target, 'src/index.ts'), 'utf8');
      write(target, 'src/index.ts', `${entry}\n${candidateImport('./alias')}`);
      expect(() => assertDeclaredCandidateImports(target, manifest)).toThrow(
        'src/alias.ts aliases Node configuration or script into app source'
      );
      rmSync(alias);
      write(target, 'src/index.ts', entry);
      expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
    }
  );

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
      `/// <reference path='./local/types.d.ts' />\n${candidateImport('./local')} require('./local/asset.ttf');\n`
    );
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
    expectRejectedMutationAndRestore(
      target,
      'src/Local.ts',
      candidateImport('../../web/src/x'),
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
        candidateImport(`../${path}`),
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
      candidateImport('../android/app/build/generated.js'),
      'excluded candidate output'
    );
    symlinkSync(join(target, 'android/app/build/generated.js'), join(target, 'src/generated.js'));
    expect(() => assertDeclaredCandidateImports(target, manifest)).toThrow(
      'excluded candidate output'
    );
  });

  it.each([
    '/** @jsxImportSource yaml */\nexport const probe=<>probe</>;',
    '// @jsxImportSource yaml\nexport const probe=<>probe</>;',
    "import {Fragment} from 'react';\n/** @jsxImportSource yaml */\nexport const probe=<>probe</>;",
    'export const probe=<>probe</>;\n/** @jsxImportSource yaml */',
    'export const probe=<>probe</>;\n// @jsxImportSource yaml',
    '/** @jsxImportSource yaml extra */\nexport const probe=<>probe</>;',
    'export const probe=<>{/* @jsxImportSource yaml */}</>;',
    'export function noop(){/* @jsxImportSource yaml */}\nexport const probe=<>probe</>;',
    'export const text=`value ${/* @jsxImportSource yaml */ 1}`;\nexport const probe=<>probe</>;',
    '/** @jsxImportSource react */\nexport const probe=<>probe</>;',
  ])('visibly refuses per-file JSX import-source pragmas: %s', (source) => {
    const target = fixture();
    write(target, 'src/PragmaHelper.tsx', 'export const probe=<>probe</>;');
    write(target, 'src/index.ts', candidateImport('./PragmaHelper'));
    expectRejectedMutationAndRestore(
      target,
      'src/PragmaHelper.tsx',
      source,
      'unsupported per-file JSX import source'
    );
  });

  it.each([
    'export const probe=<>probe</>;',
    "export const text='/** @jsxImportSource yaml */';\nexport const probe=<>probe</>;",
    'export const text=`/** @jsxImportSource yaml */`;\nexport const probe=<>probe</>;',
    'export const probe=<>/** @jsxImportSource yaml */</>;',
    'export const pattern=/@jsxImportSource yaml/;\nexport const probe=<>probe</>;',
  ])('preserves ordinary JSX content and automatic React runtime: %s', (source) => {
    const target = fixture();
    write(target, 'src/PragmaHelper.tsx', source);
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
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
