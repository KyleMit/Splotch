import { expect, it, onTestFinished } from 'vitest';
import { resolveConfig } from 'vite';
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  REACT_DEVELOPMENT_FILES,
  REACT_VERSION,
  assertReactBuildContext,
  assertStandaloneReactCompilerConfig,
  assertReactFileBindings,
  bindReactFile,
  bindReactPackageForFile,
  collectLoadedReactFiles,
} from '../../../migration/probes/web-host/host/reactProduction.ts';
import { WEB_HOST_JSX } from '../../../migration/probes/web-host/host/contract.ts';

const EXPECTED_DENIALS = [
  'react/cjs/react-compiler-runtime.development.js',
  'react/cjs/react-jsx-dev-runtime.development.js',
  'react/cjs/react-jsx-dev-runtime.react-server.development.js',
  'react/cjs/react-jsx-runtime.development.js',
  'react/cjs/react-jsx-runtime.react-server.development.js',
  'react/cjs/react.development.js',
  'react/cjs/react.react-server.development.js',
  'react-dom/cjs/react-dom-client.development.js',
  'react-dom/cjs/react-dom-profiling.development.js',
  'react-dom/cjs/react-dom-server-legacy.browser.development.js',
  'react-dom/cjs/react-dom-server-legacy.node.development.js',
  'react-dom/cjs/react-dom-server.browser.development.js',
  'react-dom/cjs/react-dom-server.bun.development.js',
  'react-dom/cjs/react-dom-server.edge.development.js',
  'react-dom/cjs/react-dom-server.node.development.js',
  'react-dom/cjs/react-dom-test-utils.development.js',
  'react-dom/cjs/react-dom.development.js',
  'react-dom/cjs/react-dom.react-server.development.js',
];
const PRODUCTION_FILES = [
  'react/index.js',
  'react/cjs/react.production.js',
  'react-dom/index.js',
  'react-dom/server.node.js',
  'react-dom/cjs/react-dom.production.js',
  'react-dom/cjs/react-dom-server-legacy.node.production.js',
  'react-dom/cjs/react-dom-server.node.production.js',
];

function ownedFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-react-owner-test-')));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function file(root, path, text = 'module.exports = {};\n') {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
  return full;
}
function packageManifest(root, name, version = REACT_VERSION, prefix = 'node_modules') {
  return file(root, `${prefix}/${name}/package.json`, JSON.stringify({ name, version }));
}
function productionFixture() {
  const root = ownedFixture();
  packageManifest(root, 'react');
  packageManifest(root, 'react-dom');
  const cachePaths = PRODUCTION_FILES.map((path) => file(root, `node_modules/${path}`));
  const bindings = collectLoadedReactFiles(root, cachePaths);
  expect(assertReactFileBindings(root, bindings)).toEqual(bindings);
  return { root, cachePaths, bindings };
}
function buildContext() {
  return {
    mode: 'production',
    nodeEnv: 'production',
    isProduction: true,
    perfMarks: 'false',
    jsx: { ...WEB_HOST_JSX },
  };
}

