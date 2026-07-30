// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { extensionForImageType } from './saveNaming';

describe('extensionForImageType', () => {
  it.each([
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/jpeg', 'jpg'],
    ['', 'png'],
    ['image/gif', 'png'],
  ])('maps %s to %s', (imageType, extension) => {
    expect(extensionForImageType(imageType)).toBe(extension);
  });
});
