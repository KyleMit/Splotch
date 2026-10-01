import { expect, it } from 'vitest';
import { formatReleaseAgo } from './releaseAgo';

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
