import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { qualifyAmbientPnpmConfig, verifyAmbientPnpmConfig } from './lib/netlify-cache-config.mjs';
import { CANDIDATE_DIRECTORY } from './lib/native-candidate.mjs';
import { verifyNetlifyRuntime } from './lib/netlify-runtime.mjs';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

const SUPPORTED_PNPM_VERSION = '11.22.0';
const CONFIG_TIMEOUT_MS = 30_000;
const INSTALL_TIMEOUT_MS = 15 * 60_000;
const MAX_CONFIG_OUTPUT_BYTES = 16_384;
const OWNER_PATHS = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  `${CANDIDATE_DIRECTORY}/package.json`,
  'netlify.toml',
];
const ABSENT_CONFIG_KEYS = [
  'modules-dir',
  'virtual-store-dir',
  'enable-global-virtual-store',
  'force',
  'lockfile',
  'package-lock',
  'ignore-scripts',
  'production',
  'dev',
  'optional',
  'only',
  'omit',
  'shamefully-hoist',
  'recursive-install',
  'shared-workspace-lockfile',
  'global',
  'ignore-workspace',
  'dir',
  'lockfile-dir',
  'workspace-root',
  'workspace-packages',
  'filter',
  'filter-prod',
  'enable-modules-dir',
  'virtual-store-only',
  'lockfile-only',
  'dry-run',
  'resolution-only',
  'git-branch-lockfile',
  'merge-git-branch-lockfiles',
  'merge-git-branch-lockfiles-branch-pattern',
  'pnpr-server',
  'strict-dep-builds',
  'dangerously-allow-all-builds',
  'pnpmfile',
  'global-pnpmfile',
  'configDependencies',
  'ignore-pnpmfile',
];
const PRELOAD_ENV_SUFFIXES = ['pnpmfile', 'global_pnpmfile', 'lockfile_dir', 'dir'];
const EXISTING_BUILD_VERDICTS = ['@google/genai', 'esbuild', 'dprint', 'protobufjs'];
const LIFECYCLE_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'preprepare',
  'prepare',
  'postprepare',
];
const MODULES_LAYOUT_VERSION = 5;
const RESIDUE_PATH = 'node_modules/filelist/node_modules/brace-expansion/package.json';
const ABSENT = Symbol('absent pnpm setting');

function optionalLstat(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function within(root, path) {
  const remainder = relative(root, path);
  return remainder === '' || (!remainder.startsWith('..') && !isAbsolute(remainder));
}

function requireKind(root, path, kind, absentAllowed = false) {
  const entry = optionalLstat(path);
  if (entry === null && absentAllowed) return;
  assert.ok(
    entry && !entry.isSymbolicLink() && entry[kind](),
    'Unsafe installer root or source kind'
  );
  assert.ok(within(root, realpathSync(path)), 'Installer path escapes the checkout');
}

function qualifyRoots(root) {
  requireKind(root, root, 'isDirectory');
  assert.equal(realpathSync(root), root, 'Checkout root must be canonical before clean');
  const candidate = join(root, CANDIDATE_DIRECTORY);
  requireKind(root, join(root, 'experiments'), 'isDirectory');
  requireKind(root, candidate, 'isDirectory');
  for (const path of OWNER_PATHS) requireKind(root, join(root, path), 'isFile');
  for (const project of [root, candidate]) {
    requireKind(root, join(project, 'node_modules'), 'isDirectory', true);
  }
}

function globalConfigPath(env) {
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, 'pnpm/config.yaml');
  return process.platform === 'darwin'
    ? join(homedir(), 'Library/Preferences/pnpm/config.yaml')
    : join(homedir(), '.config/pnpm/config.yaml');
}

