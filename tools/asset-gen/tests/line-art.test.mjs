import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LINE_ART_ALPHA_THRESHOLD,
  lineArtMask,
  rasterizeLineArt,
  resolveNightLineArt,
} from '../lib/line-art.mjs';
import { resolveLineArtTargets } from '../lib/line-art-targets.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

function svg(fill = '#000') {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4" viewBox="0 0 4 4"><path fill="${fill}" d="M0 0h2v4H0z"/></svg>`
  );
}

describe('canonical line art', () => {
  it('derives the punch mask from alpha independently of theme ink color', async () => {
    const light = await lineArtMask(svg('#000'), 4, 4);
    const dark = await lineArtMask(svg('#fff'), 4, 4);

    expect(LINE_ART_ALPHA_THRESHOLD).toBe(105);
    expect([...light.mask]).toEqual([...dark.mask]);
    expect(light.count).toBe(8);
  });

  it('rasterizes SVG alpha to the ink-on-white analysis contract', async () => {
    const { data } = await sharp(await rasterizeLineArt(svg('#fff')))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect([...data.subarray(0, 3)]).toEqual([0, 0, 0]);
    expect([...data.subarray(9, 12)]).toEqual([255, 255, 255]);
  });

  it('enumerates canonical SVG pages and resolves the dark fork without raster masters', async () => {
    const root = await mkdtemp(join(tmpdir(), 'splotch-line-art-'));
    temporaryDirectories.push(root);
    await mkdir(join(root, 'farm'), { recursive: true });
    const lightPath = join(root, 'farm', 'cat-tall.overlay.svg');
    const darkPath = join(root, 'farm', 'cat-tall.dark.overlay.svg');
    await writeFile(lightPath, svg('#000'));
    await writeFile(darkPath, svg('#fff'));

    await expect(
      resolveLineArtTargets([], {
        root,
        includeCovers: false,
        explicitFiles: false,
        sort: 'all',
        defaultAll: true,
        onMissing: 'defer',
      })
    ).resolves.toEqual([lightPath]);
    const { sourcePath, chalk } = await resolveNightLineArt(lightPath);
    expect(sourcePath).toBe(darkPath);
    expect(chalk).not.toBeNull();
  });
});
