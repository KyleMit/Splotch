import { createHash } from 'node:crypto';
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { ResolvedConfig } from 'vite';
import { WEB_HOST_JSX, WEB_HOST_REACT_RENDERER_DIRECTORY } from './contract.ts';

const ASCII_CONTROL_LAST_CODE = 31;
const ASCII_DELETE_CODE = 127;

export const REACT_VERSION = '19.2.3';
export const REACT_SSR_SOURCE_PATH = 'migration/probes/web-host/host/renderChrome.ts';
export const REACT_JSX_DEV_RUNTIME_FRAGMENT = 'jsx-dev-runtime';
export const REACT_DEVELOPMENT_FILES = Object.freeze([
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
] as const);

const REQUIRED_LOADED_FILES = [
  'react/cjs/react.production.js',
  'react-dom/cjs/react-dom-server-legacy.node.production.js',
] as const;

export type ReactFileBinding = { path: string; bytes: number; sha256: string };
export type ReactBuildContext = {
  mode: 'production';
  nodeEnv: 'production';
  isProduction: true;
  perfMarks: 'false';
  jsx: typeof WEB_HOST_JSX;
};
type ReactPackageName = 'react' | 'react-dom';
type ReactFileContext = { name: ReactPackageName; root: string; member: string };

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid ${label} record`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error(`Invalid ${label} prototype`);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    throw new Error(`Invalid ${label} fields`);
  return value as Record<string, unknown>;
}

function canonicalCopyRoot(copyRoot: string): string {
  if (
    typeof copyRoot !== 'string' ||
    !isAbsolute(copyRoot) ||
    realpathSync(copyRoot) !== copyRoot ||
    !lstatSync(copyRoot).isDirectory()
  )
    throw new Error('React input copy root must be a canonical directory');
  return copyRoot;
}

export function assertStandaloneReactCompilerConfig(
  resolved: ResolvedConfig,
  copyRoot: string
): void {
  const root = canonicalCopyRoot(copyRoot);
  if (realpathSync(resolved.root) !== root)
    throw new Error('Standalone React compiler changed its owned root');
  if (resolved.configFile !== undefined || resolved.inlineConfig.configFile !== false)
    throw new Error('Standalone React compiler requires explicit disabled config-file loading');
  if (resolved.build.ssr !== resolve(root, REACT_SSR_SOURCE_PATH))
    throw new Error('Standalone React compiler changed its fixed SSR entry');
  if (resolved.build.outDir !== resolve(root, WEB_HOST_REACT_RENDERER_DIRECTORY))
    throw new Error('Standalone React compiler changed its fixed output directory');
}

function relativeInputPath(path: string): string {
  if (
    typeof path !== 'string' ||
    !path ||
    isAbsolute(path) ||
    path.includes('\\') ||
    [...path].some((character) => {
      const code = character.charCodeAt(0);
      return code <= ASCII_CONTROL_LAST_CODE || code === ASCII_DELETE_CODE;
    }) ||
    path.split('/').some((part) => part === '' || part === '.' || part === '..')
  )
    throw new Error('React input path must be canonical copy-relative POSIX');
  return path;
}

function containedInputPath(root: string, path: string): string {
  const file = resolve(root, relativeInputPath(path));
  const relation = relative(root, file);
  if (!relation || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation))
    throw new Error(`React input escapes its copy: ${path}`);
  if (realpathSync(file) !== file)
    throw new Error(`React input has a symlink or canonical alias: ${path}`);
  return file;
}

export function bindReactFile(copyRoot: string, path: string): ReactFileBinding {
  const root = canonicalCopyRoot(copyRoot);
  const file = containedInputPath(root, path);
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n)
      throw new Error(`React input must be one owned regular file: ${path}`);
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const current = lstatSync(containedInputPath(root, path), { bigint: true });
    if (
      before.dev !== current.dev ||
      before.ino !== current.ino ||
      current.nlink !== 1n ||
      before.size !== after.size ||
      before.size !== current.size ||
      before.size !== BigInt(bytes.length) ||
      before.mode !== after.mode ||
      before.mode !== current.mode ||
      before.mtimeNs !== after.mtimeNs ||
      before.mtimeNs !== current.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      before.ctimeNs !== current.ctimeNs
    )
      throw new Error(`React input changed during byte binding: ${path}`);
    return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  } finally {
    closeSync(fd);
  }
}

export function assertReactFileBindings(copyRoot: string, value: unknown): ReactFileBinding[] {
  canonicalCopyRoot(copyRoot);
  if (!Array.isArray(value) || value.length === 0)
    throw new Error('React input bindings must be a nonempty array');
  const seen = new Set<string>();
  return value
    .map((item) => {
      const row = exactRecord(item, ['path', 'bytes', 'sha256'], 'React input binding');
      if (
        typeof row.path !== 'string' ||
        typeof row.bytes !== 'number' ||
        !Number.isSafeInteger(row.bytes) ||
        row.bytes < 0 ||
        typeof row.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(row.sha256)
      )
        throw new Error('Invalid React input binding values');
      if (seen.has(row.path)) throw new Error(`Duplicate React input binding: ${row.path}`);
      seen.add(row.path);
      const actual = bindReactFile(copyRoot, row.path);
      if (actual.bytes !== row.bytes || actual.sha256 !== row.sha256)
        throw new Error(`React input bytes differ from receipt: ${row.path}`);
      return actual;
    })
    .sort(compareReactBindings);
}

function compareReactBindings(left: ReactFileBinding, right: ReactFileBinding): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function reactFileContext(path: string): ReactFileContext | null {
  const components = path.split('/');
  const index = components.lastIndexOf('node_modules');
  const name = components[index + 1];
  if (index === -1 || (name !== 'react' && name !== 'react-dom')) return null;
  const root = components.slice(0, index + 2).join('/');
  return { name, root, member: components.slice(index + 2).join('/') };
}

function copiedRelativePath(copyRoot: string, path: string): string {
  if (!isAbsolute(path)) throw new Error('Loaded React file must have an absolute cache path');
  const relation = relative(copyRoot, path);
  return relativeInputPath(relation.split(sep).join('/'));
}

function bindReactPackage(copyRoot: string, context: ReactFileContext): ReactFileBinding {
  const path = copiedRelativePath(copyRoot, resolve(context.root, 'package.json'));
  const binding = bindReactFile(copyRoot, path);
  const manifest: unknown = JSON.parse(readFileSync(resolve(copyRoot, path), 'utf8'));
  if (
    manifest === null ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    !('name' in manifest) ||
    manifest.name !== context.name ||
    !('version' in manifest) ||
    manifest.version !== REACT_VERSION
  )
    throw new Error(`Loaded React package must be ${context.name}@${REACT_VERSION}`);
  assertReactFileBindings(copyRoot, [binding]);
  return binding;
}

export function bindReactPackageForFile(copyRoot: string, path: string): ReactFileBinding | null {
  const root = canonicalCopyRoot(copyRoot);
  const file = bindReactFile(root, path);
  const context = reactFileContext(resolve(root, file.path));
  return context ? bindReactPackage(root, context) : null;
}

export function collectLoadedReactFiles(
  copyRoot: string,
  requireCachePaths: string[]
): ReactFileBinding[] {
  const root = canonicalCopyRoot(copyRoot);
  if (
    !Array.isArray(requireCachePaths) ||
    requireCachePaths.some((path) => typeof path !== 'string')
  )
    throw new Error('Loaded React cache paths must be strings');
  const bindings = new Map<string, ReactFileBinding>();
  const identities = new Set<string>();
  for (const path of requireCachePaths) {
    const context = reactFileContext(path);
    if (!context) continue;
    const identity = `${context.name}/${context.member}`;
    if (
      REACT_DEVELOPMENT_FILES.some((denied) => denied === identity) ||
      identity.includes(REACT_JSX_DEV_RUNTIME_FRAGMENT)
    )
      throw new Error(`Development React module participated: ${identity}`);
    const binding = bindReactFile(root, copiedRelativePath(root, path));
    const manifest = bindReactPackage(root, context);
    bindings.set(binding.path, binding);
    bindings.set(manifest.path, manifest);
    identities.add(identity);
  }
  for (const identity of REQUIRED_LOADED_FILES) {
    if (!identities.has(identity))
      throw new Error(`Required production React module did not load: ${identity}`);
  }
  return [...bindings.values()].sort(compareReactBindings);
}

export function assertReactBuildContext(value: unknown): ReactBuildContext {
  const context = exactRecord(
    value,
    ['mode', 'nodeEnv', 'isProduction', 'perfMarks', 'jsx'],
    'React build context'
  );
  const jsx = exactRecord(context.jsx, Object.keys(WEB_HOST_JSX), 'React JSX context');
  if (
    context.mode !== 'production' ||
    context.nodeEnv !== 'production' ||
    context.isProduction !== true ||
    context.perfMarks !== 'false' ||
    jsx.runtime !== WEB_HOST_JSX.runtime ||
    jsx.development !== WEB_HOST_JSX.development ||
    jsx.importSource !== WEB_HOST_JSX.importSource
  )
    throw new Error('React build requires the exact production context');
  return {
    mode: 'production',
    nodeEnv: 'production',
    isProduction: true,
    perfMarks: 'false',
    jsx: WEB_HOST_JSX,
  };
}
