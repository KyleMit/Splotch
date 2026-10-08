import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createRequire, isBuiltin } from 'node:module';
import { emittedModuleReferences, assertGraphChunkEdges } from './reactGraphReferences.ts';
import { assertChunkFacades } from './reactGraphFacade.ts';
import {
  bindKitEnvSource,
  assertKitEnvSource,
  assertActualKitEnvGenerator,
  type KitEnvSource,
  type KitEnvConfig,
} from './kitEnvSource.ts';
import type { Rolldown } from 'vite';
import { chromeDigest } from './chromeHtml.ts';
import {
  assertReactBuildContext,
  assertReactFileBindings,
  bindReactFile,
  bindReactPackageForFile,
  REACT_DEVELOPMENT_FILES,
  REACT_JSX_DEV_RUNTIME_FRAGMENT,
  type ReactBuildContext,
  type ReactFileBinding,
} from './reactProduction.ts';
import { overlayPageSource, type PageOverlayBinding } from './pageOverlay.ts';
import {
  assertRolldownRuntimeSource,
  isRolldownRuntimeId,
  type RolldownRuntimeSource,
  type createRolldownRuntimeCapture,
} from './rolldownRuntime.ts';
import { WEB_HOST_UI_PACKAGES, WEB_HOST_UI_SCOPES, WEB_HOST_REACT_EXTERNALS } from './contract.ts';

export type ReactGraphStage = 'ssr-renderer' | 'kit-client' | 'kit-server';
type ModuleSource =
  | { kind: 'file'; file: ReactFileBinding }
  | { kind: 'virtual'; code: string; sha256: string }
  | RolldownRuntimeSource
  | KitEnvSource;
interface GraphModule {
  id: string;
  renderedLength: number;
  source: ModuleSource;
}
type GraphExternal =
  | { qualification: 'builtin' | 'recorded-only'; specifier: string; resolved: null }
  | {
      qualification: 'bundler-file' | 'react-node-cjs';
      specifier: string;
      resolved: ReactFileBinding;
    };
interface GraphChunk {
  fileName: string;
  file: ReactFileBinding;
  facade: string | null;
  modules: GraphModule[];
  imports: string[];
  dynamicImports: string[];
  externals: GraphExternal[];
}
export interface ReactGraph {
  schemaVersion: 1;
  stage: ReactGraphStage;
  outputDirectory: string;
  context: ReactBuildContext;
  overlay: PageOverlayBinding | null;
  packages: ReactFileBinding[];
  chunks: GraphChunk[];
}

function packagePath(id: string): string {
  const path = id.replace(/^\0/, '').split('?')[0].replaceAll('\\', '/');
  const index = path.lastIndexOf('node_modules/');
  return index === -1 ? path : path.slice(index + 'node_modules/'.length);
}

function isReactPackagePath(id: string): boolean {
  const path = packagePath(id);
  return ['react', 'react-dom'].some((name) => path === name || path.startsWith(`${name}/`));
}

export function assertReactContribution(id: string): void {
  const path = packagePath(id);
  if (
    REACT_DEVELOPMENT_FILES.some((file) => path === file) ||
    (path.startsWith('react/') && path.includes(REACT_JSX_DEV_RUNTIME_FRAGMENT))
  )
    throw new Error(`Development React contribution: ${id}`);
  if (
    WEB_HOST_UI_PACKAGES.filter((name) => name !== 'react' && name !== 'react-dom').some(
      (name) => path === name || path.startsWith(`${name}/`)
    ) ||
    WEB_HOST_UI_SCOPES.some((scope) => path.startsWith(`${scope}/`))
  )
    throw new Error(`Native UI contribution is outside the neutral React slice: ${id}`);
}

