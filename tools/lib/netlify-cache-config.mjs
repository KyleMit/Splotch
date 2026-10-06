import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, parse } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { CANDIDATE_DIRECTORY } from './native-candidate.mjs';

const MAX_AMBIENT_CONFIG_BYTES = 4096;
const NETLIFY_CACHE_ROOT = '/opt/build/cache';
const NETLIFY_HOME_ROOT = '/opt/buildhome';
const NETLIFY_HOME_STORE = join(NETLIFY_HOME_ROOT, '.pnpm-store');
const CACHE_STORE_FAMILY = Object.freeze({
  kind: 'sole-netlify-cache-setting',
  disposition: 'qualified-netlify-cache-literal',
});
const HOME_STORE_FAMILY = Object.freeze({
  kind: 'sole-netlify-home-store-setting',
  disposition: 'qualified-netlify-home-store-literal',
});
const STORE_VERSION_DIRECTORY = 'v11';
const AMBIENT_CONFIG_KEYS = [
  'storeDir',
  'cacheDir',
  'stateDir',
  'globalDir',
  'nodeLinker',
  'globalPnpmfile',
  'pnpmfile',
  'configDependencies',
  'lockfileDir',
  'managePackageManagerVersions',
];

function optionalEntry(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function fileIdentity(entry) {
  return {
    device: entry.dev,
    inode: entry.ino,
    mode: entry.mode,
    sizeBytes: entry.size,
    modifiedAtMs: entry.mtimeMs,
    changedAtMs: entry.ctimeMs,
  };
}

function literalStore(text) {
  const match =
    /^storeDir:[ \t]+(?:([/][A-Za-z0-9._/-]+)|'([/][A-Za-z0-9._/-]+)'|"([/][A-Za-z0-9._/-]+)")[ \t]*(?:\r?\n)?$/.exec(
      text
    );
  if (!match || match[0] !== text) return null;
  const value = match[1] ?? match[2] ?? match[3];
  return { value, form: match[1] ? 'plain' : match[2] ? 'single-quoted' : 'double-quoted' };
}

function inCache(value) {
  if (!value.startsWith(`${NETLIFY_CACHE_ROOT}/`)) return false;
  const suffix = value.slice(NETLIFY_CACHE_ROOT.length + 1).replace(/\/$/, '');
  return (
    suffix.length > 0 && suffix.split('/').every((part) => part && part !== '.' && part !== '..')
  );
}

function homeStoreFacts(value, env) {
  const processHome = homedir();
  return {
    matchesFixedHomeStore: value === NETLIFY_HOME_STORE,
    processHomeMatchesFixed: processHome === NETLIFY_HOME_ROOT,
    storeMatchesProcessHome: value === join(processHome, '.pnpm-store'),
    childHomeMatchesFixed: env.HOME === NETLIFY_HOME_ROOT,
  };
}

function requireHomeOwner(config, env) {
  const facts = homeStoreFacts(config.storeDir, env);
  if (!facts.processHomeMatchesFixed || !facts.childHomeMatchesFixed) {
    config.record({ stage: 'ambient-pnpm-home-owner-refused', ...facts });
    assert.fail('Netlify home store homeowner differs');
  }
}

function homeFilesystemRefused(config, path, kind) {
  const role =
    path === config.storeDir ? 'store' : path === config.physicalStore ? 'version' : 'home';
  config.record({ stage: 'ambient-pnpm-home-filesystem-refused', role, kind });
}

function canonicalDirectoryProof(path, refused) {
  const root = parse(path).root;
  let current = root;
  const proof = [];
  for (const part of ['', ...path.slice(root.length).split('/').filter(Boolean)]) {
    if (part) current = join(current, part);
    let kind = 'inspection';
    try {
      const entry = optionalEntry(current);
      if (!entry) break;
      kind = entry.isSymbolicLink() ? 'link' : entry.isFile() ? 'file' : 'other';
      assert.ok(
        entry.isDirectory() && !entry.isSymbolicLink(),
        'Cache store ancestor is not a regular directory'
      );
      kind = 'inspection';
      const canonical = realpathSync(current);
      kind = 'noncanonical';
      assert.ok(canonical === current, 'Cache store ancestor is not canonical');
      proof.push({ path: current, device: entry.dev, inode: entry.ino, mode: entry.mode });
    } catch (error) {
      refused?.(current, kind);
      throw error;
    }
  }
  return proof;
}

function storeProof(config) {
  const home = config.family === HOME_STORE_FAMILY;
  const proof = canonicalDirectoryProof(
    config.physicalStore,
    home ? (path, kind) => homeFilesystemRefused(config, path, kind) : undefined
  );
  if (home && !proof.some((entry) => entry.path === NETLIFY_HOME_ROOT)) {
    homeFilesystemRefused(config, NETLIFY_HOME_ROOT, 'missing');
    assert.fail('Netlify home directory is absent');
  }
  return proof;
}

function boundedConfig(path, entry) {
  const observation = {
    stage: 'ambient-pnpm-config-refused',
    kind: entry.isSymbolicLink() ? 'symlink' : entry.isFile() ? 'regular-file' : 'other',
    sizeBytes: entry.size,
    namedKeys: [],
    unlistedKeyCount: 0,
    storeDirValueClass: 'unobserved',
    soleStoreDirForm: 'unobserved',
  };
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size > MAX_AMBIENT_CONFIG_BYTES)
    return { observation };
  if (realpathSync(dirname(path)) !== dirname(path))
    return { observation: { ...observation, kind: 'linked-parent' } };
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const actual = fstatSync(descriptor);
    if (!actual.isFile() || actual.size > MAX_AMBIENT_CONFIG_BYTES) return { observation };
    assert.deepEqual(
      fileIdentity(actual),
      fileIdentity(entry),
      'Ambient pnpm file changed before read'
    );
    const buffer = Buffer.alloc(MAX_AMBIENT_CONFIG_BYTES + 1);
    const count = readSync(descriptor, buffer, 0, buffer.length, 0);
    if (count > MAX_AMBIENT_CONFIG_BYTES || count !== actual.size) return { observation };
    assert.deepEqual(
      fileIdentity(fstatSync(descriptor)),
      fileIdentity(actual),
      'Ambient pnpm file changed during read'
    );
    const bytes = buffer.subarray(0, count);
    const text = bytes.toString('utf8');
    const names = [...text.matchAll(/^([A-Za-z][A-Za-z0-9-]{0,63}):/gm)].map((match) => match[1]);
    observation.namedKeys = names.filter((name) => AMBIENT_CONFIG_KEYS.includes(name));
    observation.unlistedKeyCount = names.length - observation.namedKeys.length;
    const store = literalStore(text);
    observation.soleStoreDirForm = store?.form ?? 'unrecognized';
    observation.storeDirValueClass = store
      ? store.value === NETLIFY_HOME_STORE
        ? 'netlify-home-store-path'
        : inCache(store.value)
          ? 'netlify-cache-path'
          : 'other-absolute-path'
      : 'unrecognized';
    return {
      observation,
      store,
      proof: {
        ...fileIdentity(actual),
        parent: canonicalDirectoryProof(dirname(path)),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    };
  } finally {
    closeSync(descriptor);
  }
}

