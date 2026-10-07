import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import type { Plugin } from 'vite';
import type { ReactGraphStage } from './reactGraph.ts';
import { chromeDigest } from './chromeHtml.ts';
import {
  assertReactFileBindings,
  bindReactFile,
  type ReactFileBinding,
} from './reactProduction.ts';

// The published package omits the core runtime tails; their complete tagged-source identities bind the native producer.
const ROLLDOWN_RUNTIME_SOURCE = {
  version: '1.2.11',
  base: { bytes: 3445, sha256: '43e801e2a0ea81a50cfd48f9eb7659c5db77f4f0fd507c894d0b925fe3343982' },
  browserTail: {
    bytes: 960,
    sha256: 'f7bf7efba1cb6d728291bdd198d95ee50eebdb2d9fcbcd2a5c607ccbe90d9ad4',
  },
  nodeHead: {
    bytes: 45,
    sha256: 'fd76ae3c1f6d367c3f75ddb6635442c06815d2ee7dbc6b53246de4cabb1c6272',
  },
  nodeTail: {
    bytes: 333,
    sha256: '3916132869b16787e40afab27f8d898c22a45712bb687141deaa0ac30a7e6fd1',
  },
};

type RuntimeProducer = {
  api: ReactFileBinding;
  manifest: ReactFileBinding;
  runtimeApi: ReactFileBinding;
  base: ReactFileBinding;
  native: ReactFileBinding;
  nativeManifest: ReactFileBinding;
};
export type RolldownRuntimeSource = {
  kind: 'rolldown-runtime';
  apiVersion: string;
  target: { platform: 'browser' | 'node'; format: 'es' };
  producer: RuntimeProducer;
  rawCode: string;
  rawSha256: string;
  renderedCode: string | null;
  renderedSha256: string | null;
};

function record(value: unknown, keys?: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (keys && Object.keys(value).sort().join() !== [...keys].sort().join())
  )
    throw new Error('Malformed Rolldown runtime binding');
  return value as Record<string, unknown>;
}

