import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  assertSamePngPixels,
  decodeRgbaPng,
  readPngHeader,
} from '../migration/probes/native-brush-pixels.mjs';

const WIDTH = 2;
const HEIGHT = 2;
const CHANNELS = 4;
const PIXELS = Buffer.from([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 0, 100, 110, 120, 255]);

function png(data = PIXELS, width = WIDTH, height = HEIGHT) {
  return sharp(data, { raw: { width, height, channels: CHANNELS } })
    .png()
    .toBuffer();
}

function strictScreenshotPattern(name) {
  return new RegExp(
    String.raw`assert\.ok\(\s*snapshot\.equals\(\s*${name}\s*\)\s*,\s*'[^']*'\s*\);`
  );
}

function requireStrictScreenshots(source) {
  for (const name of ['undoScreenshot', 'reopenedScreenshot'])
    assert.match(
      source,
      strictScreenshotPattern(name),
      `${name}: missing strict screenshot assertion`
    );
}

describe('brush production export comparator', () => {
  it('accepts identical original RGBA and records every IHDR field', async () => {
    const original = await png();
    const before = await decodeRgbaPng(original);
    const after = await decodeRgbaPng(original);
    expect(readPngHeader(original)).toEqual({
      width: WIDTH,
      height: HEIGHT,
      bitDepth: 8,
      colorType: 6,
      compression: 0,
      filter: 0,
      interlace: 0,
    });
    expect(before.data).toEqual(PIXELS);
    expect(assertSamePngPixels(before, after, 'same')).toEqual({
      equal: true,
      pixels: WIDTH * HEIGHT,
    });
  });

  it.each([
    ['colored endpoint', 12],
    ['alpha', 15],
    ['hidden RGB under alpha0', 8],
  ])('rejects a single changed %s byte', async (_name, offset) => {
    const changed = Buffer.from(PIXELS);
    changed[offset] += 1;
    const before = await decodeRgbaPng(await png());
    const after = await decodeRgbaPng(await png(changed));
    expect(() => assertSamePngPixels(before, after, 'changed')).toThrow(
      'full original RGBA pixels changed'
    );
  });

  it('rejects a different original grid', async () => {
    const before = await decodeRgbaPng(await png());
    const after = await decodeRgbaPng(await png(PIXELS, 1, 4));
    expect(() => assertSamePngPixels(before, after, 'grid')).toThrow('original PNG format changed');
  });

  it('rejects RGB instead of inserting an alpha channel', async () => {
    const rgb = await sharp(await png())
      .removeAlpha()
      .png()
      .toBuffer();
    await expect(decodeRgbaPng(rgb)).rejects.toThrow('Expected original RGBA PNG');
  });

  it('rejects missing and truncated original PNGs', async () => {
    await expect(decodeRgbaPng(Buffer.alloc(0))).rejects.toThrow('Missing PNG header');
    const original = await png();
    await expect(decodeRgbaPng(original.subarray(0, 33))).rejects.toThrow();
  });

  it('keeps immediate whole-paper gates, raw save bytes and three fresh production exports', () => {
    const source = readFileSync(
      new URL('../migration/probe-native-brushes.mjs', import.meta.url),
      'utf8'
    );
    requireStrictScreenshots(source);
    expect(source).toContain(
      "writeFile(resolve(output, 'saved-original.json'), saved.value, 'utf8')"
    );
    expect(source).toContain("exportPicture('export-before-clear.png')");
    expect(source).toContain("exportPicture('export-after-undo.png')");
    expect(source).toContain("assertSamePngPixels(baselineExport, exportPixels, 'Reopen')");
    expect(source).toContain('report.savedValueRestored = await page.evaluate');
  });

  it.each([
    ['undoScreenshot', 'removed'],
    ['undoScreenshot', 'replaced'],
    ['reopenedScreenshot', 'removed'],
    ['reopenedScreenshot', 'replaced'],
  ])('rejects %s when its strict screenshot assertion is %s', (name, change) => {
    const source = readFileSync(
      new URL('../migration/probe-native-brushes.mjs', import.meta.url),
      'utf8'
    );
    const changed = source.replace(
      strictScreenshotPattern(name),
      change === 'removed' ? '' : 'assert.ok(true);'
    );
    expect(changed).not.toBe(source);
    expect(() => requireStrictScreenshots(changed)).toThrow(
      `${name}: missing strict screenshot assertion`
    );
  });
});
