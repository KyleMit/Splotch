import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';

function requireMapping(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a mapping`);
  }
  return value;
}

export function readLockFile(path) {
  const doc = parseDocument(readFileSync(path, 'utf8'), { uniqueKeys: true });
  if (doc.errors.length) throw new Error(`Invalid lock YAML: ${doc.errors[0].message}`);
  const lock = requireMapping(doc.toJS(), 'lock');
  if (String(lock.lockfileVersion) !== '9.0') throw new Error('Expected pnpm lockfile v9');
  for (const name of ['packages', 'snapshots', 'importers']) requireMapping(lock[name], name);
  return lock;
}

export function artifactIdentity(key) {
  const match = /^(@[^/]+\/[^@]+|[^@]+)@(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/.exec(key);
  if (!match) throw new Error(`Unsupported package identity: ${key}`);
  return { key, name: match[1], version: match[2] };
}

export function artifactMap(lock) {
  return new Map(
    Object.entries(lock.packages).map(([key, value]) => {
      const identity = artifactIdentity(key);
      const resolution = requireMapping(value.resolution, `${key} resolution`);
      if (typeof resolution.integrity !== 'string') throw new Error(`Missing integrity: ${key}`);
      if (resolution.tarball && !resolution.tarball.startsWith('https://registry.npmjs.org/')) {
        throw new Error(`Nonregistry artifact requires separate review: ${key}`);
      }
      return [key, { ...identity, ...resolution }];
    })
  );
}

function snapshotKey(name, version, snapshots) {
  if (typeof version !== 'string') throw new Error(`Invalid dependency version: ${name}`);
  const direct = `${name}@${version}`;
  if (Object.hasOwn(snapshots, direct)) return direct;
  if (Object.hasOwn(snapshots, version)) return version;
  if (version.startsWith('link:') || version.startsWith('workspace:')) {
    throw new Error(`Workspace dependency edge is outside the candidate boundary: ${name}`);
  }
  throw new Error(`Unresolved lock snapshot: ${direct}`);
}

export function getImporterDirectArtifactKeys(lock, importerPath) {
  const importer = requireMapping(lock.importers[importerPath], `importer ${importerPath}`);
  return Object.entries(importer.dependencies ?? {}).map(([name, entry]) =>
    snapshotKey(name, entry.version, lock.snapshots).replace(/\(.*$/, '')
  );
}

export function getImporterArtifactKeys(lock, importerPath, includeDev = false) {
  const importer = requireMapping(lock.importers[importerPath], `importer ${importerPath}`);
  const groups = [
    'dependencies',
    'optionalDependencies',
    ...(includeDev ? ['devDependencies'] : []),
  ];
  const pending = groups.flatMap((group) =>
    Object.entries(importer[group] ?? {}).map(([name, entry]) =>
      snapshotKey(name, entry.version, lock.snapshots)
    )
  );
  const visited = new Set();
  const artifacts = new Set();
  while (pending.length) {
    const key = pending.pop();
    if (visited.has(key)) continue;
    visited.add(key);
    const snapshot = requireMapping(lock.snapshots[key], `snapshot ${key}`);
    const artifactKey = key.replace(/\(.*$/, '');
    if (!Object.hasOwn(lock.packages, artifactKey))
      throw new Error(`Snapshot has no artifact: ${key}`);
    artifacts.add(artifactKey);
    for (const group of ['dependencies', 'optionalDependencies']) {
      for (const [name, version] of Object.entries(snapshot[group] ?? {})) {
        pending.push(snapshotKey(name, version, lock.snapshots));
      }
    }
  }
  return artifacts;
}

export function candidateExclusiveArtifacts(lock) {
  const all = artifactMap(lock);
  const production = getImporterArtifactKeys(lock, '.');
  return [...getImporterArtifactKeys(lock, CANDIDATE_DIRECTORY, true)]
    .filter((key) => !production.has(key))
    .map((key) => all.get(key));
}

export function candidateOnlyPackageNames(lock) {
  const all = artifactMap(lock);
  const production = new Set(
    [...getImporterArtifactKeys(lock, '.')].map((key) => all.get(key).name)
  );
  return [
    ...new Set(
      [...getImporterArtifactKeys(lock, CANDIDATE_DIRECTORY, true)]
        .map((key) => all.get(key).name)
        .filter((name) => !production.has(name))
    ),
  ].sort();
}

export function changedArtifactMaps(original, selected) {
  return [...selected.values()].filter((artifact) => {
    const old = original.get(artifact.key);
    return !old || old.integrity !== artifact.integrity || old.tarball !== artifact.tarball;
  });
}

export function changedArtifacts(before, after) {
  return changedArtifactMaps(artifactMap(before), artifactMap(after));
}

export function getImporterDependencyPaths(lock, artifactKey) {
  const reverse = new Map();
  const targets = [];
  for (const [key, snapshot] of Object.entries(lock.snapshots)) {
    if (key.replace(/\(.*$/, '') === artifactKey) targets.push(key);
    for (const group of ['dependencies', 'optionalDependencies']) {
      for (const [name, version] of Object.entries(snapshot[group] ?? {})) {
        const child = snapshotKey(name, version, lock.snapshots);
        if (!reverse.has(child)) reverse.set(child, new Set());
        reverse.get(child).add(key);
      }
    }
  }
  const reaches = new Set();
  const pending = [...targets];
  while (pending.length) {
    const key = pending.pop();
    if (reaches.has(key)) continue;
    reaches.add(key);
    pending.push(...(reverse.get(key) ?? []));
  }
  const paths = [];
  function visit(importer, key, names, seen) {
    if (!reaches.has(key) || seen.has(key)) return;
    if (targets.includes(key)) {
      paths.push([importer, ...names].join('>'));
      return;
    }
    const nextSeen = new Set([...seen, key]);
    for (const group of ['dependencies', 'optionalDependencies']) {
      for (const [name, version] of Object.entries(lock.snapshots[key][group] ?? {}))
        visit(importer, snapshotKey(name, version, lock.snapshots), [...names, name], nextSeen);
    }
  }
  for (const [importer, manifest] of Object.entries(lock.importers)) {
    for (const group of ['dependencies', 'optionalDependencies', 'devDependencies']) {
      for (const [name, entry] of Object.entries(manifest[group] ?? {}))
        visit(importer, snapshotKey(name, entry.version, lock.snapshots), [name], new Set());
    }
  }
  return [...new Set(paths)].sort();
}
