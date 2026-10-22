import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { originalImageGrid, resultImageGrid } from '../../src/ai/imageAdmission.ts';
import { MAX_AI_IMAGE_METADATA_BYTES } from '../../src/ai/imageBounds.ts';
import { pngChunk, pngFromZlib, rgbaPng } from './native-png-fixtures.mjs';

// The drawing a browser captures with canvas.toDataURL() is the AI original, so the AI PNG
// admission has to accept the ancillary chunks each browser's encoder adds (#3111).
const current = () => true;

it('admits the drawing WebKit captures, whose canvas PNG carries an eXIf chunk', async () => {
  // canvas.toDataURL() in WebKit 26.6 on macOS: IHDR, sRGB, eXIf, IDAT, IEND.
  const webkit = readFileSync(new URL('./fixtures/webkit-canvas-rgba.png', import.meta.url));
  expect(webkit.toString('latin1', 50, 54)).toBe('eXIf');
  expect(await originalImageGrid(webkit, current)).toEqual({ width: 40, height: 30 });
  expect(await resultImageGrid(webkit, 'image/png', current)).toEqual({ width: 40, height: 30 });

  const valid = rgbaPng(2, 2, 255);
  const withMetadata = (...chunks) =>
    Buffer.concat([valid.subarray(0, 33), ...chunks, valid.subarray(33)]);
  const exif = pngChunk('eXIf', Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]));
  const idot = pngChunk('iDOT', Buffer.alloc(28));
  expect(await originalImageGrid(withMetadata(exif, idot), current)).toEqual({
    width: 2,
    height: 2,
  });
  for (const rejected of [
    webkit.subarray(0, webkit.length - 13),
    webkit.subarray(0, 82),
    withMetadata(exif, exif),
    withMetadata(pngChunk('eXIf', Buffer.from('Exif'))),
    withMetadata(pngChunk('eXIf', Buffer.from([0x4d, 0x4d, 0]))),
    withMetadata(pngChunk('iDOT', Buffer.alloc(27))),
    withMetadata(pngChunk('eXIf', Buffer.alloc(MAX_AI_IMAGE_METADATA_BYTES + 1))),
    Buffer.concat([valid.subarray(0, valid.length - 12), exif, valid.subarray(-12)]),
  ])
    await expect(originalImageGrid(rejected, current)).rejects.toThrow();
});
it('admits the drawing Firefox captures, whose canvas PNG ends with a private deBG chunk', async () => {
  // canvas.toDataURL() in Firefox 155 after drawing an SVG: IHDR, IDAT, deBG, IEND.
  const firefox = readFileSync(new URL('./fixtures/firefox-canvas-rgba.png', import.meta.url));
  expect(firefox.toString('latin1', 684, 688)).toBe('deBG');
  expect(await originalImageGrid(firefox, current)).toEqual({ width: 40, height: 30 });
  expect(await resultImageGrid(firefox, 'image/png', current)).toEqual({ width: 40, height: 30 });

  const valid = rgbaPng(2, 2, 255);
  const end = valid.subarray(-12);
  const beforeEnd = (...chunks) =>
    Buffer.concat([valid.subarray(0, valid.length - 12), ...chunks, end]);
  const key = pngChunk('deBG', Buffer.from('71746FF6359E4350'));
  expect(await originalImageGrid(beforeEnd(key, pngChunk('prVt')), current)).toEqual({
    width: 2,
    height: 2,
  });
  const split = pngFromZlib(deflateSync(Buffer.alloc(18)), 2, 2, true);
  const firstIdatEnd = 33 + 12 + 1;
  for (const rejected of [
    firefox.subarray(0, firefox.length - 13),
    beforeEnd(key, key),
    beforeEnd(pngChunk('deBG', Buffer.alloc(MAX_AI_IMAGE_METADATA_BYTES + 1))),
    beforeEnd(pngChunk('tEXt', Buffer.from('Comment\0x'))),
    beforeEnd(pngChunk('pHYs', Buffer.alloc(9))),
    beforeEnd(pngChunk('dEBG', Buffer.alloc(4))),
    withPrivateBetweenIdat(split, firstIdatEnd, key),
    beforeEnd(key, pngChunk('IDAT', Buffer.alloc(1))),
  ])
    await expect(originalImageGrid(rejected, current)).rejects.toThrow();
  for (const registered of ['iCCP', 'tRNS', 'acTL', 'zTXt'])
    await expect(
      originalImageGrid(
        Buffer.concat([
          valid.subarray(0, 33),
          pngChunk(registered, Buffer.alloc(8)),
          valid.subarray(33),
        ]),
        current
      )
    ).rejects.toThrow();
});
function withPrivateBetweenIdat(png, offset, chunk) {
  return Buffer.concat([png.subarray(0, offset), chunk, png.subarray(offset)]);
}
