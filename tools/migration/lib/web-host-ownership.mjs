import { randomUUID } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { WEB_HOST_MARKER } from '../../../migration/probes/web-host/host/contract.ts';

export function pathInside(root, target) {
  const path = relative(root, target);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

export function canonicalDirectory(path) {
  const canonical = realpathSync(path);
  if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) {
    throw new Error(`Expected an owned directory, not a link: ${path}`);
  }
  return canonical;
}

export function outputParent(sourceRoot, requestedParent) {
  const parent = canonicalDirectory(resolve(requestedParent));
  if (pathInside(sourceRoot, parent) || pathInside(parent, sourceRoot)) {
    throw new Error(`Output parent must be separate from the source checkout: ${parent}`);
  }
  return parent;
}

export function createOwnedArtifact(parent) {
  const root = mkdtempSync(join(parent, 'splotch-web-host-'));
  const token = randomUUID();
  writeFileSync(join(root, WEB_HOST_MARKER), JSON.stringify({ root, token }), { flag: 'wx' });
  return { root, token };
}

export function assertOwnedArtifact(owned) {
  if (canonicalDirectory(owned.root) !== owned.root) {
    throw new Error(`Artifact root changed its canonical path: ${owned.root}`);
  }
  const marker = join(owned.root, WEB_HOST_MARKER);
  if (
    !lstatSync(marker).isFile() ||
    lstatSync(marker).isSymbolicLink() ||
    lstatSync(marker).nlink !== 1
  ) {
    throw new Error(`Ownership marker is not a regular file: ${marker}`);
  }
  const parsed = JSON.parse(readFileSync(marker, 'utf8'));
  if (parsed.root !== owned.root || parsed.token !== owned.token) {
    throw new Error(`Artifact ownership changed: ${owned.root}`);
  }
}

export function ownedPath(owned, path) {
  assertOwnedArtifact(owned);
  const target = resolve(owned.root, path);
  if (!pathInside(owned.root, target) || target === owned.root) {
    throw new Error(`Artifact path escapes ownership: ${path}`);
  }
  let parent = target;
  while (parent !== owned.root) {
    try {
      const stat = lstatSync(parent);
      if (stat.isFile() && stat.nlink !== 1)
        throw new Error(`Artifact file aliases a borrowed hardlink: ${parent}`);
      if (!pathInside(owned.root, realpathSync(parent))) {
        throw new Error(`Artifact link escapes ownership: ${parent}`);
      }
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      parent = resolve(parent, '..');
    }
  }
  return target;
}

export function writeOwnedJson(owned, path, value) {
  const target = ownedPath(owned, path);
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}
