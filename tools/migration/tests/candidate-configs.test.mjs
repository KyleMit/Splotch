import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertDeclaredCandidateImports, dependencySpecifiers } from '../lib/native-identity.mjs';
import { candidateImport, createCandidateFixtures } from './candidate-fixtures.mjs';

const { manifest, fixture, write, expectRejectedMutationAndRestore, cleanup } =
  createCandidateFixtures();
afterEach(cleanup);

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
    [
      'babel.config.cjs',
      "module.exports={presets:[[require.resolve('babel-preset-expo'),{jsxImportSource:'yaml'}]]};",
      'unsupported Babel options',
    ],
    [
      'babel.config.cjs',
      "module.exports={presets:[[require.resolve('babel-preset-expo'),{native:{jsxImportSource:'yaml'}}]]};",
      'unsupported Babel options',
    ],
    [
      'babel.config.cjs',
      "module.exports={presets:[[require.resolve('babel-preset-expo'),JSON.parse('{}')]]};",
      'unsupported Babel options',
    ],
    [
      'babel.config.cjs',
      "module.exports={plugins:[[require.resolve('expo'),{},'extra']]};",
      'unsupported extra Babel tuple members',
    ],
    [
      'babel.config.cjs',
      "module.exports={plugins:[['module:expo',{arbitrary:true}]]};",
      'unsupported Babel options',
    ],
    [
      'babel.config.cjs',
      "const cfg=(module.exports={presets:[require.resolve('babel-preset-expo')]}); Object.assign(cfg,{plugins:['babel-plugin-react-compiler']});",
      'unsupported configuration export alias',
    ],
    [
      'babel.config.cjs',
      "const {plugins}=(module.exports={presets:[require.resolve('babel-preset-expo')],plugins:[]}); plugins.push('babel-plugin-react-compiler');",
      'unsupported configuration export alias',
    ],
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

  it.each(['presets', 'plugins'])('qualifies default and literal-empty Babel %s options', (key) => {
    const target = fixture();
    write(target, 'babel.config.cjs', `module.exports={${key}:[[require.resolve('expo'),{}]]};`);
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
    write(target, '.babelrc', JSON.stringify({ [key]: [['module:expo', {}]] }));
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
    expectRejectedMutationAndRestore(
      target,
      '.babelrc',
      JSON.stringify({ [key]: [['module:expo', { jsxImportSource: 'yaml' }]] }),
      'unsupported Babel options'
    );
    expectRejectedMutationAndRestore(
      target,
      '.babelrc',
      JSON.stringify({ [key]: [['module:expo', {}, 'extra']] }),
      'unsupported extra Babel tuple members'
    );
  });

  it('preserves Expo plugin option handling under its own consumer', () => {
    const target = fixture();
    write(target, 'app.config.cjs', "module.exports={plugins:[['expo',{arbitrary:true}]]};");
    write(target, 'app.json', '{"expo":{"plugins":[["expo",{"arbitrary":true}]]}}');
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
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

  it.each(['app.json', 'app.config.json'])('covers both Expo JSON forms in %s', (path) => {
    const target = fixture();
    write(target, path, '{"plugins":[["expo",{}]]}');
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
    expectRejectedMutationAndRestore(
      target,
      path,
      '{"plugins":["expo-font"]}',
      'imports undeclared expo-font'
    );
    write(target, path, '{"expo":{"plugins":["expo"]},"plugins":["expo-font"]}');
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
  });

  it.each([
    ['babel.config.cjs', "module.exports=()=>({presets:['babel-preset-expo']});"],
    [
      'babel.config.cjs',
      "module.exports=function(api){api.cache(true); return {presets:[require.resolve('babel-preset-expo')]};};",
    ],
    ['app.config.ts', "export default function(){return {plugins:[['expo',{}]]};}"],
    ['app.config.cjs', "module.exports=()=>({expo:{plugins:['expo']}, plugins:['expo-font']});"],
  ])('accepts finite literal configuration exports in %s', (path, source) => {
    const target = fixture();
    write(target, path, source);
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
  });

  it.each([
    [
      'babel.config.cjs',
      "const cfg={}; cfg.plugins=['babel-plugin-react-compiler']; module.exports=cfg;",
      'unsupported plugins member operation',
    ],
    [
      'babel.config.cjs',
      "const cfg={plugins:[]}; cfg.plugins.push('babel-plugin-react-compiler'); module.exports=cfg;",
      'unsupported plugins member operation',
    ],
    [
      'babel.config.cjs',
      'module.exports=JSON.parse(\'{"plugins":["babel-plugin-react-compiler"]}\');',
      'unsupported opaque configuration export',
    ],
    [
      'babel.config.cjs',
      "module.exports={env:{development:{plugins:['babel-plugin-react-compiler']}}};",
      'unsupported Babel configuration key env',
    ],
    [
      'babel.config.cjs',
      "module.exports={overrides:[{plugins:['babel-plugin-react-compiler']}]};",
      'unsupported Babel configuration key overrides',
    ],
    [
      'babel.config.cjs',
      "module.exports={extends:'../foreign'};",
      'unsupported Babel configuration key extends',
    ],
    [
      'app.config.cjs',
      "module.exports=({config})=>({...config, plugins:['expo-font']});",
      'unsupported configuration spread',
    ],
    [
      'app.config.cjs',
      "const cfg={plugins:[]}; const list=cfg.plugins; list.push('expo-font'); module.exports=cfg;",
      'unsupported plugins member operation',
    ],
    [
      'app.config.cjs',
      "const cfg={}; cfg['plu'+'gins']=['expo-font']; module.exports=cfg;",
      'unsupported computed configuration mutation',
    ],
    [
      'app.config.cjs',
      'module.exports=JSON.parse(\'{"plugins":["expo-font"]}\');',
      'unsupported opaque configuration export',
    ],
    [
      'app.config.cjs',
      "module.exports={get plugins(){return ['expo-font'];}};",
      'unsupported plugins configuration',
    ],
    ['app.config.cjs', 'module.exports=({config})=>config;', 'unsupported opaque configuration'],
  ])('visibly refuses unestablished dependency configuration in %s', (path, source, reason) => {
    const target = fixture();
    write(target, path, 'module.exports={plugins:[]};');
    expectRejectedMutationAndRestore(target, path, source, reason);
  });

  it.each([
    ['const {plugins}={};', 'unsupported configuration vocabulary binding'],
    ['const {presets:list}={};', 'unsupported configuration vocabulary binding'],
    ["const {['plugins']:list}={};", 'unsupported configuration vocabulary binding'],
    ['const extra={plugins:[]};', 'unsupported foreign configuration vocabulary'],
    ['const extra={presets:[]};', 'unsupported foreign configuration vocabulary'],
  ])('refuses unowned Babel vocabulary: %s', (prefix, reason) => {
    const target = fixture();
    expectRejectedMutationAndRestore(
      target,
      'babel.config.cjs',
      `${prefix} module.exports={presets:['babel-preset-expo']};`,
      reason
    );
  });

  it.each([
    ['const {expo}={};', 'unsupported configuration vocabulary binding'],
    ['const extra={expo:{plugins:[]}};', 'unsupported foreign configuration vocabulary'],
  ])('refuses unowned Expo vocabulary: %s', (prefix, reason) => {
    const target = fixture();
    write(target, 'app.config.cjs', 'module.exports={plugins:[]};');
    expectRejectedMutationAndRestore(
      target,
      'app.config.cjs',
      `${prefix} module.exports={plugins:[]};`,
      reason
    );
  });

  it.each(['app.config.ts', 'babel.config.ts', '.babelrc.ts'])(
    'accepts nested ordinary app modules named %s',
    (name) => {
      const target = fixture();
      write(target, `src/config/${name}`, "export const apiBase='https://example.invalid';\n");
      expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
    }
  );

  it.each(['app.config.json', 'babel.config.json', '.babelrc.json'])(
    'accepts nested ordinary JSON modules named %s',
    (name) => {
      const target = fixture();
      const path = `src/config/${name}`;
      write(target, path, '{"apiBase":"https://example.invalid"}');
      write(target, 'src/JsonProbe.ts', candidateImport(`./config/${name}`));
      const result = assertDeclaredCandidateImports(target, manifest);
      expect(result.scannedCandidateFiles).not.toContain(path);
    }
  );

  it.each([
    [
      "module.exports={expo:{plugins:[]},expo:{plugins:['expo-font']}};",
      'unsupported duplicate configuration property expo',
    ],
    [
      "module.exports={expo:{plugins:[],['plugins']:['expo-font']}};",
      'unsupported duplicate configuration property plugins',
    ],
    ["module.exports={__proto__:{plugins:['expo-font']}};", 'unsupported configuration prototype'],
    [
      "Object.prototype.plugins=['expo-font']; module.exports={};",
      'unsupported configuration prototype',
    ],
    [
      "module.exports={['plu'+'gins']:['expo-font']};",
      'unsupported computed configuration property',
    ],
    ["module.exports={plugins(){return ['expo-font'];}};", 'unsupported plugins configuration'],
  ])('refuses unsupported literal configuration key shapes: %s', (source, reason) => {
    const target = fixture();
    write(target, 'app.config.cjs', 'module.exports={plugins:[]};');
    expectRejectedMutationAndRestore(target, 'app.config.cjs', source, reason);
  });

  it.each(['env', 'overrides', 'extends'])('visibly refuses Babel JSON %s ownership', (key) => {
    const target = fixture();
    write(
      target,
      '.babelrc',
      JSON.stringify({ [key]: { plugins: ['babel-plugin-react-compiler'] } })
    );
    expect(() => assertDeclaredCandidateImports(target, manifest)).toThrow(
      `unsupported Babel configuration key ${key}`
    );
    rmSync(join(target, '.babelrc'));
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
  });

  it.each(['config', 'dist'])(
    'selects %s.json when an extensionless tsconfig target is a directory',
    (name) => {
      const target = fixture();
      mkdirSync(join(target, name));
      write(target, `${name}.json`, '{"compilerOptions":{"types":["react"]}}');
      write(target, 'tsconfig.json', JSON.stringify({ extends: `./${name}` }));
      const result = assertDeclaredCandidateImports(target, manifest);
      expect(result.localTsconfigFiles).toContain(`${name}.json`);
    }
  );

  it('prefers an existing extensionless tsconfig file over the JSON fallback', () => {
    const target = fixture();
    write(target, 'config', '{"compilerOptions":{"types":["react"]}}');
    write(target, 'config.json', '{"compilerOptions":{"types":["node"]}}');
    write(target, 'tsconfig.json', '{"extends":"./config"}');
    const result = assertDeclaredCandidateImports(target, manifest);
    expect(result.localTsconfigFiles).toContain('config');
    expect(result.localTsconfigFiles).not.toContain('config.json');
  });

  it('refuses a local tsconfig alias before physical-file cache reuse can erase its lexical context', () => {
    const target = fixture();
    write(target, 'base.json', '{"extends":"./next.json"}');
    write(target, 'next.json', '{"compilerOptions":{"types":["react"]}}');
    write(target, 'deep/next.json', '{"compilerOptions":{"types":["node"]}}');
    symlinkSync(join(target, 'base.json'), join(target, 'deep/alias.json'));
    write(target, 'tsconfig.json', '{"extends":["./base.json","./deep/alias.json"]}');
    expect(() => assertDeclaredCandidateImports(target, manifest)).toThrow(
      'unsupported symlinked local tsconfig'
    );
    write(target, 'tsconfig.json', '{"extends":"./base.json"}');
    expect(() => assertDeclaredCandidateImports(target, manifest)).not.toThrow();
  });

  it('refuses semantic configuration aliases and restores their current owners', () => {
    const target = fixture();
    write(target, 'config-helper.cjs', 'module.exports={plugins:[]};');
    symlinkSync(join(target, 'config-helper.cjs'), join(target, 'app.config.cjs'));
    expect(() => assertDeclaredCandidateImports(target, manifest)).toThrow(
      'unsupported symlinked candidate configuration'
    );
    rmSync(join(target, 'app.config.cjs'));
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
