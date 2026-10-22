import { describe, expect, it } from 'vitest';
import { AI_IMAGE_BASENAME, DRAWING_BASENAME } from '../../src/lib/saveNaming.ts';
import {
  AI_IMAGE_BASENAME as NATIVE_AI_IMAGE_BASENAME,
  DRAWING_BASENAME as NATIVE_DRAWING_BASENAME,
  DRAWING_PICTURE,
  pictureFilename,
} from '../../src/export/pictureFilename.ts';

describe('native picture file names', () => {
  it('keeps the shipping base names and saves a drawing as PNG', () => {
    expect(NATIVE_DRAWING_BASENAME).toBe(DRAWING_BASENAME);
    expect(NATIVE_AI_IMAGE_BASENAME).toBe(AI_IMAGE_BASENAME);
    expect(DRAWING_PICTURE).toEqual({ baseName: DRAWING_BASENAME, mime: 'image/png' });
  });
});

it.each([
  [new Date(2026, 0, 2, 3, 4, 5), 'splotch-2026-01-02_03-04-05.png'],
  [new Date(2026, 9, 19, 23, 59, 59), 'splotch-2026-10-19_23-59-59.png'],
  [new Date(1999, 11, 31, 0, 0, 0), 'splotch-1999-12-31_00-00-00.png'],
])('stamps a drawing saved at %s in sortable local time', (moment, expected) => {
  expect(pictureFilename(moment)).toBe(expected);
});

it.each([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
])('gives a %s picture its file extension', (mime, extension) => {
  const moment = new Date(2026, 0, 2, 3, 4, 5);
  for (const baseName of [DRAWING_BASENAME, AI_IMAGE_BASENAME]) {
    expect(pictureFilename(moment, { baseName, mime })).toBe(
      `${baseName}-2026-01-02_03-04-05.${extension}`
    );
  }
});
