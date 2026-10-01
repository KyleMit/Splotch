const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;
const DAY_CUTOFF = 14;
const WEEK_CUTOFF = 9;
const MONTHS_PER_YEAR = 12;
const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function formatReleaseAgo(isoDate: string, now: Date): string {
  const released = new Date(`${isoDate}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.floor((today - released.valueOf()) / DAY_MS);
  if (days < DAY_CUTOFF) return formatter.format(-days, 'day');
  const weeks = Math.floor(days / DAYS_PER_WEEK);
  if (weeks < WEEK_CUTOFF) return formatter.format(-weeks, 'week');
  const months =
    (now.getUTCFullYear() - released.getUTCFullYear()) * MONTHS_PER_YEAR +
    now.getUTCMonth() -
    released.getUTCMonth() -
    Number(now.getUTCDate() < released.getUTCDate());
  if (months < MONTHS_PER_YEAR) return formatter.format(-months, 'month');
  return formatter.format(-Math.floor(months / MONTHS_PER_YEAR), 'year');
}