export function qualifyAmbientPnpmConfig(path, root, env, record) {
  let config;
  try {
    const entry = optionalEntry(path);
    if (entry === null) return { path, proof: null, storeDir: null };
    config = boundedConfig(path, entry);
  } catch {
    throw new Error('Ambient pnpm configuration filesystem qualification failed');
  }
  const home = config.store?.value === NETLIFY_HOME_STORE;
  const facts = home ? homeStoreFacts(config.store.value, env) : null;
  if (
    env.NETLIFY !== 'true' ||
    !config.store ||
    (!home && !inCache(config.store.value)) ||
    (home && (!facts.processHomeMatchesFixed || !facts.childHomeMatchesFixed))
  ) {
    record({ ...config.observation, ...(facts ?? homeStoreFacts(config.store?.value, env)) });
    assert.fail('Ambient pnpm settings need separate review');
  }
  const storeDir = config.store.value;
  const physicalStore = storeDir.endsWith(`/${STORE_VERSION_DIRECTORY}`)
    ? storeDir
    : join(storeDir, STORE_VERSION_DIRECTORY);
  const qualified = {
    path,
    proof: config.proof,
    storeDir,
    physicalStore,
    family: home ? HOME_STORE_FAMILY : CACHE_STORE_FAMILY,
    form: config.store.form,
    record,
  };
  const cleaningRoots = [
    join(root, 'node_modules'),
    join(root, CANDIDATE_DIRECTORY, 'node_modules'),
  ];
  const disjoint = cleaningRoots.every(
    (cleaningRoot) =>
      physicalStore !== cleaningRoot &&
      !physicalStore.startsWith(`${cleaningRoot}/`) &&
      !cleaningRoot.startsWith(`${physicalStore}/`)
  );
  if (home && !disjoint) homeFilesystemRefused(qualified, physicalStore, 'cleanup-overlap');
  assert.ok(disjoint, 'Netlify cache store overlaps clean-install roots');
  try {
    return { ...qualified, cacheProof: storeProof(qualified) };
  } catch {
    throw new Error(
      home
        ? 'Netlify home store filesystem qualification failed'
        : 'Netlify cache store filesystem qualification failed'
    );
  }
}

function verifyConfigProof(config) {
  const entry = optionalEntry(config.path);
  if (config.proof === null) {
    assert.ok(entry === null, 'Ambient pnpm file appeared during qualification');
    return;
  }
  assert.ok(entry && entry.isFile() && !entry.isSymbolicLink(), 'Ambient pnpm file kind changed');
  const actual = boundedConfig(config.path, entry);
  assert.ok(
    actual.proof && actual.store?.value === config.storeDir,
    'Ambient pnpm file changed during qualification'
  );
  assert.deepEqual(actual.proof, config.proof, 'Ambient pnpm file changed during qualification');
  const current = storeProof(config);
  const changed = config.cacheProof.find(
    (entry, index) => !isDeepStrictEqual(entry, current[index])
  );
  if (changed && config.family === HOME_STORE_FAMILY)
    homeFilesystemRefused(config, changed.path, 'identity-changed');
  assert.deepEqual(
    current.slice(0, config.cacheProof.length),
    config.cacheProof,
    'Cache store ancestor changed during qualification'
  );
}

export function verifyAmbientPnpmConfig(config, env) {
  try {
    if (config.family === HOME_STORE_FAMILY) requireHomeOwner(config, env);
    verifyConfigProof(config);
  } catch {
    throw new Error('Ambient pnpm configuration or cache proof changed');
  }
}
