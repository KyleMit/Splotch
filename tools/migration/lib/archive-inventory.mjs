import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { Parser } from 'tar';

const MAX_PACKAGE_JSON_BYTES = 2 * 1024 * 1024;
const REGISTRY = 'https://registry.npmjs.org/';
const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall', 'prepare'];

export function verifyArtifactIntegrity(bytes, integrity) {
  const algorithms = new Set(['sha512', 'sha384', 'sha256', 'sha1']);
  if (typeof integrity !== 'string') throw new Error('Artifact integrity is absent');
  const checks = integrity.split(/\s+/).map((part) => {
    const separator = part.indexOf('-');
    const algorithm = part.slice(0, separator);
    if (!algorithms.has(algorithm)) throw new Error(`Unsupported integrity: ${part}`);
    return createHash(algorithm).update(bytes).digest('base64') === part.slice(separator + 1);
  });
  if (!checks.length || checks.some((match) => !match))
    throw new Error('Archive integrity mismatch');
}

export async function inspectArchive(bytes) {
  let packageJson;
  let packageRoot;
  let packageJsonCount = 0;
  const members = [];
  const parser = new Parser({
    onReadEntry(entry) {
      try {
        const path = entry.path.replace(/^\.\//, '');
        if (path.startsWith('/') || path.split('/').includes('..'))
          throw new Error('Unsafe archive path');
        members.push({ path, type: entry.type, linkpath: entry.linkpath });
        if (/^[^/]+\/package\.json$/.test(path)) {
          packageRoot = path.split('/')[0];
          packageJsonCount++;
          if (entry.type !== 'File' || entry.size > MAX_PACKAGE_JSON_BYTES) {
            throw new Error('Invalid root package.json archive entry');
          }
          const chunks = [];
          entry.on('data', (chunk) => chunks.push(chunk));
          entry.on('end', () => {
            try {
              packageJson = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch (error) {
              parser.abort(error);
            }
          });
        } else entry.resume();
      } catch (error) {
        parser.abort(error);
      }
    },
  });
  const finished = once(parser, 'end');
  parser.end(bytes);
  await finished;
  if (!packageJson || packageJsonCount !== 1)
    throw new Error('Archive requires one root package.json');
  if (
    members.some((entry) => !entry.path.startsWith(`${packageRoot}/`) && entry.path !== packageRoot)
  ) {
    throw new Error('Archive has ambiguous package roots');
  }
  const gyp = members.filter((entry) => entry.path === `${packageRoot}/binding.gyp`);
  if (gyp.some((entry) => entry.type !== 'File'))
    throw new Error('Ambiguous root binding.gyp link');
  const rootHooks = members.filter((entry) => {
    const relative = entry.path.slice(packageRoot.length + 1);
    return relative === '.hooks' || /^\.hooks[\\/]/.test(relative);
  });
  if (
    rootHooks.some((entry) =>
      entry.path === `${packageRoot}/.hooks`
        ? entry.type !== 'Directory'
        : !['File', 'Directory'].includes(entry.type)
    )
  )
    throw new Error('Ambiguous root .hooks member');
  const rootHookFiles = rootHooks
    .filter((entry) => entry.type === 'File')
    .map((entry) => entry.path.slice(packageRoot.length + 1))
    .sort();

  if (
    packageJson.scripts !== undefined &&
    (!packageJson.scripts ||
      typeof packageJson.scripts !== 'object' ||
      Array.isArray(packageJson.scripts))
  ) {
    throw new Error('Archive scripts must be a mapping');
  }
  const hooks = Object.fromEntries(
    INSTALL_HOOKS.filter((name) => Object.hasOwn(packageJson.scripts ?? {}, name)).map((name) => [
      name,
      packageJson.scripts[name],
    ])
  );
  if (Object.values(hooks).some((script) => typeof script !== 'string')) {
    throw new Error('Archive hook must be a command string');
  }
  return {
    name: packageJson.name,
    version: packageJson.version,
    hooks,
    rootBindingGyp: gyp.length > 0,
    rootHookFiles,
  };
}

async function fetchRegistryVersion(artifact) {
  const name = encodeURIComponent(artifact.name);
  const response = await fetch(`${REGISTRY}${name}`, {
    headers: { Accept: 'application/vnd.npm.install-v1+json' },
  });
  if (!response.ok) throw new Error(`Registry ${artifact.key}: ${response.status}`);
  const metadata = (await response.json()).versions?.[artifact.version];
  if (!metadata?.dist?.integrity || !metadata.dist.tarball?.startsWith(REGISTRY)) {
    throw new Error(`Unverifiable registry source: ${artifact.key}`);
  }
  return metadata;
}

export async function inspectRegistryArtifact(artifact) {
  const metadata = await fetchRegistryVersion(artifact);
  if (artifact.tarball && artifact.tarball !== metadata.dist.tarball) {
    throw new Error(`Lock/registry URL mismatch: ${artifact.key}`);
  }
  const response = await fetch(metadata.dist.tarball);
  if (!response.ok) throw new Error(`Archive ${artifact.key}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  verifyArtifactIntegrity(bytes, artifact.integrity);
  verifyArtifactIntegrity(bytes, metadata.dist.integrity);
  const archive = await inspectArchive(bytes);
  if (archive.name !== artifact.name || archive.version !== artifact.version) {
    throw new Error(`Archive identity mismatch: ${artifact.key}`);
  }
  return {
    ...artifact,
    tarball: metadata.dist.tarball,
    registryIntegrity: metadata.dist.integrity,
    hasInstallScript: metadata.hasInstallScript ?? null,
    engines: metadata.engines ?? {},
    metadataHooks: Object.fromEntries(
      INSTALL_HOOKS.filter((name) => Object.hasOwn(metadata.scripts ?? {}, name)).map((name) => [
        name,
        metadata.scripts[name],
      ])
    ),
    ...archive,
    archiveIntegrityVerified: true,
    disposition:
      Object.keys(archive.hooks).length || archive.rootBindingGyp || archive.rootHookFiles.length
        ? 'review-required'
        : 'no-install-hooks',
  };
}
