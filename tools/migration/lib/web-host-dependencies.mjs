import {
  chmodSync,
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { canonicalDirectory, pathInside } from './web-host-ownership.mjs';
import { sha256 } from './web-host-source.mjs';
import { fileInventory } from './web-host-files.mjs';

export function requireFrozenDependencies(root, lockSha256) {
  const directory = join(root, 'node_modules');
  canonicalDirectory(directory);
  const installedLock = join(directory, '.pnpm', 'lock.yaml');
  if (sha256(readFileSync(installedLock)) !== lockSha256) {
    throw new Error(`Installed dependency lock differs from reviewed source: ${installedLock}`);
  }
  for (const name of ['vite', 'svelte-kit', 'tsc', 'playwright']) {
    const bin = join(directory, '.bin', name);
    if (!pathInside(directory, realpathSync(bin)))
      throw new Error(`Dependency binary escapes node_modules: ${bin}`);
  }
  return directory;
}

function copyDependencyFile(source, target, roots, adapters) {
  copyFileSync(source, target, constants.COPYFILE_FICLONE);
  chmodSync(target, lstatSync(source).mode);
  const stat = lstatSync(target);
  const original = lstatSync(source);
  if ((stat.dev === original.dev && stat.ino === original.ino) || stat.nlink !== 1) {
    throw new Error(`Dependency copy aliases a borrowed inode: ${source}`);
  }
  if (relative(roots.sourceModules, source).startsWith('.bin/')) {
    const bytes = readFileSync(target);
    const text = bytes.toString('utf8');
    if (text.includes(roots.sourceRoot)) {
      const rewritten = text.replaceAll(roots.sourceRoot, roots.copyRoot);
      writeFileSync(target, rewritten);
      adapters.push({
        path: relative(roots.sourceModules, source),
        beforeSha256: sha256(bytes),
        afterSha256: sha256(rewritten),
        reason: 'owned-copy binary path relocation',
      });
    }
  }
}

function copyDependencyDirectory(source, target, roots, adapters) {
  mkdirSync(target);
  for (const name of readdirSync(source).sort()) {
    const from = join(source, name);
    const to = join(target, name);
    const stat = lstatSync(from);
    if (stat.isDirectory()) copyDependencyDirectory(from, to, roots, adapters);
    else if (stat.isSymbolicLink()) {
      const link = readlinkSync(from);
      if (isAbsolute(link) || !pathInside(roots.sourceModules, realpathSync(from))) {
        throw new Error(`Dependency link escapes the installed tree: ${from}`);
      }
      const relocated = resolve(to, '..', link);
      if (!pathInside(roots.copyModules, relocated))
        throw new Error(`Relocated dependency link escapes: ${to}`);
      symlinkSync(link, to);
    } else if (stat.isFile()) copyDependencyFile(from, to, roots, adapters);
    else throw new Error(`Unsupported dependency entry: ${from}`);
  }
}

export function copyDependencies(sourceModules, copyRoot) {
  const copyModules = join(copyRoot, 'node_modules');
  const roots = { sourceModules, copyModules, sourceRoot: resolve(sourceModules, '..'), copyRoot };
  const adapters = [];
  const original = fileInventory(sourceModules);
  copyDependencyDirectory(sourceModules, copyModules, roots, adapters);
  const materialized = fileInventory(copyModules);
  const expected = original.map((entry) => {
    const adapter = adapters.find((row) => row.path === entry.path);
    if (!adapter) return entry;
    if (adapter.beforeSha256 !== entry.sha256)
      throw new Error(`Dependency shim input changed: ${entry.path}`);
    const bytes = readFileSync(join(copyModules, entry.path));
    return { ...entry, bytes: bytes.length, sha256: adapter.afterSha256 };
  });
  if (JSON.stringify(materialized) !== JSON.stringify(expected))
    throw new Error(
      'Dependency materialization changed bytes, modes or links outside recorded shims'
    );
  return { adapters, root: copyModules, materialized };
}
