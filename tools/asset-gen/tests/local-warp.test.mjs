import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR, resolveNightLineArt } from '../lib/asset-paths.mjs';
import { LOCAL_WARP_MAX_PX, localWarp } from '../lib/local-warp.mjs';
import { mergeFlags, pageLevers } from '../lib/page-notes.mjs';

function lineArt({ shiftedFeatureX = 0, shiftedFeatureY = 0 } = {}) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect width="512" height="512" fill="white"/>
      <g fill="none" stroke="black" stroke-width="8">
        <circle cx="96" cy="96" r="48"/>
        <rect x="304" y="48" width="112" height="96" rx="20"/>
        <path d="M48 352 Q96 272 160 352 T272 352"/>
        <g transform="translate(${shiftedFeatureX} ${shiftedFeatureY})">
          <rect x="328" y="304" width="88" height="128" rx="18"/>
          <path d="M344 336 L400 400 M400 336 L344 400"/>
        </g>
      </g>
    </svg>
  `);
}

async function rendered(options) {
  return sharp(lineArt(options)).png().toBuffer();
}

describe('local-warp registration score', () => {
  it('subtracts a rigid translation instead of reporting it as local warp', async () => {
    const source = await rendered();
    const translated = await sharp(source)
      .affine(
        [
          [1, 0],
          [0, 1],
        ],
        { idx: 4, idy: -4, background: '#ffffff' }
      )
      .png()
      .toBuffer();

    const score = await localWarp(source, translated);

    expect(Math.hypot(score.globalDx, score.globalDy)).toBeGreaterThanOrEqual(4);
    expect(score.localWarpMax).toBeLessThanOrEqual(LOCAL_WARP_MAX_PX);
  });

  it('rejects a locally displaced articulated feature', async () => {
    const source = await rendered();
    const score = await localWarp(
      source,
      await rendered({ shiftedFeatureX: 8, shiftedFeatureY: -6 })
    );

    expect(Math.hypot(score.globalDx, score.globalDy)).toBeLessThan(2);
    expect(score.localWarpMax).toBeGreaterThan(LOCAL_WARP_MAX_PX);
    expect(score.worstTile).toMatchObject({ confident: true });
  });
});

describe('catalog calibration', () => {
  async function scoreLight(page) {
    const [category, name] = page.split('/');
    return localWarp(
      await readFile(join(COLORING_DIR, category, `${name}.outline.webp`)),
      await readFile(join(FILL_SRC_DIR, category, `${name}.light.raw.webp`))
    );
  }

  it('separates the excavator piston warp from the historical big-nudge controls', async () => {
    const [pig, excavator, stegosaurus] = await Promise.all([
      scoreLight('farm/pig-wide'),
      scoreLight('vehicles/excavator-wide'),
      scoreLight('dinosaur/stegosaurus-wide'),
    ]);

    expect(pig.localWarpMax).toBeLessThan(LOCAL_WARP_MAX_PX);
    expect(stegosaurus.localWarpMax).toBeLessThan(LOCAL_WARP_MAX_PX);
    expect(excavator.localWarpMax).toBeGreaterThan(LOCAL_WARP_MAX_PX);
    expect(Math.hypot(excavator.globalDx, excavator.globalDy)).toBeLessThan(3);
    expect(excavator.worstTile).toMatchObject({
      centerX: 384,
      centerY: 384,
      confidence: 'split-peak',
    });
  });

  it('bounds every reviewed baseline exception while new pages keep the strict default', async () => {
    const exceptions = [
      ['farm/dog-tall', 'light'],
      ['farm/horse-tall', 'night'],
      ['farm/horse-wide', 'night'],
      ['objects/apple-tall', 'light'],
      ['shapes/heart-tall', 'light'],
      ['space/astronaut-wide', 'light'],
      ['space/ship-wide', 'night'],
      ['vehicles/excavator-wide', 'light'],
      ['vehicles/excavator-wide', 'night'],
    ];

    for (const [page, theme] of exceptions) {
      const [category, name] = page.split('/');
      const penPath = join(COLORING_DIR, category, `${name}.outline.webp`);
      const pen = await readFile(penPath);
      const source = theme === 'night' ? (await resolveNightLineArt(penPath, pen)).source : pen;
      const fill = await readFile(join(FILL_SRC_DIR, category, `${name}.${theme}.raw.webp`));
      const score = await localWarp(source, fill);
      const max = pageLevers(page, theme).flags['warp-max'];

      expect(score.localWarpMax, `${page} ${theme}`).toBeLessThanOrEqual(max);
      expect(max - score.localWarpMax, `${page} ${theme} margin`).toBeLessThanOrEqual(0.51);
    }

    expect(pageLevers('vehicles/new-page-wide', 'light')).toBeNull();
    expect(LOCAL_WARP_MAX_PX).toBe(4);
  });

  it('lets an explicit CLI ceiling tighten a reviewed page baseline', () => {
    const levers = pageLevers('vehicles/excavator-wide', 'light');
    expect(mergeFlags({ 'warp-max': '3' }, levers)).toEqual({
      merged: { 'warp-max': '3' },
      fromRegistry: [],
    });
  });
});
