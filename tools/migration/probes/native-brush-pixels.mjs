import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_HEADER_BYTES = 33;
const IHDR_LENGTH_OFFSET = 8;
const IHDR_TYPE_OFFSET = 12;
const IHDR_DATA_OFFSET = 16;
const IHDR_DATA_BYTES = 13;
const RGBA_COLOR_TYPE = 6;
const RGBA_BIT_DEPTH = 8;
const RGBA_CHANNELS = 4;

export function readPngHeader(png) {
  assert.ok(Buffer.isBuffer(png) && png.length >= PNG_HEADER_BYTES, 'Missing PNG header');
  assert.ok(png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), 'Invalid PNG signature');
  assert.equal(png.readUInt32BE(IHDR_LENGTH_OFFSET), IHDR_DATA_BYTES);
  assert.equal(png.toString('ascii', IHDR_TYPE_OFFSET, IHDR_DATA_OFFSET), 'IHDR');
  return {
    width: png.readUInt32BE(IHDR_DATA_OFFSET),
    height: png.readUInt32BE(IHDR_DATA_OFFSET + 4),
    bitDepth: png[IHDR_DATA_OFFSET + 8],
    colorType: png[IHDR_DATA_OFFSET + 9],
    compression: png[IHDR_DATA_OFFSET + 10],
    filter: png[IHDR_DATA_OFFSET + 11],
    interlace: png[IHDR_DATA_OFFSET + 12],
  };
}

export async function decodeRgbaPng(png) {
  const ihdr = readPngHeader(png);
  assert.equal(ihdr.bitDepth, RGBA_BIT_DEPTH, 'Expected original RGBA8 PNG');
  assert.equal(ihdr.colorType, RGBA_COLOR_TYPE, 'Expected original RGBA PNG');
  assert.equal(ihdr.compression, 0);
  assert.equal(ihdr.filter, 0);
  const { data, info } = await sharp(png, { ignoreIcc: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, ihdr.width);
  assert.equal(info.height, ihdr.height);
  assert.equal(info.channels, RGBA_CHANNELS);
  return { data, info, ihdr, sha256: createHash('sha256').update(png).digest('hex') };
}

export function assertSamePngPixels(before, after, label) {
  assert.deepEqual(after.ihdr, before.ihdr, `${label}: original PNG format changed`);
  assert.ok(before.data.equals(after.data), `${label}: full original RGBA pixels changed`);
  return { equal: true, pixels: before.ihdr.width * before.ihdr.height };
}
