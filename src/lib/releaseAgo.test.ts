import { afterEach, expect, it, vi } from 'vitest';
import { formatReleaseAgo } from './releaseAgo';

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['2026-09-30', 'today'],
  ['2026-09-29', 'yesterday'],
  ['2026-09-17', '13 days ago'],
  ['2026-09-16', '2 weeks ago'],
  ['2026-07-30', '8 weeks ago'],
  ['2026-07-29', '2 months ago'],
  ['2025-10-01', '11 months ago'],
  ['2025-09-30', 'last year'],
  ['2024-09-30', '2 years ago'],
])('formats %s across the relative unit boundaries', (date, expected) => {
  expect(formatReleaseAgo(date, new Date(2026, 8, 30, 23, 59, 59))).toBe(expected);
});

it('uses calendar days rather than the time elapsed since midnight', () => {
  expect(formatReleaseAgo('2026-09-29', new Date(2026, 8, 30))).toBe('yesterday');
});

it.each([
  ['2026-03-08', new Date(2026, 2, 9)],
  ['2026-11-01', new Date(2026, 10, 2)],
])('counts calendar days across the DST boundary after %s', (date, now) => {
  expect(formatReleaseAgo(date, now)).toBe('yesterday');
});

it('matches the English relative-time owner over calendar and unit boundaries', () => {
  const oracle = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const now = new Date(2026, 8, 30, 23, 59, 59);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dayMs = 24 * 60 * 60 * 1000;
  for (let days = -1400; days <= 4000; days++) {
    const date = new Date(today - days * dayMs);
    const iso = date.toISOString().slice(0, 10);
    const weeks = Math.floor(days / 7);
    const months =
      (now.getFullYear() - date.getUTCFullYear()) * 12 +
      now.getMonth() -
      date.getUTCMonth() -
      Number(now.getDate() < date.getUTCDate());
    const expected =
      days < 14
        ? oracle.format(-days, 'day')
        : weeks < 9
          ? oracle.format(-weeks, 'week')
          : months < 12
            ? oracle.format(-months, 'month')
            : oracle.format(-Math.floor(months / 12), 'year');
    expect(formatReleaseAgo(iso, now), iso).toBe(expected);
  }
});

it('loads and formats with the native Intl constructor set', async () => {
  vi.stubGlobal('Intl', Object.create(Intl, { RelativeTimeFormat: { value: undefined } }));
  vi.resetModules();
  const module = await import('./releaseAgo');
  expect(module.formatReleaseAgo('2026-09-09', new Date(2026, 8, 30))).toBe('3 weeks ago');
});

it('rejects an invalid release date', () => {
  expect(() => formatReleaseAgo('invalid', new Date())).toThrow(RangeError);
});
