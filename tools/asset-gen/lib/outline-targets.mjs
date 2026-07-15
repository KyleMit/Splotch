import { existsSync, statSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { join } from 'node:path';
import { COLORING_DIR } from './paths.mjs';

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

function normalizeTarget(target) {
  return target.replaceAll('\\', '/');
}

async function pagesUnder(root, sub, includeCovers, shouldSort) {
  const cwd = sub ? join(root, sub) : root;
  const pattern = includeCovers ? '**/*.outline.webp' : '**/*-{tall,wide}.outline.webp';
  const pages = [];
  for await (const entry of glob(pattern, { cwd })) pages.push(join(cwd, entry));
  return shouldSort ? pages.sort() : pages;
}

export async function resolveOutlineTargets(
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
      const normalized = normalizeTarget(target);
      if (explicitFiles && normalized.endsWith('.webp')) return [join(root, normalized)];

      const asFile = join(root, `${normalized}.outline.webp`);
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
