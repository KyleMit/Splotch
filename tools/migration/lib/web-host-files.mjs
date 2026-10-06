import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { sha256 } from './web-host-source.mjs';

export function fileInventory(root) {
  const entries = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile() || stat.isSymbolicLink()) {
        entries.push({
          path: relative(root, path),
          bytes: stat.size,
          kind: stat.isSymbolicLink() ? 'symlink' : 'file',
          mode: stat.mode & 0o777,
          target: stat.isSymbolicLink() ? relative(realpathSync(root), realpathSync(path)) : null,
          sha256: sha256(stat.isSymbolicLink() ? readlinkSync(path) : readFileSync(path)),
          link: stat.isSymbolicLink() ? readlinkSync(path) : null,
        });
      } else throw new Error(`Unsupported inventory entry: ${path}`);
    }
  }
  try {
    lstatSync(root);
  } catch (error) {
    if (error.code === 'ENOENT') return entries;
    throw error;
  }
  visit(root);
  return entries.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
}

export function borrowedWriteWitness(sourceRoot) {
  const paths = ['web/.svelte-kit', 'web/.netlify', '.netlify', 'web/build', 'node_modules'];
  return Object.fromEntries(
    paths.map((path) => [path, sha256(JSON.stringify(fileInventory(join(sourceRoot, path))))])
  );
}

export function assertBorrowedWitness(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    const changed = Object.keys(before).filter((path) => before[path] !== after[path]);
    throw new Error(`Build changed borrowed checkout outputs/dependencies: ${changed.join(', ')}`);
  }
}
