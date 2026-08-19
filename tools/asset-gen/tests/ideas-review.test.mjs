import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareGeneratedReview } from '../ideas-exploration/build-review.mjs';

const reviewBuilderPath = new URL('../ideas-exploration/build-review.mjs', import.meta.url);
const reviewBuilder = readFileSync(reviewBuilderPath, 'utf8');
const reviewPage = readFileSync(
  new URL('../ideas-exploration/ideas-review.html', import.meta.url),
  'utf8'
);

const PAGE_TITLE = 'Splotch asset-gen — image-quality backlog burn-down';
const STALE_PAGE_NAME = /Splotch asset-gen — IDEAS\.md burn-down/;
// The committed-page check performs hundreds of Sharp encodes and shares CI CPU with the suite.
const REVIEW_BUILD_TEST_TIMEOUT_MS = 30_000;

describe('ideas exploration review page', () => {
  it('generates both visible labels from the current shared title', () => {
    expect(reviewBuilder).not.toMatch(STALE_PAGE_NAME);
    expect(reviewBuilder.match(/const PAGE_TITLE = '([^']+)'/)?.[1]).toBe(PAGE_TITLE);
    expect(reviewBuilder).toContain('<title>${PAGE_TITLE}</title>');
    expect(reviewBuilder).toContain('<h1>${PAGE_TITLE}</h1>');
  });

  it('commits the current image-quality backlog name in its visible labels', () => {
    expect(reviewPage).not.toMatch(STALE_PAGE_NAME);
    expect(reviewPage.match(/<title>([^<]+)<\/title>/)?.[1]).toBe(PAGE_TITLE);
    expect(reviewPage.match(/<h1>([^<]+)<\/h1>/)?.[1]).toBe(PAGE_TITLE);
  });

  it(
    'passes the non-mutating drift check for the committed artifact',
    () => {
      const result = spawnSync(process.execPath, [fileURLToPath(reviewBuilderPath), '--check'], {
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('ideas-review.html is current');
      expect(result.stderr).toBe('');
    },
    REVIEW_BUILD_TEST_TIMEOUT_MS
  );

  it('rejects an artifact that differs from the generated page', () => {
    expect(compareGeneratedReview('generated page', 'stale page')).toEqual({
      status: 1,
      message:
        '[ideas-review] ideas-review.html is stale. Run node tools/asset-gen/ideas-exploration/build-review.mjs and commit the result.',
    });
  });

  it('ignores only platform-dependent inline WebP bytes', () => {
    const prefix = '<!-- Inline-image sources: same; transform: same -->';
    const generated = `${prefix}<img src="data:image/webp;base64,AAAA">`;
    const committed = `${prefix}<img src="data:image/webp;base64,BBBB">`;

    expect(compareGeneratedReview(generated, committed).status).toBe(0);
    expect(
      compareGeneratedReview(generated, committed.replace('sources: same', 'sources: drifted'))
        .status
    ).toBe(1);
  });
});
