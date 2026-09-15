import { describe, expect, it, vi } from 'vitest';
import { AI_IMAGE_BASENAME, extensionForImageType } from '$lib/saveNaming';
import { aiResultFileName } from './resultDownload';

describe('aiResultFileName', () => {
  it('names the file after the AI basename, a timestamp, and the type extension', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15, 13, 4, 5));
    try {
      const name = aiResultFileName('image/png');
      expect(name.startsWith(`${AI_IMAGE_BASENAME}-`)).toBe(true);
      expect(name.endsWith(`.${extensionForImageType('image/png')}`)).toBe(true);
      expect(name).toMatch(/2026/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back like every other save when the type is unknown', () => {
    expect(aiResultFileName(null).endsWith(`.${extensionForImageType('')}`)).toBe(true);
  });
});
