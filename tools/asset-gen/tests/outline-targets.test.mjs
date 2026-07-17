import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveOutlineTargets } from '../lib/outline-targets.mjs';

let root;

async function addOutline(relativePath) {
  const path = join(root, relativePath);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, 'outline');
  return path;
}

const options = (overrides = {}) => ({
  root,
  includeCovers: false,
  explicitFiles: true,
  sort: 'all',
  defaultAll: true,
  onMissing: 'defer',
  ...overrides,
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'splotch-outline-targets-'));
  await addOutline('nature/zebra-wide.outline.webp');
  await addOutline('nature/ant-tall.outline.webp');
  await addOutline('nature/nature.outline.webp');
  await addOutline('space/moon-wide.outline.webp');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test('defaults to all tall and wide pages in stable order without category covers', async () => {
  await expect(resolveOutlineTargets([], options())).resolves.toEqual([
    join(root, 'nature/ant-tall.outline.webp'),
    join(root, 'nature/zebra-wide.outline.webp'),
    join(root, 'space/moon-wide.outline.webp'),
  ]);
});

test('resolves categories and page ids', async () => {
  await expect(resolveOutlineTargets(['nature'], options())).resolves.toEqual([
    join(root, 'nature/ant-tall.outline.webp'),
    join(root, 'nature/zebra-wide.outline.webp'),
  ]);
  await expect(resolveOutlineTargets(['nature/ant-tall'], options())).resolves.toEqual([
    join(root, 'nature/ant-tall.outline.webp'),
  ]);
});

test('preserves explicit WebP support as a caller policy', async () => {
  await expect(resolveOutlineTargets(['nature/ant-tall.outline.webp'], options())).resolves.toEqual(
    [join(root, 'nature/ant-tall.outline.webp')]
  );
  await expect(
    resolveOutlineTargets(
      ['nature/ant-tall.outline.webp'],
      options({
        explicitFiles: false,
        onMissing: (target) => {
          throw new Error(`missing ${target}`);
        },
      })
    )
  ).rejects.toThrow('missing nature/ant-tall.outline.webp');
});

test('includes category covers only when requested', async () => {
  await expect(
    resolveOutlineTargets(['nature'], options({ includeCovers: true }))
  ).resolves.toEqual([
    join(root, 'nature/ant-tall.outline.webp'),
    join(root, 'nature/nature.outline.webp'),
    join(root, 'nature/zebra-wide.outline.webp'),
  ]);
});

test('preserves deferred and immediate missing-target behavior', async () => {
  await expect(resolveOutlineTargets(['nature/missing'], options())).resolves.toEqual([
    join(root, 'nature/missing.outline.webp'),
  ]);
  await expect(
    resolveOutlineTargets(
      ['nature/missing'],
      options({
        onMissing: (target) => {
          throw new Error(`no target ${target}`);
        },
      })
    )
  ).rejects.toThrow('no target nature/missing');
});

test('supports no-op defaults and both existing sort policies', async () => {
  await expect(resolveOutlineTargets([], options({ defaultAll: false }))).resolves.toEqual([]);
  await expect(
    resolveOutlineTargets(['space', 'nature'], options({ sort: 'per-target' }))
  ).resolves.toEqual([
    join(root, 'space/moon-wide.outline.webp'),
    join(root, 'nature/ant-tall.outline.webp'),
    join(root, 'nature/zebra-wide.outline.webp'),
  ]);
  await expect(resolveOutlineTargets(['space', 'nature'], options())).resolves.toEqual([
    join(root, 'nature/ant-tall.outline.webp'),
    join(root, 'nature/zebra-wide.outline.webp'),
    join(root, 'space/moon-wide.outline.webp'),
  ]);
});

describe('configuration', () => {
  test('requires callers to state every behavior-changing policy', async () => {
    await expect(resolveOutlineTargets([], { root })).rejects.toThrow(
      'includeCovers must be a boolean'
    );
  });
});