function qualifyNoPreloads(root, env, record) {
  const ambient = qualifyAmbientPnpmConfig(globalConfigPath(env), root, env, record);
  const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  // pnpm expands YAML keys; this closed spelling guard refuses unsupported escapes/interpolation.
  assert.ok(
    !/configDependencies|[pP]npmfile|lockfileDir|\\|\$\{/.test(workspace),
    'Workspace pnpm preload spelling or interpolation is unsupported'
  );
  for (const name of ['.pnpmfile.mjs', '.pnpmfile.cjs']) {
    assert.equal(optionalLstat(join(root, name)), null, 'Default pnpmfile is not approved');
  }
  for (const suffix of PRELOAD_ENV_SUFFIXES) {
    for (const name of [`pnpm_config_${suffix}`, `PNPM_CONFIG_${suffix.toUpperCase()}`]) {
      assert.equal(
        env[name],
        undefined,
        'pnpm preload or prefix environment override is unsupported'
      );
    }
  }
  for (const name of ['NPM_CONFIG_WORKSPACE_DIR', 'npm_config_workspace_dir']) {
    if (env[name])
      assert.equal(env[name], root, 'Workspace discovery override differs from checkout');
  }
  return ambient;
}

function currentOwners(root) {
  return OWNER_PATHS.map((path) => {
    const fullPath = join(root, path);
    return {
      path,
      mode: lstatSync(fullPath).mode & 0o777,
      sha256: createHash('sha256').update(readFileSync(fullPath)).digest('hex'),
    };
  });
}

function readManifest(root, path) {
  const manifest = JSON.parse(readFileSync(join(root, path), 'utf8'));
  assert.ok(
    manifest && typeof manifest === 'object' && !Array.isArray(manifest),
    'Invalid manifest'
  );
  const scripts = manifest.scripts ?? {};
  assert.ok(typeof scripts === 'object' && !Array.isArray(scripts), 'Invalid workspace scripts');
  assert.ok(
    LIFECYCLE_SCRIPTS.every((name) => !(name in scripts)),
    'Workspace lifecycle scripts need a reviewed clean-install route'
  );
  return manifest;
}

function managerLauncher(root, env) {
  for (const directory of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const path = resolve(root, directory, 'pnpm');
    try {
      accessSync(path, constants.X_OK);
    } catch {
      continue;
    }
    const resolved = realpathSync(path);
    assert.ok(lstatSync(resolved).isFile(), 'pnpm launcher is not a regular file');
    for (const project of [root, join(root, CANDIDATE_DIRECTORY)]) {
      assert.ok(
        !within(join(project, 'node_modules'), path) &&
          !within(join(project, 'node_modules'), resolved),
        'pnpm launcher would be cleaned'
      );
    }
    return {
      path,
      resolvedPath: resolved,
      sha256: createHash('sha256').update(readFileSync(resolved)).digest('hex'),
    };
  }
  throw new Error('Qualified pnpm launcher is unavailable');
}

function query(launcher, root, env, args, runChild) {
  const child = runChild(launcher.path, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: CONFIG_TIMEOUT_MS,
    maxBuffer: MAX_CONFIG_OUTPUT_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.ok(
    !child.error && child.status === 0 && child.signal == null,
    'pnpm qualification child failed'
  );
  return child.stdout.trim();
}

function configSetting(key, launcher, root, env, runChild) {
  const output = query(launcher, root, env, ['config', 'get', '--json', key], runChild);
  if (output === '') return ABSENT;
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Invalid JSON for named pnpm setting ${key}`);
  }
}

function qualifyConfig(launcher, root, env, runChild, ambient) {
  const rows = [];
  for (const key of ABSENT_CONFIG_KEYS) {
    assert.ok(
      configSetting(key, launcher, root, env, runChild) === ABSENT,
      `Unsupported explicit pnpm setting ${key}`
    );
    rows.push({ key, disposition: 'pnpm-11.22-source-default' });
  }
  assert.ok(
    configSetting('node-linker', launcher, root, env, runChild) === 'hoisted',
    'Actual linker differs from the shipping owner'
  );
  const packages = configSetting('packages', launcher, root, env, runChild);
  assert.ok(
    Array.isArray(packages) && packages.length === 1 && packages[0] === CANDIDATE_DIRECTORY,
    'Actual workspace packages differ from the fixed roots'
  );
  const builds = configSetting('allowBuilds', launcher, root, env, runChild);
  assert.ok(
    builds &&
      typeof builds === 'object' &&
      !Array.isArray(builds) &&
      EXISTING_BUILD_VERDICTS.every((name) => builds[name] === false) &&
      Object.values(builds).every((verdict) => verdict === false),
    'Clean-install skipped rebuild requires the reviewed all-false build policy'
  );
  const store = configSetting('store-dir', launcher, root, env, runChild);
  assert.ok(
    store === (ambient.storeDir ?? ABSENT),
    'Effective pnpm store differs from the qualified ambient setting'
  );
  return [
    ...rows,
    {
      key: 'store-dir',
      disposition:
        ambient.storeDir === null ? 'pnpm-11.22-source-default' : 'qualified-netlify-cache-literal',
    },
    { key: 'node-linker', value: 'hoisted' },
    { key: 'packages', value: packages },
    { key: 'allowBuilds', value: builds },
  ];
}

function residueProbe(root) {
  const path = join(root, RESIDUE_PATH);
  const entry = optionalLstat(path);
  if (entry === null) return { path: RESIDUE_PATH, present: false };
  requireKind(root, path, 'isFile');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(
    manifest.name === 'brace-expansion' &&
      typeof manifest.version === 'string' &&
      /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version),
    'Named stale-leaf probe has invalid package identity'
  );
  return { path: RESIDUE_PATH, present: true, name: manifest.name, version: manifest.version };
}

function installedMetadata(root) {
  const path = join(root, 'node_modules/.modules.yaml');
  requireKind(root, path, 'isFile');
  const modules = JSON.parse(readFileSync(path, 'utf8'));
  const included = modules.included;
  assert.ok(
    modules.nodeLinker === 'hoisted' &&
      modules.virtualStoreDir === '.pnpm' &&
      modules.layoutVersion === MODULES_LAYOUT_VERSION &&
      modules.packageManager === `pnpm@${SUPPORTED_PNPM_VERSION}` &&
      included &&
      Object.keys(included).length === 3 &&
      included.dependencies === true &&
      included.devDependencies === false &&
      included.optionalDependencies === true,
    'Materialized pnpm production metadata differs'
  );
  return {
    nodeLinker: modules.nodeLinker,
    included,
    layoutVersion: modules.layoutVersion,
    virtualStoreDir: modules.virtualStoreDir,
    packageManager: modules.packageManager,
  };
}

function installStage(launcher, root, env, runChild, record, ambient) {
  const argv = ['ci', '--prod'];
  const startedAt = new Date().toISOString();
  const started = performance.now();
  record({ stage: 'second-production-install-start', cwd: root, argv, startedAt });
  verifyAmbientPnpmConfig(ambient);
  const child = runChild(launcher.path, argv, {
    cwd: root,
    env,
    stdio: 'inherit',
    timeout: INSTALL_TIMEOUT_MS,
  });
  const result = {
    stage: 'second-production-install-exit',
    argv,
    startedAt,
    endedAt: new Date().toISOString(),
    durationMs: performance.now() - started,
    exitCode: child.status,
    signal: child.signal ?? null,
    launchFailed: Boolean(child.error),
  };
  record(result);
  verifyAmbientPnpmConfig(ambient);
  assert.ok(
    !child.error && child.status === 0 && child.signal == null,
    'Second production install failed'
  );
  return result;
}

// Child/record injection lets fixture controls drive this actual caller without installing packages.
export function installNetlifyProductionDependencies(
  root,
  { env, nodeVersion },
  { runChild, record }
) {
  qualifyRoots(root);
  const ambient = qualifyNoPreloads(root, env, record);
  const qualifiedChild = (...args) => {
    verifyAmbientPnpmConfig(ambient);
    const child = runChild(...args);
    verifyAmbientPnpmConfig(ambient);
    return child;
  };
  const before = currentOwners(root);
  const manifest = readManifest(root, 'package.json');
  readManifest(root, `${CANDIDATE_DIRECTORY}/package.json`);
  assert.ok(
    manifest.packageManager === `pnpm@${SUPPORTED_PNPM_VERSION}` &&
      manifest.devEngines?.packageManager === undefined,
    'pnpm configuration version is not qualified'
  );
  verifyNetlifyRuntime(root, manifest, {
    env,
    nodeVersion,
    packageManagerVersion: SUPPORTED_PNPM_VERSION,
  });
  const childEnv = { ...env, COREPACK_ENABLE_NETWORK: '0' };
  const launcher = managerLauncher(root, childEnv);
  const version = query(launcher, root, childEnv, ['--version'], qualifiedChild);
  assert.ok(/^\d+\.\d+\.\d+$/.test(version), 'Invalid pnpm version output');
  verifyNetlifyRuntime(root, manifest, {
    env: childEnv,
    nodeVersion,
    packageManagerVersion: version,
  });
  const settings = qualifyConfig(launcher, root, childEnv, qualifiedChild, ambient);
  qualifyRoots(root);
  assert.deepEqual(currentOwners(root), before, 'Qualification changed installer source owners');
  verifyAmbientPnpmConfig(ambient);
  record({
    stage: 'second-production-install-qualified',
    ambient: {
      kind: ambient.proof === null ? 'absent' : 'sole-netlify-cache-setting',
      sha256: ambient.proof?.sha256 ?? null,
      scalarForm: ambient.form ?? null,
    },
    launcher,
    node: { path: realpathSync(process.execPath), version: nodeVersion },
    settings,
    owners: before,
    residue: residueProbe(root),
    scope: 'Workspace reconstruction; initial platform install/cache logs are separate evidence',
  });
  const result = installStage(launcher, root, childEnv, runChild, record, ambient);
  qualifyRoots(root);
  assert.deepEqual(currentOwners(root), before, 'Second installer changed source owners');
  const metadata = installedMetadata(root);
  record({
    stage: 'second-production-install-accepted',
    metadata,
    scope: 'Finite installer metadata; selected-proof physical graph remains first prebuild',
  });
  return { result, metadata, settings, owners: before };
}

export function runNetlifyProductionInstall() {
  assert.equal(process.cwd(), ROOT, 'Netlify installer must start from the fixed checkout root');
  return installNetlifyProductionDependencies(
    ROOT,
    { env: process.env, nodeVersion: process.version },
    { runChild: spawnSync, record: (event) => console.log(JSON.stringify(event)) }
  );
}

if (isMain(import.meta.url)) {
  parseArgs({ options: {}, allowPositionals: false, strict: true });
  runMain(async () => runNetlifyProductionInstall());
}
