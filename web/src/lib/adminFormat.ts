import type { Usage } from './components/admin/AdminConsole.svelte';

// Netlify Blobs status is unknown until the first real read proves otherwise —
// assume persistent so the "Blobs unavailable" banner doesn't flash on load.
export const ASSUME_PERSISTENT = true;

const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const TIME_AGO_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

// Compact "3 days ago" label for a last-used timestamp, falling back to a
// plain date if the value won't parse.
export function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secondsAgo = Math.round((Date.now() - then) / 1000);
  for (const [unit, secs] of TIME_AGO_UNITS) {
    if (Math.abs(secondsAgo) >= secs) {
      return RELATIVE_TIME.format(-Math.round(secondsAgo / secs), unit);
    }
  }
  return RELATIVE_TIME.format(-secondsAgo, 'second');
}

// Detail shown on hover/long-press, for auditing a token that looks busy.
export function usageDetail(usage: Usage) {
  const parts = [`First used ${new Date(usage.firstUsed).toLocaleString()}`];
  if (usage.lastStyle) parts.push(`Last style: ${usage.lastStyle}`);
  if (usage.lastPrompt) parts.push(`Last prompt: ${usage.lastPrompt}`);
  return parts.join('\n');
}
