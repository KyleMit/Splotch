import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_IMAGE_BASENAME, DRAWING_BASENAME } from '../../web/src/lib/saveNaming.ts';
import { extensionForImageType, timestamp } from '../../web/src/lib/savedFile.ts';
import {
  AI_IMAGE_BASENAME as NATIVE_AI_IMAGE_BASENAME,
  DRAWING_BASENAME as NATIVE_DRAWING_BASENAME,
  DRAWING_PICTURE,
  pictureFilename,
} from '../../experiments/native-architecture/src/export/pictureFilename.ts';

// Every format a native save writes: the drawing's PNG and the formats an AI picture arrives in.
const PICTURE_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
// Single-digit and end-of-range fields, so the zero padding and the month offset both show.
const MOMENTS = [
  new Date(2026, 0, 2, 3, 4, 5),
  new Date(2026, 9, 19, 23, 59, 59),
  new Date(1999, 11, 31, 0, 0, 0),
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// What savedFile.ts and saveNaming.ts name a save of this format made now.
const shippingName = (baseName, mime) =>
  `${baseName}-${timestamp()}.${extensionForImageType(mime)}`;

describe('native picture file names against saveNaming.ts and savedFile.ts', () => {
  it('keeps the shipping base names and saves a drawing as PNG', () => {
    expect(NATIVE_DRAWING_BASENAME).toBe(DRAWING_BASENAME);
    expect(NATIVE_AI_IMAGE_BASENAME).toBe(AI_IMAGE_BASENAME);
    expect(DRAWING_PICTURE).toEqual({ baseName: DRAWING_BASENAME, mime: 'image/png' });
  });

  it.each(MOMENTS)('stamps a drawing saved at %s as shipping does', (moment) => {
    vi.setSystemTime(moment);
    expect(pictureFilename(moment)).toBe(shippingName(DRAWING_BASENAME, 'image/png'));
  });

  it.each(PICTURE_MIMES)('gives a %s picture the shipping extension', (mime) => {
    vi.setSystemTime(MOMENTS[0]);
    for (const baseName of [DRAWING_BASENAME, AI_IMAGE_BASENAME])
      expect(pictureFilename(MOMENTS[0], { baseName, mime })).toBe(shippingName(baseName, mime));
  });
});
