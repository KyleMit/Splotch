import { existsSync, statSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { join } from 'node:path';
import { COLORING_DIR, toPosix } from './asset-paths.mjs';
import { LIGHT_OVERLAY_SUFFIX } from './line-art.mjs';

const SORT_MODES = new Set([false, 'per-target', 'all']);

function assertOptions({ includeCovers, explicitFiles, sort, defaultAll, onMissing }) {
  if (typeof includeCovers !== 'boolean') throw new TypeError('includeCovers must be a boolean');
  if (typeof explicitFiles !== 'boolean') throw new TypeError('explicitFiles must be a boolean');
  if (!SORT_MODES.has(sort)) throw new TypeError('sort must be false, "per-target", or "all"');
  if (typeof defaultAll !== 'boolean') throw new TypeError('defaultAll must be a boolean');
  if (onMissing !== 'defer' && typeof onMissing !== 'function') {
    throw new TypeError('onMissing must be "defer" or a function');
  }
}

async function pagesUnder(root, sub, includeCovers, shouldSort) {
  const cwd = sub ? join(root, sub) : root;
  const pages = [];
  for await (const entry of glob('**/*-{tall,wide}.overlay.svg', { cwd }))
    pages.push(join(cwd, entry));
  if (includeCovers) {
    for await (const entry of glob('**/cover.overlay.svg', { cwd })) pages.push(join(cwd, entry));
  }
  return shouldSort ? pages.sort() : pages;
}

function explicitTarget(root, normalized) {
  if (normalized.endsWith('.svg') || normalized.endsWith('.webp')) return join(root, normalized);
  const vector = join(root, `${normalized}${LIGHT_OVERLAY_SUFFIX}`);
  return vector;
}

export async function resolveLineArtTargets(
  args,
  { root = COLORING_DIR, includeCovers, explicitFiles, sort, defaultAll, onMissing }
) {
  assertOptions({ includeCovers, explicitFiles, sort, defaultAll, onMissing });
  if (!args.length) {
    if (!defaultAll) return [];
    return pagesUnder(root, '', includeCovers, sort !== false);
  }

  const groups = await Promise.all(
    args.map(async (target) => {
      const normalized = toPosix(target);
      const asFile = explicitTarget(root, normalized);
      if (explicitFiles && (normalized.endsWith('.svg') || normalized.endsWith('.webp'))) {
        return [asFile];
      }
      if (existsSync(asFile)) return [asFile];

      const asDirectory = join(root, normalized);
      if (existsSync(asDirectory) && statSync(asDirectory).isDirectory()) {
        return pagesUnder(root, normalized, includeCovers, sort === 'per-target');
      }

      if (onMissing === 'defer') return [asFile];
      onMissing(target, root);
      return [];
    })
  );
  const pages = groups.flat();
  return sort === 'all' ? pages.sort() : pages;
}
