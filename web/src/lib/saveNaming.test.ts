// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extensionForImageType, timestamp } from './saveNaming';

describe('timestamp', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats local time as sortable YYYY-MM-DD_HH-MM-SS with zero-padded fields', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 4, 5, 6, 7));
    expect(timestamp()).toBe('2026-03-04_05-06-07');
  });
});

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
