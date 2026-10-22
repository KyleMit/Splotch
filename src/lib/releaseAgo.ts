const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;
const DAY_CUTOFF = 14;
const WEEK_CUTOFF = 9;
const MONTHS_PER_YEAR = 12;
const quantityFormat = new Intl.NumberFormat('en');
type ReleaseAgoUnit = 'day' | 'week' | 'month' | 'year';
const RELATIVE_LABELS: Record<ReleaseAgoUnit, { past: string; current: string; future: string }> = {
  day: { past: 'yesterday', current: 'today', future: 'tomorrow' },
  week: { past: 'last week', current: 'this week', future: 'next week' },
  month: { past: 'last month', current: 'this month', future: 'next month' },
  year: { past: 'last year', current: 'this year', future: 'next year' },
};

function relativeRelease(value: number, unit: ReleaseAgoUnit) {
  if (!Number.isFinite(value)) throw new RangeError('Invalid release date');
  if (value === -1) return RELATIVE_LABELS[unit].past;
  if (value === 0) return RELATIVE_LABELS[unit].current;
  if (value === 1) return RELATIVE_LABELS[unit].future;
  const quantity = `${quantityFormat.format(Math.abs(value))} ${unit}s`;
  return value < 0 ? `${quantity} ago` : `in ${quantity}`;
}

export function formatReleaseAgo(isoDate: string, now: Date): string {
  const released = new Date(`${isoDate}T00:00:00Z`);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((today - released.valueOf()) / DAY_MS);
  if (days < DAY_CUTOFF) return relativeRelease(-days, 'day');
  const weeks = Math.floor(days / DAYS_PER_WEEK);
  if (weeks < WEEK_CUTOFF) return relativeRelease(-weeks, 'week');
  const months =
    (now.getFullYear() - released.getUTCFullYear()) * MONTHS_PER_YEAR +
    now.getMonth() -
    released.getUTCMonth() -
    Number(now.getDate() < released.getUTCDate());
  if (months < MONTHS_PER_YEAR) return relativeRelease(-months, 'month');
  return relativeRelease(-Math.floor(months / MONTHS_PER_YEAR), 'year');
}
