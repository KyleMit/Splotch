// @vitest-environment node
import { describe, it, expect, expectTypeOf, vi, afterEach } from 'vitest';
import { timeAgo, usageDetail } from './adminFormat';
import type { Usage } from './components/admin/AdminConsole.svelte';
import type { TokenUsage } from './server/usage';

const NOW = new Date('2026-03-15T12:00:00Z').getTime();
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

afterEach(() => {
  vi.useRealTimers();
});

function atNow() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}

describe('timeAgo', () => {
  it('returns an empty string for an unparseable timestamp', () => {
    expect(timeAgo('not a date')).toBe('');
  });

  it('falls back to seconds for a just-used token', () => {
    atNow();
    expect(timeAgo(ago(5))).toBe('5 seconds ago');
  });

  it('picks the largest unit that fits', () => {
    atNow();
    expect(timeAgo(ago(70))).toBe('1 minute ago');
    expect(timeAgo(ago(7_200))).toBe('2 hours ago');
    expect(timeAgo(ago(3 * 86_400))).toBe('3 days ago');
    expect(timeAgo(ago(2 * 604_800))).toBe('2 weeks ago');
    expect(timeAgo(ago(2 * 2_592_000))).toBe('2 months ago');
    expect(timeAgo(ago(3 * 31_536_000))).toBe('3 years ago');
  });
});

describe('Usage / TokenUsage drift guard', () => {
  it('keeps the client Usage mirror equal to the server TokenUsage shape', () => {
    expectTypeOf<Usage>().toEqualTypeOf<TokenUsage>();
  });
});

describe('usageDetail', () => {
  const usage = {
    count: 4,
    firstUsed: '2026-03-01T09:30:00Z',
    lastUsed: '2026-03-14T09:30:00Z',
    deleteAfter: '2026-03-31T09:30:00Z',
    lastStyle: 'Watercolor' as const,
    lastOutcome: 'succeeded' as const,
  } satisfies Usage;

  it('lists the minimized style, outcome, and expiry fields', () => {
    expect(usageDetail(usage)).toBe(
      [
        `First used ${new Date(usage.firstUsed).toLocaleString()}`,
        'Last style: Watercolor',
        'Last outcome: succeeded',
        `Record expires ${new Date(usage.deleteAfter).toLocaleString()}`,
      ].join('\n')
    );
  });

  it('omits a missing style', () => {
    expect(usageDetail({ ...usage, lastStyle: null }).split('\n')).toEqual([
      `First used ${new Date(usage.firstUsed).toLocaleString()}`,
      'Last outcome: succeeded',
      `Record expires ${new Date(usage.deleteAfter).toLocaleString()}`,
    ]);
  });
});
