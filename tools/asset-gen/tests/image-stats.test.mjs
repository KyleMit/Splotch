// Direct coverage for the shared quantile/median helper (lib/image-stats.mjs).
// The one behavior this consolidation actually changed was the index
// convention — every scorer now indexes floor(f * (n - 1)) into a sorted
// copy, rather than the mix of >>1 / floor(len*f) each call site used to
// hand-roll — so that's what these tests pin down.
import { readFile, readdir } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { luma, median, quantile } from '../lib/image-stats.mjs';

describe('quantile', () => {
  const vals = [50, 10, 40, 20, 30]; // sorted: 10 20 30 40 50 (n=5, last index 4)

  it('indexes floor(f * (n - 1)) into the sorted values', () => {
    expect(quantile(vals, 0)).toBe(10); // floor(0 * 4) = 0
    expect(quantile(vals, 0.15)).toBe(10); // floor(0.15 * 4) = floor(0.6) = 0
    expect(quantile(vals, 0.5)).toBe(30); // floor(0.5 * 4) = 2
    expect(quantile(vals, 0.9)).toBe(40); // floor(0.9 * 4) = floor(3.6) = 3
    expect(quantile(vals, 1)).toBe(50); // floor(1 * 4) = 4
  });

  it('does not mutate the caller-supplied array', () => {
    const original = [50, 10, 40, 20, 30];
    const copy = [...original];
    quantile(original, 0.5);
    expect(original).toEqual(copy);
  });
});

describe('median', () => {
  it('is the middle value on an odd-length array', () => {
    expect(median([50, 10, 40, 20, 30])).toBe(30);
  });

  it('takes the LOWER of the two middles on an even-length array', () => {
    // sorted: 10 20 30 40 (n=4, last index 3); floor(0.5 * 3) = floor(1.5) = 1 -> 20
    expect(median([40, 10, 30, 20])).toBe(20);
  });

  it('returns undefined for an empty array', () => {
    expect(median([])).toBeUndefined();
  });
});

describe('luma', () => {
  it('preserves the exact Rec.601 arithmetic used by the scoring pipeline', () => {
    expect(luma(255, 0, 0)).toBe(0.299 * 255 + 0.587 * 0 + 0.114 * 0);
    expect(luma(0, 255, 0)).toBe(0.299 * 0 + 0.587 * 255 + 0.114 * 0);
    expect(luma(0, 0, 255)).toBe(0.299 * 0 + 0.587 * 0 + 0.114 * 255);
    expect(luma(17, 129, 250)).toBe(0.299 * 17 + 0.587 * 129 + 0.114 * 250);
  });

  it('keeps Rec.601 coefficient math centralized in the shared helper', async () => {
    const libDir = new URL('../lib/', import.meta.url);
    const files = (await readdir(libDir, { recursive: true })).filter(
      (file) => file.endsWith('.mjs') && file !== 'image-stats.mjs'
    );
    const duplicates = [];
    for (const file of files) {
      const source = await readFile(new URL(file, libDir), 'utf8');
      const executable = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      if (['0.299', '0.587', '0.114'].every((coefficient) => executable.includes(coefficient)))
        duplicates.push(file);
    }
    expect(duplicates).toEqual([]);
  });
});
