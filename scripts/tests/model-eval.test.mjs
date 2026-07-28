import { describe, expect, it } from 'vitest';
import { imageDims } from '../lib/model-eval.mjs';

describe('imageDims', () => {
  it('returns PNG and SOFn JPEG dimensions in width-by-height order', () => {
    const png = Buffer.alloc(24);
    png[0] = 0x89;
    png[1] = 0x50;
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);

    const jpeg = Buffer.alloc(24);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    jpeg[2] = 0xff;
    jpeg[3] = 0xc0;
    jpeg.writeUInt16BE(17, 4);
    jpeg[6] = 8;
    jpeg.writeUInt16BE(480, 7);
    jpeg.writeUInt16BE(640, 9);

    expect(imageDims(png)).toBe('640x480');
    expect(imageDims(jpeg)).toBe('640x480');
  });
});