function parsed(code: string): ts.SourceFile {
  return ts.createSourceFile('producer.mjs', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}

function runtimeId(code: string): string {
  const source = parsed(code);
  const declarations = source.statements.flatMap((statement) =>
    ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.flatMap((declaration) =>
          ts.isIdentifier(declaration.name) && declaration.name.text === 'RUNTIME_MODULE_ID'
            ? [{ declaration, flags: statement.declarationList.flags }]
            : []
        )
      : []
  );
  const exports = source.statements.flatMap((statement) =>
    ts.isExportDeclaration(statement) &&
    statement.exportClause &&
    ts.isNamedExports(statement.exportClause)
      ? statement.exportClause.elements
          .filter((element) => element.name.text === 'RUNTIME_MODULE_ID')
          .map((element) => ({ statement, element }))
      : []
  );
  const local = declarations[0];
  const exported = exports[0];
  if (
    declarations.length !== 1 ||
    !local ||
    !(local.flags & ts.NodeFlags.Const) ||
    !local.declaration.initializer ||
    !ts.isStringLiteral(local.declaration.initializer) ||
    !local.declaration.initializer.text.startsWith('\0') ||
    exports.length !== 1 ||
    !exported ||
    exported.statement.moduleSpecifier ||
    exported.statement.isTypeOnly ||
    exported.element.isTypeOnly ||
    (exported.element.propertyName ?? exported.element.name).text !== 'RUNTIME_MODULE_ID'
  )
    throw new Error('Rolldown API omitted its literal exported runtime identity');
  return local.declaration.initializer.text;
}

function packageApi(copyRoot: string) {
  const require = createRequire(join(copyRoot, 'package.json'));
  const vite = require.resolve('vite');
  const fromVite = createRequire(vite);
  const api = fromVite.resolve('rolldown');
  const fromApi = createRequire(api);
  const manifest = fromApi.resolve('rolldown/package.json');
  const runtimeApi = fromApi.resolve('rolldown/experimental/runtime');
  const imports = parsed(readFileSync(runtimeApi, 'utf8')).statements.flatMap((statement) =>
    ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : []
  );
  if (imports.length !== 1 || !imports[0].startsWith('./'))
    throw new Error('Rolldown runtime API omitted its actual base source import');
  const base = resolve(dirname(runtimeApi), imports[0]);
  return { api, manifest, runtimeApi, base };
}

function producer(copyRoot: string, nativePath: string): RuntimeProducer {
  const api = packageApi(copyRoot);
  const manifest = record(JSON.parse(readFileSync(api.manifest, 'utf8')));
  const nativeManifest = join(dirname(nativePath), 'package.json');
  const nativePackage = record(JSON.parse(readFileSync(nativeManifest, 'utf8')));
  const optional = record(manifest.optionalDependencies);
  if (
    manifest.name !== 'rolldown' ||
    manifest.version !== ROLLDOWN_RUNTIME_SOURCE.version ||
    typeof manifest.version !== 'string' ||
    typeof nativePackage.name !== 'string' ||
    !nativePackage.name.startsWith('@rolldown/binding-') ||
    nativePackage.version !== manifest.version ||
    optional[nativePackage.name] !== manifest.version ||
    createRequire(api.api).resolve(nativePackage.name) !== nativePath
  )
    throw new Error('Rolldown API and selected native package/version disagree');
  const bind = (path: string) => bindReactFile(copyRoot, relative(copyRoot, path));
  return {
    api: bind(api.api),
    manifest: bind(api.manifest),
    runtimeApi: bind(api.runtimeApi),
    base: bind(api.base),
    native: bind(nativePath),
    nativeManifest: bind(nativeManifest),
  };
}

export function isRolldownRuntimeId(copyRoot: string, moduleId: string): boolean {
  return moduleId === runtimeId(readFileSync(packageApi(copyRoot).api, 'utf8'));
}

function assertRawSource(
  copyRoot: string,
  binding: RuntimeProducer,
  code: string,
  platform: 'browser' | 'node' | null
): void {
  const base = readFileSync(join(copyRoot, binding.base.path), 'utf8');
  const index = code.indexOf(base);
  if (index < 0 || code.indexOf(base, index + base.length) !== -1)
    throw new Error('Generated Rolldown runtime omitted its exact base source');
  const pieces = [code.slice(0, index), base, code.slice(index + base.length)];
  const expected = pieces[0]
    ? [
        ROLLDOWN_RUNTIME_SOURCE.nodeHead,
        ROLLDOWN_RUNTIME_SOURCE.base,
        ROLLDOWN_RUNTIME_SOURCE.nodeTail,
      ]
    : [null, ROLLDOWN_RUNTIME_SOURCE.base, ROLLDOWN_RUNTIME_SOURCE.browserTail];
  if (
    pieces.some((piece, part) =>
      expected[part]
        ? Buffer.byteLength(piece) !== expected[part].bytes ||
          chromeDigest(piece) !== expected[part].sha256
        : piece !== ''
    )
  )
    throw new Error(
      'Generated Rolldown runtime must retain its complete canonical browser or Node source'
    );
  if (platform !== null && Boolean(pieces[0]) !== (platform === 'node'))
    throw new Error('Generated runtime variant disagrees with its actual build target/stage');
  const binary = readFileSync(join(copyRoot, binding.native.path));
  if (!pieces[2] || pieces.some((piece) => piece && !binary.includes(Buffer.from(piece))))
    throw new Error('Generated Rolldown runtime bytes disagree with its selected native producer');
}

export function createRolldownRuntimeCapture(copyRoot: string, apiVersion: string) {
  const api = packageApi(copyRoot);
  const id = runtimeId(readFileSync(api.api, 'utf8'));
  let rawCode: string | undefined;
  let binding: RuntimeProducer | undefined;
  let target: RolldownRuntimeSource['target'] | undefined;
  const plugin: Plugin = {
    name: 'splotch-rolldown-runtime-source',
    apply: 'build',
    enforce: 'pre',
    renderStart(output, input) {
      if (output.format !== 'es' || (input.platform !== 'browser' && input.platform !== 'node'))
        throw new Error('Runtime receipt requires its actual ESM browser or Node output target');
      target = { platform: input.platform, format: output.format };
    },
    transform(code, moduleId) {
      if (moduleId !== id) return null;
      const nativePaths = Object.entries(createRequire(api.api).cache)
        .filter(
          ([path, module]) =>
            module?.loaded === true &&
            path.endsWith('.node') &&
            path.startsWith(join(copyRoot, 'node_modules/@rolldown/binding-'))
        )
        .map(([path]) => path);
      if (nativePaths.length !== 1)
        throw new Error('Runtime source requires its one actually loaded copied native producer');
      binding = producer(copyRoot, nativePaths[0]);
      const manifest = record(
        JSON.parse(readFileSync(join(copyRoot, binding.manifest.path), 'utf8'))
      );
      if (manifest.version !== apiVersion)
        throw new Error('Loaded Rolldown API version disagrees with its copied package');
      assertRawSource(copyRoot, binding, code, null);
      if (rawCode !== undefined && rawCode !== code)
        throw new Error('One build pass changed its generated Rolldown runtime source');
      rawCode = code;
      return null;
    },
  };
  return {
    plugin,
    source(
      moduleId: string,
      renderedCode: string | null,
      stage: ReactGraphStage
    ): RolldownRuntimeSource | null {
      if (moduleId !== id) return null;
      if (!binding || rawCode === undefined || !target)
        throw new Error('Runtime contributor omitted its observed generating transform source');
      if (target.platform !== (stage === 'kit-client' ? 'browser' : 'node'))
        throw new Error('Runtime output target disagrees with the fixed graph stage');
      assertRawSource(copyRoot, binding, rawCode, target.platform);
      return {
        kind: 'rolldown-runtime',
        apiVersion,
        target,
        producer: binding,
        rawCode,
        rawSha256: chromeDigest(rawCode),
        renderedCode,
        renderedSha256: renderedCode === null ? null : chromeDigest(renderedCode),
      };
    },
  };
}

export function assertRolldownRuntimeSource(
  copyRoot: string,
  moduleId: string,
  input: unknown,
  renderedLength: number,
  stage: ReactGraphStage
): RolldownRuntimeSource {
  const value = record(input, [
    'kind',
    'apiVersion',
    'target',
    'producer',
    'rawCode',
    'rawSha256',
    'renderedCode',
    'renderedSha256',
  ]);
  const target = record(value.target, ['platform', 'format']);
  const platform = stage === 'kit-client' ? 'browser' : 'node';
  if (target.platform !== platform || target.format !== 'es')
    throw new Error('Runtime producer target disagrees with its fixed graph stage');
  const files = record(value.producer, [
    'api',
    'manifest',
    'runtimeApi',
    'base',
    'native',
    'nativeManifest',
  ]);
  const native = record(files.native, ['path', 'bytes', 'sha256']);
  if (typeof native.path !== 'string') throw new Error('Missing selected runtime native producer');
  assertReactFileBindings(copyRoot, Object.values(files));
  const expected = producer(copyRoot, join(copyRoot, native.path));
  const names: (keyof RuntimeProducer)[] = [
    'api',
    'manifest',
    'runtimeApi',
    'base',
    'native',
    'nativeManifest',
  ];
  if (
    names.some((name) => JSON.stringify(files[name]) !== JSON.stringify(expected[name])) ||
    moduleId !== runtimeId(readFileSync(join(copyRoot, expected.api.path), 'utf8')) ||
    value.kind !== 'rolldown-runtime' ||
    typeof value.apiVersion !== 'string' ||
    value.apiVersion !==
      record(JSON.parse(readFileSync(join(copyRoot, expected.manifest.path), 'utf8'))).version ||
    typeof value.rawCode !== 'string' ||
    value.rawSha256 !== chromeDigest(value.rawCode) ||
    !(value.renderedCode === null || typeof value.renderedCode === 'string') ||
    renderedLength !== (value.renderedCode?.length ?? 0) ||
    value.renderedSha256 !== (value.renderedCode === null ? null : chromeDigest(value.renderedCode))
  )
    throw new Error(
      'Runtime contributor disagrees with its actual producer/generated/rendered binding'
    );
  assertRawSource(copyRoot, expected, value.rawCode, platform);
  return {
    kind: 'rolldown-runtime',
    apiVersion: value.apiVersion,
    target: { platform, format: 'es' },
    producer: expected,
    rawCode: value.rawCode,
    rawSha256: chromeDigest(value.rawCode),
    renderedCode: value.renderedCode,
    renderedSha256: value.renderedCode === null ? null : chromeDigest(value.renderedCode),
  };
}