function moduleSource(
  id: string,
  copyRoot: string,
  code: string | null,
  runtime: ReturnType<typeof createRolldownRuntimeCapture>,
  renderedCode: string | null,
  stage: ReactGraphStage,
  kitConfig: KitEnvConfig | null
): { id: string; source: ModuleSource } {
  const unwrapped = id.replace(/^\0/, '');
  const raw = unwrapped.split('?')[0];
  if (isAbsolute(raw)) {
    const file = bindReactFile(copyRoot, relative(copyRoot, raw));
    return {
      id: `${id.startsWith('\0') ? '\0' : ''}${file.path}${unwrapped.slice(raw.length)}`,
      source: { kind: 'file', file },
    };
  }
  const kitEnv = bindKitEnvSource(copyRoot, id, code, kitConfig);
  if (kitEnv) return { id, source: kitEnv };
  const generated = runtime.source(id, renderedCode, stage);
  if (generated) return { id, source: generated };
  if (!id.startsWith('\0') || typeof code !== 'string')
    throw new Error(`Contributing module has no canonical source binding: ${id}`);
  assertReactContribution(id);
  return { id, source: { kind: 'virtual', code, sha256: chromeDigest(code) } };
}

function graphPackages(copyRoot: string, chunks: GraphChunk[]): ReactFileBinding[] {
  const files = chunks.flatMap((chunk) => [
    ...chunk.modules.flatMap((module) =>
      module.source.kind === 'file' ? [module.source.file] : []
    ),
    ...chunk.externals.flatMap((edge) => (edge.resolved ? [edge.resolved] : [])),
  ]);
  const packages = new Map<string, ReactFileBinding>();
  for (const file of files) {
    const identity = bindReactPackageForFile(copyRoot, file.path);
    if (identity) packages.set(identity.path, identity);
  }
  return [...packages.values()].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
}

