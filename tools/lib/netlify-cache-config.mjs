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
import { dirname, join, parse } from 'node:path';
import { CANDIDATE_DIRECTORY } from './native-candidate.mjs';

const MAX_AMBIENT_CONFIG_BYTES = 4096;
const NETLIFY_CACHE_ROOT = '/opt/build/cache';
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

function canonicalDirectoryProof(path) {
  const root = parse(path).root;
  let current = root;
  const proof = [];
  for (const part of ['', ...path.slice(root.length).split('/').filter(Boolean)]) {
    if (part) current = join(current, part);
    const entry = optionalEntry(current);
    if (!entry) break;
    assert.ok(
      entry.isDirectory() && !entry.isSymbolicLink(),
      'Cache store ancestor is not a regular directory'
    );
    assert.ok(realpathSync(current) === current, 'Cache store ancestor is not canonical');
    proof.push({ path: current, device: entry.dev, inode: entry.ino, mode: entry.mode });
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
      ? inCache(store.value)
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
  if (env.NETLIFY !== 'true' || !config.store || !inCache(config.store.value)) {
    record(config.observation);
    assert.fail('Ambient pnpm settings need separate review');
  }
  const storeDir = config.store.value;
  const physicalStore = storeDir.endsWith(`/${STORE_VERSION_DIRECTORY}`)
    ? storeDir
    : join(storeDir, STORE_VERSION_DIRECTORY);
  const cleaningRoots = [
    join(root, 'node_modules'),
    join(root, CANDIDATE_DIRECTORY, 'node_modules'),
  ];
  assert.ok(
    cleaningRoots.every(
      (cleaningRoot) =>
        physicalStore !== cleaningRoot &&
        !physicalStore.startsWith(`${cleaningRoot}/`) &&
        !cleaningRoot.startsWith(`${physicalStore}/`)
    ),
    'Netlify cache store overlaps clean-install roots'
  );
  let cacheProof;
  try {
    cacheProof = canonicalDirectoryProof(physicalStore);
  } catch {
    throw new Error('Netlify cache store filesystem qualification failed');
  }
  return {
    path,
    proof: config.proof,
    storeDir,
    physicalStore,
    cacheProof,
    form: config.store.form,
  };
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
  const current = canonicalDirectoryProof(config.physicalStore);
  assert.deepEqual(
    current.slice(0, config.cacheProof.length),
    config.cacheProof,
    'Cache store ancestor changed during qualification'
  );
}

export function verifyAmbientPnpmConfig(config) {
  try {
    verifyConfigProof(config);
  } catch {
    throw new Error('Ambient pnpm configuration or cache proof changed');
  }
}
