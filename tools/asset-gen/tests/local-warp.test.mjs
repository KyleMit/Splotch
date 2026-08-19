import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR, resolveNightLineArt } from '../lib/asset-paths.mjs';
import { LOCAL_WARP_MAX_PX, localWarp } from '../lib/local-warp.mjs';
import { mergeFlags, pageLevers } from '../lib/page-notes.mjs';
import { scoreGoldenPage } from '../lib/golden-catalog.mjs';

const REAL_IMAGE_CALIBRATION_TIMEOUT_MS = 10_000;

function lineArt({
  shiftedFeatureX = 0,
  shiftedFeatureY = 0,
  background = 'white',
  stroke = 'black',
} = {}) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect width="512" height="512" fill="${background}"/>
      <g fill="none" stroke="${stroke}" stroke-width="8">
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
  it.each([4, 12])(
    'subtracts a rigid %ipx translation instead of reporting it as local warp',
    async (shift) => {
      const source = await rendered();
      const translated = await sharp(source)
        .affine(
          [
            [1, 0],
            [0, 1],
          ],
          { idx: shift, idy: -shift, background: '#ffffff' }
        )
        .png()
        .toBuffer();

      const score = await localWarp(source, translated);

      expect(Math.hypot(score.globalDx, score.globalDy)).toBeGreaterThanOrEqual(shift);
      expect(score.localWarpMax).toBeLessThanOrEqual(LOCAL_WARP_MAX_PX);
    }
  );

  it('rejects a locally displaced articulated feature', async () => {
    const source = await rendered();
    const score = await localWarp(
      source,
      await rendered({ shiftedFeatureX: 8, shiftedFeatureY: -6 })
    );

    expect(Math.hypot(score.globalDx, score.globalDy)).toBeLessThan(2);
    expect(score.localWarpMax).toBeGreaterThan(LOCAL_WARP_MAX_PX);
    expect(score.worstTile).toMatchObject({ confident: true, boundaryPeak: false });
    expect(score.worstTile.falloff).toBeLessThan(0.99);
  });

  it.each([12, 20])(
    'rejects a %ipx night-palette displacement at or beyond the search boundary',
    async (shiftedFeatureX) => {
      const score = await localWarp(
        await rendered(),
        await rendered({
          shiftedFeatureX,
          background: '#182450',
          stroke: '#ffffff',
        })
      );

      expect(score.localWarpMax).toBeGreaterThanOrEqual(12);
      expect(score.worstTile).toMatchObject({
        confident: true,
        boundaryPeak: true,
        clamped: true,
      });
    }
  );
});

describe('catalog calibration', () => {
  async function scorePage(page, theme = 'light') {
    const [category, name] = page.split('/');
    const penPath = join(COLORING_DIR, category, `${name}.outline.webp`);
    const pen = await readFile(penPath);
    const source = theme === 'night' ? (await resolveNightLineArt(penPath, pen)).source : pen;
    return localWarp(
      source,
      await readFile(join(FILL_SRC_DIR, category, `${name}.${theme}.raw.webp`))
    );
  }

  it('rejects the excavator aperture ridge while historical big-nudge controls stay clean', async () => {
    const [pig, excavatorLight, excavatorNight, stegosaurus] = await Promise.all([
      scorePage('farm/pig-wide'),
      scorePage('vehicles/excavator-wide'),
      scorePage('vehicles/excavator-wide', 'night'),
      scorePage('dinosaur/stegosaurus-wide'),
    ]);

    expect(pig.localWarpMax).toBeLessThan(LOCAL_WARP_MAX_PX);
    expect(stegosaurus.localWarpMax).toBeLessThan(LOCAL_WARP_MAX_PX);
    expect(excavatorLight.localWarpMax).toBeLessThan(LOCAL_WARP_MAX_PX);
    expect(excavatorNight.localWarpMax).toBeLessThan(LOCAL_WARP_MAX_PX);
    expect(Math.hypot(excavatorLight.globalDx, excavatorLight.globalDy)).toBeLessThan(3);
    expect(excavatorLight.tiles).toContainEqual(
      expect.objectContaining({
        centerX: 384,
        centerY: 384,
        dx: -5,
        dy: 11,
        boundaryPeak: true,
        confident: false,
      })
    );
    expect(excavatorNight.tiles).toContainEqual(
      expect.objectContaining({
        centerX: 384,
        centerY: 384,
        confident: false,
      })
    );
  });

  it(
    'bounds every reviewed baseline exception while new pages keep the strict default',
    async () => {
      const exceptions = [
        ['farm/horse-tall', 'night'],
        ['farm/horse-wide', 'night'],
        ['space/astronaut-wide', 'light'],
        ['space/ship-wide', 'night'],
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
      }

      expect(pageLevers('vehicles/new-page-wide', 'light')).toBeNull();
      expect(LOCAL_WARP_MAX_PX).toBe(4);
    },
    REAL_IMAGE_CALIBRATION_TIMEOUT_MS
  );

  it('keeps other registry flags when an explicit CLI ceiling is provided', () => {
    const levers = {
      flags: {
        'warp-max': 6.9,
        notes: 'preserve the reviewed eye treatment',
      },
    };
    expect(mergeFlags({ 'warp-max': '3' }, levers)).toEqual({
      merged: {
        'warp-max': '3',
        notes: 'preserve the reviewed eye treatment',
      },
      fromRegistry: ['notes'],
    });
  });

  it('makes the golden warp verdict use the reviewed page ceiling', async () => {
    const page = 'farm/horse-wide';
    const penPath = join(COLORING_DIR, `${page}.outline.webp`);
    const [pen, nightRaw] = await Promise.all([
      readFile(penPath),
      readFile(join(FILL_SRC_DIR, `${page}.night.raw.webp`)),
    ]);
    const { chalk } = await resolveNightLineArt(penPath, pen);

    const entry = await scoreGoldenPage({ page, pen, nightRaw, chalk });

    expect(entry.night.localWarpMax).toBeGreaterThan(LOCAL_WARP_MAX_PX);
    expect(entry.night.warpOk).toBe(true);
  });
});