export async function captureReactGraph(value: {
  copyRoot: string;
  outputDirectory: string;
  stage: ReactGraphStage;
  context: unknown;
  kitConfig: KitEnvConfig | null;
  overlay: PageOverlayBinding | null;
  bundle: Rolldown.OutputBundle;
  plugin: Rolldown.PluginContext;
  runtime: ReturnType<typeof createRolldownRuntimeCapture>;
}): Promise<ReactGraph> {
  const context = assertReactBuildContext(value.context);
  const outputNames = new Set(Object.keys(value.bundle));
  const chunks: GraphChunk[] = [];
  for (const chunk of Object.values(value.bundle)) {
    if (chunk.type !== 'chunk') continue;
    const modules = Object.entries(chunk.modules)
      .map(([id, rendered]) => {
        const source = moduleSource(
          id,
          value.copyRoot,
          value.plugin.getModuleInfo(id)?.code ?? null,
          value.runtime,
          rendered.code,
          value.stage,
          value.kitConfig
        );
        if (rendered.renderedLength > 0) assertReactContribution(source.id);
        return { ...source, renderedLength: rendered.renderedLength };
      })
      .sort((left, right) => left.id.localeCompare(right.id));
    if (!modules.length) {
      const facade = chunk.facadeModuleId && value.plugin.getModuleInfo(chunk.facadeModuleId);
      if (
        !facade ||
        facade.id !== chunk.facadeModuleId ||
        !chunk.exports.length ||
        new Set(chunk.exports).size !== chunk.exports.length ||
        chunk.exports.some((name) => !facade.exports.includes(name))
      )
        throw new Error('Facade bridge disagrees with its actual compiler source exports');
    }
    const externals: GraphExternal[] = [];
    for (const specifier of [...new Set([...chunk.imports, ...chunk.dynamicImports])].sort()) {
      if (outputNames.has(specifier)) continue;
      assertReactContribution(specifier);
      if (isBuiltin(specifier)) {
        externals.push({ qualification: 'builtin', specifier, resolved: null });
        continue;
      }
      const resolved = await value.plugin.resolve(specifier, chunk.facadeModuleId ?? undefined, {
        skipSelf: true,
      });
      if (resolved && isAbsolute(resolved.id)) {
        const file = bindReactFile(value.copyRoot, relative(value.copyRoot, resolved.id));
        assertReactContribution(file.path);
        if (value.stage === 'kit-client' && isReactPackagePath(file.path))
          throw new Error(
            'Client React must contribute through the bundled graph, not a bare external'
          );
        externals.push({ qualification: 'bundler-file', specifier, resolved: file });
      } else if (isReactPackagePath(specifier)) {
        if (
          !WEB_HOST_REACT_EXTERNALS.some((allowed) => allowed === specifier) ||
          value.stage === 'kit-client'
        )
          throw new Error('Unsupported or client React external needs its actual bundled caller');
        const actual = createRequire(resolve(value.outputDirectory, chunk.fileName)).resolve(
          specifier
        );
        const file = bindReactFile(value.copyRoot, relative(value.copyRoot, actual));
        assertReactContribution(file.path);
        externals.push({ qualification: 'react-node-cjs', specifier, resolved: file });
      } else externals.push({ qualification: 'recorded-only', specifier, resolved: null });
    }
    for (const reference of emittedModuleReferences(chunk.code)) assertReactContribution(reference);
    const output = relative(value.copyRoot, resolve(value.outputDirectory, chunk.fileName));
    if (!output || output.startsWith('../') || isAbsolute(output))
      throw new Error('Chunk output escapes its owned copy');
    chunks.push({
      fileName: chunk.fileName,
      file: {
        path: output,
        bytes: Buffer.byteLength(chunk.code),
        sha256: chromeDigest(chunk.code),
      },
      facade: chunk.facadeModuleId
        ? moduleSource(
            chunk.facadeModuleId,
            value.copyRoot,
            value.plugin.getModuleInfo(chunk.facadeModuleId)?.code ?? null,
            value.runtime,
            null,
            value.stage,
            value.kitConfig
          ).id
        : null,
      modules,
      imports: chunk.imports,
      dynamicImports: chunk.dynamicImports,
      externals,
    });
  }
  if (!chunks.length) throw new Error('Missing contributing React graph chunks');
  for (const module of chunks.flatMap((chunk) => chunk.modules))
    if (module.source.kind === 'kit-env')
      await assertActualKitEnvGenerator(value.copyRoot, module.source.code);
  return assertReactGraph(
    value.copyRoot,
    {
      schemaVersion: 1,
      stage: value.stage,
      outputDirectory: relative(value.copyRoot, value.outputDirectory),
      context,
      overlay: value.overlay,
      packages: graphPackages(value.copyRoot, chunks),
      chunks: chunks.sort((left, right) => left.file.path.localeCompare(right.file.path)),
    },
    value.stage
  );
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== [...keys].sort().join()
  )
    throw new Error('Malformed React graph record');
  return value as Record<string, unknown>;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item))
    throw new Error('Malformed React graph edge array');
  return value;
}

function graphOverlay(
  copyRoot: string,
  value: unknown,
  stage: ReactGraphStage
): PageOverlayBinding | null {
  if (stage === 'ssr-renderer') {
    if (value !== null) throw new Error('Standalone SSR cannot claim a Kit overlay');
    return null;
  }
  const row = object(value, ['path', 'sourceSha256', 'transformedSha256']);
  if (
    row.path !== 'web/src/routes/+page.svelte' ||
    ![row.sourceSha256, row.transformedSha256].every(
      (hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)
    )
  )
    throw new Error('Kit graph omitted its overlay source binding');
  const expected = overlayPageSource(readFileSync(join(copyRoot, row.path), 'utf8')).binding;
  if (JSON.stringify(row) !== JSON.stringify(expected))
    throw new Error('Kit overlay disagrees with actual source/transform owners');
  return expected;
}

