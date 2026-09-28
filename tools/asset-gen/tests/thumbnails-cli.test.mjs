import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const state = vi.hoisted(() => ({ coloringDir: null }));

vi.mock('../lib/asset-paths.mjs', () => ({
  get COLORING_DIR() {
    return state.coloringDir;
  },
}));
vi.mock('../lib/asset-cli.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  fail(message) {
    throw new Error(message);
  },
}));
// The fixture "SVGs" hold PNG bytes, so rasterizing is reading them.
vi.mock('../lib/line-art.mjs', () => ({
  rasterizeLineArt: async (path) => readFile(path),
}));

const COVER_THUMBS = ['cover.thumb.webp', 'cover.chalk.thumb.webp'];
const originalArgv = process.argv;

async function runCli(...args) {
  process.argv = ['node', 'gen-thumbnails.mjs', ...args];
  vi.resetModules();
  await import('../coloring/gen-thumbnails.mjs');
}

const thumbsIn = (category) =>
  COVER_THUMBS.filter((file) => existsSync(join(state.coloringDir, category, file)));

beforeEach(async () => {
  state.coloringDir = await mkdtemp(join(tmpdir(), 'splotch-thumbnails-cli-'));
  const cover = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  for (const category of ['farm', 'space']) {
    await mkdir(join(state.coloringDir, category));
    await writeFile(join(state.coloringDir, category, 'cover.overlay.svg'), cover);
    await writeFile(join(state.coloringDir, category, 'cover.dark.overlay.svg'), cover);
  }
  await mkdir(join(state.coloringDir, 'max-240px'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  await rm(state.coloringDir, { recursive: true, force: true });
});

it('writes both cover thumbnails for only the requested category', async () => {
  await runCli('farm');

  expect(thumbsIn('farm')).toEqual(COVER_THUMBS);
  expect(thumbsIn('space')).toEqual([]);
});

it('treats every folder with cover line art as a category when none is named', async () => {
  await runCli();

  expect(thumbsIn('farm')).toEqual(COVER_THUMBS);
  expect(thumbsIn('space')).toEqual(COVER_THUMBS);
});

it.each([
  [['fram', 'farm'], 'Unknown coloring category: fram — categories: farm, space'],
  [['max-240px'], 'Unknown coloring category: max-240px'],
  [['--dry-run', 'farm'], "Unknown option '--dry-run'"],
])('rejects %j before writing any thumbnail', async (args, message) => {
  await expect(runCli(...args)).rejects.toThrow(message);

  expect(thumbsIn('farm')).toEqual([]);
});
