// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isPageShareCardPath,
  PAGE_SHARE_CARDS,
  shareImageFor,
  SHARE_CARD_SIZE,
  SHARE_IMAGE_URL,
} from './socialCard';
import hashes from './shareCards.json';

const PNG_WIDTH_OFFSET_BYTES = 16;
const PNG_HEIGHT_OFFSET_BYTES = 20;
const HASH_LENGTH = 8;
const MAX_CARD_BYTES = 300_000;
const SHARE_DIR = new URL('../../../../static/share/', import.meta.url);

describe('page share cards', () => {
  it('owns exactly the four supplied page cards and generated files', () => {
    expect(Object.keys(PAGE_SHARE_CARDS).sort()).toEqual([
      '/beta',
      '/changelog',
      '/feedback',
      '/privacy',
    ]);
    const files = Object.values(PAGE_SHARE_CARDS)
      .map((card) => card.file)
      .sort();
    expect(Object.keys(hashes).sort()).toEqual(files);
    expect(readdirSync(SHARE_DIR).sort()).toEqual(files);
  });

  for (const [path, card] of Object.entries(PAGE_SHARE_CARDS)) {
    it(`${path} returns a versioned image matching its committed PNG`, () => {
      if (!isPageShareCardPath(path)) throw new Error('Invalid card fixture');
      const image = shareImageFor(path);
      const png = readFileSync(new URL(card.file, SHARE_DIR));
      const hash = createHash('sha256').update(png).digest('hex').slice(0, HASH_LENGTH);
      expect(hashes[card.file]).toMatch(/^[a-f0-9]{8}$/);
      expect(image).toEqual({
        url: `https://splotch.art/share/${card.file}?v=${hash}`,
        ...SHARE_CARD_SIZE,
        alt: card.alt,
      });
      expect(png.readUInt32BE(PNG_WIDTH_OFFSET_BYTES)).toBe(SHARE_CARD_SIZE.width);
      expect(png.readUInt32BE(PNG_HEIGHT_OFFSET_BYTES)).toBe(SHARE_CARD_SIZE.height);
      expect(png.length).toBeLessThan(MAX_CARD_BYTES);
    });
  }

  it.each(['/', '/design', '/unknown'] as const)('%s keeps the home image', (path) => {
    expect(shareImageFor(path)).toEqual({
      url: SHARE_IMAGE_URL,
      width: 1920,
      height: 1080,
      alt: 'Splotch, a drawing app for kids',
    });
  });

  it.each([null, undefined, 1, {}, '__proto__', 'constructor', '/privacy/', '/privacy?x=1'])(
    'rejects unknown harness input %j',
    (input) => {
      expect(isPageShareCardPath(input)).toBe(false);
    }
  );
});