function graphModule(copyRoot: string, input: unknown, stage: ReactGraphStage): GraphModule {
  const module = object(input, ['id', 'renderedLength', 'source']);
  if (
    typeof module.id !== 'string' ||
    !module.id ||
    !Number.isSafeInteger(module.renderedLength) ||
    Number(module.renderedLength) < 0
  )
    throw new Error('Malformed React contributor identity');
  let source: ModuleSource;
  const sourceValue = module.source;
  if (!sourceValue || typeof sourceValue !== 'object' || !('kind' in sourceValue))
    throw new Error('Missing React contributor source');
  const kind = object(
    sourceValue,
    sourceValue.kind === 'file'
      ? ['kind', 'file']
      : sourceValue.kind === 'kit-env'
        ? ['kind', 'config', 'producer', 'code', 'sha256']
        : sourceValue.kind === 'rolldown-runtime'
          ? [
              'kind',
              'apiVersion',
              'target',
              'producer',
              'rawCode',
              'rawSha256',
              'renderedCode',
              'renderedSha256',
            ]
          : ['kind', 'code', 'sha256']
  );
  if (kind.kind === 'file') {
    const [binding] = assertReactFileBindings(copyRoot, [kind.file]);
    if (module.id.replace(/^\0/, '').split('?')[0] !== binding.path)
      throw new Error('Contributor ID disagrees with its bound source');
    source = { kind: 'file', file: binding };
  } else if (kind.kind === 'kit-env') {
    source = assertKitEnvSource(copyRoot, module.id, sourceValue);
  } else if (kind.kind === 'rolldown-runtime') {
    source = assertRolldownRuntimeSource(
      copyRoot,
      module.id,
      sourceValue,
      Number(module.renderedLength),
      stage
    );
  } else {
    if (
      kind.kind !== 'virtual' ||
      !module.id.startsWith('\0') ||
      typeof kind.code !== 'string' ||
      kind.sha256 !== chromeDigest(kind.code) ||
      isRolldownRuntimeId(copyRoot, module.id)
    )
      throw new Error('Malformed virtual contributor');
    source = { kind: 'virtual', code: kind.code, sha256: chromeDigest(kind.code) };
  }
  if (Number(module.renderedLength) > 0) assertReactContribution(module.id);
  return { id: module.id, renderedLength: Number(module.renderedLength), source };
}

function graphExternal(
  copyRoot: string,
  input: unknown,
  references: string[],
  file: ReactFileBinding,
  stage: ReactGraphStage
): GraphExternal {
  const edge = object(input, ['qualification', 'specifier', 'resolved']);
  if (typeof edge.specifier !== 'string' || !edge.specifier || !references.includes(edge.specifier))
    throw new Error('Unbound resolved external edge');
  assertReactContribution(edge.specifier);
  if (edge.qualification === 'builtin') {
    if (!isBuiltin(edge.specifier) || edge.resolved !== null)
      throw new Error('Invalid builtin external qualification');
    return { qualification: 'builtin', specifier: edge.specifier, resolved: null };
  }
  if (edge.qualification === 'recorded-only') {
    if (isBuiltin(edge.specifier) || isReactPackagePath(edge.specifier) || edge.resolved !== null)
      throw new Error('React/builtin external cannot hide behind an unqualified record');
    return { qualification: 'recorded-only', specifier: edge.specifier, resolved: null };
  }
  if (edge.qualification !== 'bundler-file' && edge.qualification !== 'react-node-cjs')
    throw new Error('Unsupported external qualification');
  const [resolved] = assertReactFileBindings(copyRoot, [edge.resolved]);
  assertReactContribution(resolved.path);
  if (
    stage === 'kit-client' &&
    (isReactPackagePath(edge.specifier) || isReactPackagePath(resolved.path))
  )
    throw new Error('Client React external is outside its bundled contributor graph');
  if (edge.qualification === 'react-node-cjs') {
    if (!WEB_HOST_REACT_EXTERNALS.some((allowed) => allowed === edge.specifier))
      throw new Error('React Node fallback has no reviewed compiler external caller');
    const actual = createRequire(join(copyRoot, file.path)).resolve(edge.specifier);
    if (bindReactFile(copyRoot, relative(copyRoot, actual)).path !== resolved.path)
      throw new Error('React external disagrees with its actual emitted Node resolution');
  }
  return { qualification: edge.qualification, specifier: edge.specifier, resolved };
}

