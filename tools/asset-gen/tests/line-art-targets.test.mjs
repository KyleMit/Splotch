import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveLineArtTargets } from '../lib/line-art-targets.mjs';

let root;

async function addLineArt(relativePath) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, 'line art');
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
  root = await mkdtemp(join(tmpdir(), 'splotch-line-art-targets-'));
  await addLineArt('nature/zebra-wide.overlay.svg');
  await addLineArt('nature/ant-tall.overlay.svg');
  await addLineArt('nature/cover.overlay.svg');
  await addLineArt('space/moon-wide.overlay.svg');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it('defaults to canonical pages in stable order without category covers', async () => {
  await expect(resolveLineArtTargets([], options())).resolves.toEqual([
    join(root, 'nature/ant-tall.overlay.svg'),
    join(root, 'nature/zebra-wide.overlay.svg'),
    join(root, 'space/moon-wide.overlay.svg'),
  ]);
});

it('resolves categories and suffix-free page ids', async () => {
  await expect(resolveLineArtTargets(['nature'], options())).resolves.toEqual([
    join(root, 'nature/ant-tall.overlay.svg'),
    join(root, 'nature/zebra-wide.overlay.svg'),
  ]);
  await expect(resolveLineArtTargets(['nature/ant-tall'], options())).resolves.toEqual([
    join(root, 'nature/ant-tall.overlay.svg'),
  ]);
});

it('preserves explicit file support as a caller policy', async () => {
  await expect(resolveLineArtTargets(['nature/ant-tall.overlay.svg'], options())).resolves.toEqual([
    join(root, 'nature/ant-tall.overlay.svg'),
  ]);
  await expect(
    resolveLineArtTargets(
      ['nature/missing-tall.overlay.svg'],
      options({
        explicitFiles: false,
        onMissing: (target) => {
          throw new Error(`missing ${target}`);
        },
      })
    )
  ).rejects.toThrow('missing nature/missing-tall.overlay.svg');
});

it('includes canonical covers only when requested', async () => {
  await expect(
    resolveLineArtTargets(['nature'], options({ includeCovers: true }))
  ).resolves.toEqual([
    join(root, 'nature/ant-tall.overlay.svg'),
    join(root, 'nature/cover.overlay.svg'),
    join(root, 'nature/zebra-wide.overlay.svg'),
  ]);
});

it('preserves deferred and immediate missing-target behavior', async () => {
  await expect(resolveLineArtTargets(['nature/missing'], options())).resolves.toEqual([
    join(root, 'nature/missing.overlay.svg'),
  ]);
  await expect(
    resolveLineArtTargets(
      ['nature/missing'],
      options({
        onMissing: (target) => {
          throw new Error(`no target ${target}`);
        },
      })
    )
  ).rejects.toThrow('no target nature/missing');
});

it('supports no-op defaults and both existing sort policies', async () => {
  await expect(resolveLineArtTargets([], options({ defaultAll: false }))).resolves.toEqual([]);
  await expect(
    resolveLineArtTargets(['space', 'nature'], options({ sort: 'per-target' }))
  ).resolves.toEqual([
    join(root, 'space/moon-wide.overlay.svg'),
    join(root, 'nature/ant-tall.overlay.svg'),
    join(root, 'nature/zebra-wide.overlay.svg'),
  ]);
  await expect(resolveLineArtTargets(['space', 'nature'], options())).resolves.toEqual([
    join(root, 'nature/ant-tall.overlay.svg'),
    join(root, 'nature/zebra-wide.overlay.svg'),
    join(root, 'space/moon-wide.overlay.svg'),
  ]);
});

it('normalizes backslash separators in target args', async () => {
  await expect(resolveLineArtTargets(['nature\\ant-tall'], options())).resolves.toEqual([
    join(root, 'nature/ant-tall.overlay.svg'),
  ]);
  await expect(resolveLineArtTargets(['nature\\ant-tall.overlay.svg'], options())).resolves.toEqual(
    [join(root, 'nature/ant-tall.overlay.svg')]
  );
});

describe('configuration', () => {
  it('requires callers to state every behavior-changing policy', async () => {
    await expect(resolveLineArtTargets([], { root })).rejects.toThrow(
      'includeCovers must be a boolean'
    );
  });
});