it('binds canonical copied generic source bytes without a React-package precondition', () => {
  const root = ownedFixture();
  file(root, 'generated/renderer.mjs', 'export const renderer = true;\n');
  const binding = bindReactFile(root, 'generated/renderer.mjs');
  expect(binding.path).toBe('generated/renderer.mjs');
  expect(binding.bytes).toBe(30);
  expect(binding.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(assertReactFileBindings(root, [binding])).toEqual([binding]);
  expect(() => bindReactFile(root, 'generated')).toThrow(/owned regular file/);
});

it('rejects changed bound bytes and distinguishes a recomputed generic identity', () => {
  const root = ownedFixture();
  file(root, 'source.ts', 'export const value = 1;\n');
  const original = bindReactFile(root, 'source.ts');
  expect(assertReactFileBindings(root, [original])).toEqual([original]);
  file(root, 'source.ts', 'export const value = 2;\n');
  expect(() => assertReactFileBindings(root, [original])).toThrow(/bytes differ from receipt/);
  const recomputed = bindReactFile(root, 'source.ts');
  expect(recomputed.sha256).not.toBe(original.sha256);
  expect(assertReactFileBindings(root, [recomputed])).toEqual([recomputed]);
});

it('rejects malformed, omitted and duplicate byte-binding records through the real reader', () => {
  const root = ownedFixture();
  file(root, 'source.ts');
  const binding = bindReactFile(root, 'source.ts');
  expect(assertReactFileBindings(root, [binding])).toEqual([binding]);
  for (const bad of [
    undefined,
    {},
    [],
    [null],
    [{ ...binding, unexpected: true }],
    [{ ...binding, bytes: -1 }],
    [{ ...binding, bytes: '1' }],
    [{ ...binding, sha256: 'bad' }],
    [{ ...binding, path: '' }],
    [binding, binding],
  ]) {
    expect(() => assertReactFileBindings(root, bad)).toThrow(/React input/);
  }
});

it('rejects absolute, escaping, alias and non-POSIX receipt paths', () => {
  const root = ownedFixture();
  file(root, 'source.ts');
  const binding = bindReactFile(root, 'source.ts');
  expect(assertReactFileBindings(root, [binding])).toEqual([binding]);
  for (const path of [
    '../source.ts',
    './source.ts',
    'dir//source.ts',
    'dir/../source.ts',
    'dir\\source.ts',
    join(root, 'source.ts'),
  ]) {
    expect(() => assertReactFileBindings(root, [{ ...binding, path }])).toThrow(
      /copy-relative POSIX/
    );
  }
});

it('rejects actual same-copy and outside symlink paths and borrowed hardlinks', () => {
  const root = ownedFixture();
  const other = ownedFixture();
  file(root, 'source.ts');
  file(other, 'foreign.ts');
  expect(bindReactFile(root, 'source.ts').path).toBe('source.ts');
  symlinkSync('./source.ts', join(root, 'alias.ts'));
  symlinkSync(join(other, 'foreign.ts'), join(root, 'escape.ts'));
  symlinkSync(other, join(root, 'foreign-directory'));
  for (const path of ['alias.ts', 'escape.ts', 'foreign-directory/foreign.ts'])
    expect(() => bindReactFile(root, path)).toThrow(/symlink or canonical alias/);
  linkSync(join(other, 'foreign.ts'), join(root, 'borrowed.ts'));
  expect(() => bindReactFile(root, 'borrowed.ts')).toThrow(/owned regular file/);
});

it('rejects a noncanonical copy-root alias before binding source bytes', () => {
  const root = ownedFixture();
  const aliases = ownedFixture();
  file(root, 'source.ts');
  expect(bindReactFile(root, 'source.ts').path).toBe('source.ts');
  symlinkSync(root, join(aliases, 'copy'));
  expect(() => bindReactFile(join(aliases, 'copy'), 'source.ts')).toThrow(/canonical directory/);
});

it('rejects malformed cache-path input after a valid filesystem setup', () => {
  const { root, cachePaths } = productionFixture();
  expect(collectLoadedReactFiles(root, cachePaths).length).toBeGreaterThan(0);
  for (const value of [null, {}, [42]])
    expect(() => collectLoadedReactFiles(root, value)).toThrow(/cache paths must be strings/);
});

it('collects production loaded files and metadata while ignoring unrelated cache entries', () => {
  const { root, cachePaths, bindings } = productionFixture();
  const unrelated = file(ownedFixture(), 'node_modules/unrelated-package/index.js');
  const nested = file(root, 'node_modules/react-dom/node_modules/scheduler/index.js');
  const repeated = collectLoadedReactFiles(root, [...cachePaths, unrelated, nested, cachePaths[0]]);
  expect(repeated).toEqual(bindings);
  expect(bindings.map((row) => row.path)).toContain('node_modules/react/package.json');
  expect(bindings.map((row) => row.path)).toContain('node_modules/react-dom/package.json');
  expect(bindings.map((row) => row.path)).toEqual(bindings.map((row) => row.path).sort());
});

it('accepts inert production selector source containing both conditional branch filenames', () => {
  const { root, cachePaths } = productionFixture();
  file(
    root,
    'node_modules/react/index.js',
    "module.exports = process.env.NODE_ENV === 'production' ? 'react.production.js' : 'react.development.js';\n"
  );
  file(
    root,
    'node_modules/react-dom/server.node.js',
    "module.exports = process.env.NODE_ENV === 'production' ? 'react-dom-server-legacy.node.production.js' : 'react-dom-server-legacy.node.development.js';\n"
  );
  const bindings = collectLoadedReactFiles(root, cachePaths);
  expect(assertReactFileBindings(root, bindings)).toEqual(bindings);
});

it('classifies owned unrelated source without requiring SSR loaded modules', () => {
  const root = ownedFixture();
  file(root, 'web/source.ts', 'export const source = true;\n');
  file(root, 'node_modules/react-dom/node_modules/scheduler/index.js');
  expect(bindReactPackageForFile(root, 'web/source.ts')).toBeNull();
  expect(
    bindReactPackageForFile(root, 'node_modules/react-dom/node_modules/scheduler/index.js')
  ).toBeNull();
  expect(() => bindReactPackageForFile(root, '../source.ts')).toThrow(/copy-relative POSIX/);
});

it.each(['react', 'react-dom'])(
  'binds graph selector %s package identity and rejects real version/name drift',
  (name) => {
    const root = ownedFixture();
    packageManifest(root, name);
    const path = `node_modules/${name}/index.js`;
    file(
      root,
      path,
      "module.exports = process.env.NODE_ENV === 'production' ? 'production' : 'development';\n"
    );
    const identity = bindReactPackageForFile(root, path);
    expect(identity).toEqual(bindReactFile(root, `node_modules/${name}/package.json`));
    expect(assertReactFileBindings(root, [identity])).toEqual([identity]);
    packageManifest(root, name, '19.2.4');
    expect(() => bindReactPackageForFile(root, path)).toThrow(
      `Loaded React package must be ${name}@19.2.3`
    );
    file(
      root,
      `node_modules/${name}/package.json`,
      JSON.stringify({ name: 'other', version: REACT_VERSION })
    );
    expect(() => bindReactPackageForFile(root, path)).toThrow(
      `Loaded React package must be ${name}@19.2.3`
    );
  }
);

it('binds the nearest nested graph package without mistaking its parent ReactDOM identity', () => {
  const root = ownedFixture();
  packageManifest(root, 'react-dom');
  const prefix = 'node_modules/react-dom/node_modules';
  packageManifest(root, 'react', REACT_VERSION, prefix);
  const path = `${prefix}/react/index.js`;
  file(root, path);
  expect(bindReactPackageForFile(root, path)).toEqual(
    bindReactFile(root, `${prefix}/react/package.json`)
  );
  packageManifest(root, 'react', '19.2.4', prefix);
  expect(() => bindReactPackageForFile(root, path)).toThrow(
    /Loaded React package must be react@19.2.3/
  );
});

it('rejects each missing actual production CJS owner despite present selector files', () => {
  const { root, cachePaths } = productionFixture();
  for (const member of [
    'react/cjs/react.production.js',
    'react-dom/cjs/react-dom-server-legacy.node.production.js',
  ]) {
    const reduced = cachePaths.filter((path) => path !== join(root, 'node_modules', member));
    expect(() => collectLoadedReactFiles(root, reduced)).toThrow(
      `Required production React module did not load: ${member}`
    );
  }
});

it('pins the exact independently retained18-file development denial vocabulary', () => {
  expect(REACT_VERSION).toBe('19.2.3');
  expect([...REACT_DEVELOPMENT_FILES]).toEqual(EXPECTED_DENIALS);
});

it.each(EXPECTED_DENIALS)(
  'rejects actual same-version participating development file %s',
  (member) => {
    const { root, cachePaths } = productionFixture();
    const development = file(root, `node_modules/${member}`);
    expect(() => collectLoadedReactFiles(root, [...cachePaths, development])).toThrow(
      `Development React module participated: ${member}`
    );
  }
);

it('rejects a development file even after its receipt bytes were recomputed', () => {
  const { root, cachePaths, bindings } = productionFixture();
  const member = 'react-dom/cjs/react-dom-server-legacy.node.development.js';
  const development = file(root, `node_modules/${member}`);
  const recomputed = bindReactFile(root, `node_modules/${member}`);
  expect(assertReactFileBindings(root, [...bindings, recomputed])).toHaveLength(
    bindings.length + 1
  );
  expect(() => collectLoadedReactFiles(root, [...cachePaths, development])).toThrow(
    `Development React module participated: ${member}`
  );
});

it.each([
  'react/jsx-dev-runtime.js',
  'react/jsx-dev-runtime.react-server.js',
  'react/cjs/react-jsx-dev-runtime.production.js',
])('rejects participating JSX-development owner %s', (member) => {
  const { root, cachePaths } = productionFixture();
  const development = file(root, `node_modules/${member}`);
  expect(() => collectLoadedReactFiles(root, [...cachePaths, development])).toThrow(
    `Development React module participated: ${member}`
  );
});

it.each(['react', 'react-dom'])('rejects a participating %s version or name drift', (name) => {
  const { root, cachePaths } = productionFixture();
  packageManifest(root, name, '19.2.4');
  expect(() => collectLoadedReactFiles(root, cachePaths)).toThrow(
    `Loaded React package must be ${name}@19.2.3`
  );
  file(
    root,
    `node_modules/${name}/package.json`,
    JSON.stringify({ name: 'other', version: REACT_VERSION })
  );
  expect(() => collectLoadedReactFiles(root, cachePaths)).toThrow(
    `Loaded React package must be ${name}@19.2.3`
  );
});

it('binds every participating nested React copy and rejects its separate version drift', () => {
  const { root, cachePaths } = productionFixture();
  const prefix = 'node_modules/nested-consumer/node_modules';
  packageManifest(root, 'react', REACT_VERSION, prefix);
  const nested = file(root, `${prefix}/react/cjs/react.production.js`);
  const bindings = collectLoadedReactFiles(root, [...cachePaths, nested]);
  expect(bindings.map((row) => row.path)).toContain(`${prefix}/react/package.json`);
  expect(bindings.map((row) => row.path)).toContain(`${prefix}/react/cjs/react.production.js`);
  packageManifest(root, 'react', '19.2.4', prefix);
  expect(() => collectLoadedReactFiles(root, [...cachePaths, nested])).toThrow(
    /Loaded React package must be react@19.2.3/
  );
});

it('rejects participating React cache paths outside the owned copy', () => {
  const { root, cachePaths } = productionFixture();
  const other = ownedFixture();
  packageManifest(other, 'react');
  const escaped = file(other, 'node_modules/react/cjs/react.production.js');
  expect(() => collectLoadedReactFiles(root, [...cachePaths, escaped])).toThrow(
    /copy-relative POSIX/
  );
});

it('rejects participating React aliases through the actual regular-file binder', () => {
  const { root, cachePaths } = productionFixture();
  const other = ownedFixture();
  packageManifest(other, 'react');
  file(other, 'node_modules/react/cjs/react.production.js');
  mkdirSync(join(root, 'node_modules/aliased/node_modules'), { recursive: true });
  symlinkSync(
    join(other, 'node_modules/react'),
    join(root, 'node_modules/aliased/node_modules/react')
  );
  const alias = join(root, 'node_modules/aliased/node_modules/react/cjs/react.production.js');
  expect(() => collectLoadedReactFiles(root, [...cachePaths, alias])).toThrow(
    /symlink or canonical alias/
  );
});

it('validates actual Vite disabled-config normalization and the fixed standalone compiler owners', async () => {
  const root = ownedFixture();
  const other = ownedFixture();
  const entry = file(
    root,
    'migration/probes/web-host/host/renderChrome.ts',
    'export const fixture = true;\n'
  );
  const output = join(root, 'migration/probes/web-host/generated-chrome');
  const resolved = await resolveConfig(
    {
      root,
      configFile: false,
      mode: 'production',
      oxc: { jsx: WEB_HOST_JSX },
      build: { ssr: entry, outDir: output },
    },
    'build',
    'production',
    'production'
  );
  expect(resolved.configFile).toBeUndefined();
  expect(resolved.inlineConfig.configFile).toBe(false);
  expect(() => assertStandaloneReactCompilerConfig(resolved, root)).not.toThrow();
  expect(() =>
    assertStandaloneReactCompilerConfig(
      { ...resolved, configFile: join(root, 'vite.config.ts') },
      root
    )
  ).toThrow(/explicit disabled config-file loading/);
  expect(() =>
    assertStandaloneReactCompilerConfig(
      { ...resolved, inlineConfig: { ...resolved.inlineConfig, configFile: undefined } },
      root
    )
  ).toThrow(/explicit disabled config-file loading/);
  expect(() => assertStandaloneReactCompilerConfig({ ...resolved, root: other }, root)).toThrow(
    /changed its owned root/
  );
  expect(() =>
    assertStandaloneReactCompilerConfig(
      { ...resolved, build: { ...resolved.build, ssr: join(root, 'other-renderer.ts') } },
      root
    )
  ).toThrow(/changed its fixed SSR entry/);
  expect(() =>
    assertStandaloneReactCompilerConfig(
      { ...resolved, build: { ...resolved.build, outDir: join(root, 'other-output') } },
      root
    )
  ).toThrow(/changed its fixed output directory/);
});

it('requires the exact production environment and shared automatic JSX context', () => {
  const context = buildContext();
  expect(assertReactBuildContext(context).jsx).toBe(WEB_HOST_JSX);
  for (const changed of [
    undefined,
    null,
    {},
    { ...context, extra: true },
    { ...context, mode: 'development' },
    { ...context, nodeEnv: 'development' },
    { ...context, nodeEnv: 'test' },
    { ...context, isProduction: false },
    { ...context, perfMarks: true },
    { ...context, perfMarks: 'true' },
    { ...context, jsx: { ...WEB_HOST_JSX, development: true } },
    { ...context, jsx: { ...WEB_HOST_JSX, runtime: 'classic' } },
    { ...context, jsx: { ...WEB_HOST_JSX, importSource: 'other' } },
    { ...context, jsx: { ...WEB_HOST_JSX, extra: true } },
  ]) {
    expect(() => assertReactBuildContext(changed)).toThrow(/React.*(context|record|fields)/);
  }
});