function graphChunk(
  copyRoot: string,
  input: unknown,
  outputDirectory: string,
  stage: ReactGraphStage
): GraphChunk {
  const row = object(input, [
    'fileName',
    'file',
    'facade',
    'modules',
    'imports',
    'dynamicImports',
    'externals',
  ]);
  const [file] = assertReactFileBindings(copyRoot, [row.file]);
  if (
    typeof row.fileName !== 'string' ||
    !row.fileName ||
    isAbsolute(row.fileName) ||
    row.fileName.includes('\\') ||
    row.fileName.split('/').some((part) => !part || part === '.' || part === '..') ||
    file.path !== `${outputDirectory}/${row.fileName}`
  )
    throw new Error('Chunk identity disagrees with its actual output owner');
  if (
    !(row.facade === null || typeof row.facade === 'string') ||
    !Array.isArray(row.modules) ||
    !Array.isArray(row.externals)
  )
    throw new Error('Malformed React chunk contributors');
  const modules = row.modules.map((value) => graphModule(copyRoot, value, stage));
  if (new Set(modules.map((module) => module.id)).size !== modules.length)
    throw new Error('Duplicate React contributor');
  const imports = strings(row.imports);
  const dynamicImports = strings(row.dynamicImports);
  for (const reference of [
    ...imports,
    ...dynamicImports,
    ...emittedModuleReferences(readFileSync(join(copyRoot, file.path), 'utf8')),
  ])
    assertReactContribution(reference);
  const externals = row.externals.map((edge) =>
    graphExternal(copyRoot, edge, [...imports, ...dynamicImports], file, stage)
  );
  if (typeof row.facade === 'string') assertReactContribution(row.facade);
  return {
    fileName: row.fileName,
    file,
    facade: row.facade,
    modules,
    imports,
    dynamicImports,
    externals,
  };
}

export function assertReactGraph(
  copyRoot: string,
  input: unknown,
  stage: ReactGraphStage
): ReactGraph {
  const value = object(input, [
    'schemaVersion',
    'stage',
    'outputDirectory',
    'context',
    'overlay',
    'packages',
    'chunks',
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.stage !== stage ||
    !Array.isArray(value.chunks) ||
    !value.chunks.length
  )
    throw new Error('React graph omitted its actual stage/chunks');
  if (
    typeof value.outputDirectory !== 'string' ||
    !value.outputDirectory ||
    isAbsolute(value.outputDirectory) ||
    value.outputDirectory.includes('\\') ||
    value.outputDirectory.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Malformed React graph output directory');
  const outputDirectory = value.outputDirectory;
  const context = assertReactBuildContext(value.context);
  const overlay = graphOverlay(copyRoot, value.overlay, stage);
  const chunks = value.chunks.map((chunk) => graphChunk(copyRoot, chunk, outputDirectory, stage));
  if (new Set(chunks.map((chunk) => chunk.file.path)).size !== chunks.length)
    throw new Error('Duplicate React graph output');
  assertGraphChunkEdges(copyRoot, chunks);
  assertChunkFacades(copyRoot, chunks);
  if (!Array.isArray(value.packages))
    throw new Error('React graph omitted its participating package identities');
  const packages = value.packages.length ? assertReactFileBindings(copyRoot, value.packages) : [];
  if (JSON.stringify(packages) !== JSON.stringify(graphPackages(copyRoot, chunks)))
    throw new Error('React graph package identities disagree with actual contributing sources');
  return { schemaVersion: 1, stage, outputDirectory, context, overlay, packages, chunks };
}
