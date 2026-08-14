import { describe, expect, it } from 'vitest';
import { IMAGE_SIZES, imageSizeFor, readImageSize } from './imageSize';

// Real encoder output rather than hand-built headers: the whole point of this
// module is that it agrees with what a real encoder writes, and a synthetic
// buffer built from the same reading of the spec as the parser would agree with
// a wrong parser just as happily. Each fixture is a solid-color image produced
// by sharp at the stated dimensions.
const FIXTURES = {
  png: {
    size: { width: 96, height: 64 },
    base64:
      'iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAZUlEQVR42u3QMQ0AAAjAsPk3DQ64OZpUQZvioECQIEGCBAkSJAhBggQJEiRIkCAECRIkSJAgQYJQIEiQIEGCBAkShCBBggQJEiRIEIIECRIkSJAgQQgSJEiQIEGCBAlCkCBBgh5azsnpWtXQFHsAAAAASUVORK5CYII=',
  },
  // The format the client actually uploads when the platform can encode it.
  webpLossy: {
    size: { width: 96, height: 64 },
    base64:
      'UklGRlQAAABXRUJQVlA4IEgAAAAwBACdASpgAEAAPp1Oo02lpCMiIWgAsBOJaQB2AAAWZEiRIkSJEiRIj6AA/u4KZ//FtI6FMh//+0s/+pZ/9Sz/NMSFwwgAAAA=',
  },
  webpLossless: {
    size: { width: 64, height: 96 },
    base64: 'UklGRiIAAABXRUJQVlA4TBUAAAAvP8AXAAcQ/Y/+B4CE8H++FNH/1B8A',
  },
  // An alpha channel promotes WebP to the extended VP8X container, which stores
  // its dimensions somewhere else again.
  webpAlpha: {
    size: { width: 100, height: 100 },
    base64:
      'UklGRpIAAABXRUJQVlA4WAoAAAAQAAAAYwAAYwAAQUxQSBEAAAABB1DAiAgDkBD+75ci+p9KBABWUDggWgAAABAGAJ0BKmQAZAA+bTaZSaQjIqEgqACADYlpbuFz6XAfgAABja6m9xF5YBrqb3EXlgGupvcReWAaeAD+/lF9//+QXLC65Gv//yA/5Af8gP/4+KZGlSp0IAAAAA==',
  },
};

const bytes = (base64: string) => new Uint8Array(Buffer.from(base64, 'base64'));

describe('readImageSize', () => {
  it.each(Object.entries(FIXTURES))('reads a real %s header', (_name, fixture) => {
    expect(readImageSize(bytes(fixture.base64))).toEqual(fixture.size);
  });

  it('returns null for a format it does not parse', () => {
    // A JPEG the client never uploads — it must degrade to "unknown", not to a
    // number read out of the wrong offset.
    const jpeg =
      '/9j/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCABAAGADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAUH/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AnwEZpIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/9k=';
    expect(readImageSize(bytes(jpeg))).toBeNull();
  });

  it('returns null for a buffer too short to hold a header', () => {
    expect(readImageSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(readImageSize(new Uint8Array())).toBeNull();
  });

  it('returns null for a RIFF container that is not WebP', () => {
    const riff = new Uint8Array(32);
    riff.set(
      [...'RIFF'].map((c) => c.charCodeAt(0)),
      0
    );
    riff.set(
      [...'WAVE'].map((c) => c.charCodeAt(0)),
      8
    );
    expect(readImageSize(riff)).toBeNull();
  });
});

describe('imageSizeFor', () => {
  it('maps a canvas shape onto the matching image size', () => {
    expect(imageSizeFor({ width: 1024, height: 1024 })).toBe(IMAGE_SIZES.square);
    expect(imageSizeFor({ width: 1296, height: 864 })).toBe(IMAGE_SIZES.landscape);
    expect(imageSizeFor({ width: 864, height: 1296 })).toBe(IMAGE_SIZES.portrait);
  });

  it('keeps a nearly-square canvas square rather than stretching it', () => {
    expect(imageSizeFor({ width: 1024, height: 960 })).toBe(IMAGE_SIZES.square);
    expect(imageSizeFor({ width: 960, height: 1024 })).toBe(IMAGE_SIZES.square);
  });

  it('renders square when the drawing dimensions could not be read', () => {
    expect(imageSizeFor(null)).toBe(IMAGE_SIZES.square);
  });
});
