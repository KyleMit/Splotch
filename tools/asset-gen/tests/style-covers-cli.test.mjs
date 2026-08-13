import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

const state = vi.hoisted(() => ({
  root: null,
  stylesDir: null,
  styleSourceSvg: null,
  render: null,
}));

vi.mock('../lib/asset-paths.mjs', () => ({
  get STYLES_DIR() {
    return state.stylesDir;
  },
  get STYLE_SOURCE_SVG() {
    return state.styleSourceSvg;
  },
}));
vi.mock('../lib/gemini.mjs', () => ({
  makeClient: () => ({}),
  generateImage: async () => ({ bytes: await state.render(), mimeType: 'image/png' }),
}));

const { run, CoverFailuresError } = await import('../style-covers/gen-style-covers.mjs');

const SIZE = 400;
const FIELD = { r: 255, g: 0, b: 255 };

// Subject sides chosen so the KEYED share lands either side of the band. The
// punch grows its mask by a rim bleed before measuring, which trims 2px off
// each edge of the subject, so the keyed share is 1 - ((side - 4) / SIZE)^2:
// 398 -> 3%, 200 -> 76%, 60 -> 98%. Sized at 400 so that rim is a rounding
// error rather than the thing under test.
const SIDE_BELOW_BAND = 398;
const SIDE_IN_BAND = 200;
const SIDE_ABOVE_BAND = 60;

// A magenta chroma field with a centered white subject square.
async function fieldWithSubject(side) {
  const lo = Math.round((SIZE - side) / 2);
  const hi = lo + side;
  const raw = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 3;
      const inSubject = x >= lo && x < hi && y >= lo && y < hi;
      raw[i] = inSubject ? 250 : FIELD.r;
      raw[i + 1] = inSubject ? 250 : FIELD.g;
      raw[i + 2] = inSubject ? 250 : FIELD.b;
    }
  }
  return sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png()
    .toBuffer();
}

const covers = () => readdir(state.stylesDir);

beforeEach(async () => {
  state.root = await mkdtemp(join(tmpdir(), 'style-covers-'));
  state.stylesDir = join(state.root, 'styles');
  state.styleSourceSvg = join(state.root, 'source.svg');
  await mkdir(state.stylesDir);
  await writeFile(
    state.styleSourceSvg,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#8CC864"/></svg>'
  );
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(state.root, { recursive: true, force: true });
});

describe('gen-style-covers cutout guard', () => {
  it('writes a cover whose key lands inside the band', async () => {
    state.render = () => fieldWithSubject(SIDE_IN_BAND);

    await expect(run(['--style', 'Sticker', '--theme', 'light'])).resolves.toBeTruthy();

    expect(await covers()).toContain('sticker.light.webp');
  });

  it('rejects a key below the band without writing', async () => {
    // Almost no field to cut: the model ignored the flat backdrop.
    state.render = () => fieldWithSubject(SIDE_BELOW_BAND);

    await expect(run(['--style', 'Sticker', '--theme', 'light'])).rejects.toThrow(
      CoverFailuresError
    );

    expect(await covers()).not.toContain('sticker.light.webp');
  });

  it('rejects a key above the band without writing', async () => {
    // Nearly the whole frame keyed away — nothing left but a ghost.
    state.render = () => fieldWithSubject(SIDE_ABOVE_BAND);

    await expect(run(['--style', 'Sticker', '--theme', 'light'])).rejects.toThrow(
      CoverFailuresError
    );

    expect(await covers()).not.toContain('sticker.light.webp');
  });

  it('leaves a non-cutout style unkeyed, so its opaque field is no failure', async () => {
    // The same all-but-flat render that fails Sticker is fine for Cartoon.
    state.render = () => fieldWithSubject(SIDE_ABOVE_BAND);

    await expect(run(['--style', 'Cartoon', '--theme', 'light'])).resolves.toBeTruthy();

    expect(await covers()).toContain('cartoon.light.webp');
  });
});
