import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const reviewPage = readFileSync(
  new URL('../ideas-exploration/ideas-review.html', import.meta.url),
  'utf8'
);

const PAGE_TITLE = 'Splotch asset-gen — image-quality backlog burn-down';
const STALE_PAGE_NAME = /Splotch asset-gen — IDEAS\.md burn-down/;

describe('ideas exploration review page', () => {
  it('uses the current image-quality backlog name in its visible labels', () => {
    expect(reviewPage).not.toMatch(STALE_PAGE_NAME);
    expect(reviewPage.match(/<title>([^<]+)<\/title>/)?.[1]).toBe(PAGE_TITLE);
    expect(reviewPage.match(/<h1>([^<]+)<\/h1>/)?.[1]).toBe(PAGE_TITLE);
  });
});
