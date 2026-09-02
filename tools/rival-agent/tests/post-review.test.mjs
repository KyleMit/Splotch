import { describe, expect, it } from 'vitest';
import {
  buildMarker,
  buildReviewRequest,
  matchingMarkedReviews,
  parseDiffAnchors,
  parsePostArgs,
  partitionFindings,
  postReview,
  REPOSITORY,
} from '../post-review.mjs';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const PATCH = `diff --git a/src/one.ts b/src/one.ts
index 111..222 100644
--- a/src/one.ts
+++ b/src/one.ts
@@ -10,4 +10,5 @@ context
 keep
-gone
+added one
+added two
 keep too
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+fresh
+file
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-bye
-now
`;

function finding(overrides) {
  return {
    path: 'src/one.ts',
    line: 11,
    startLine: null,
    side: 'RIGHT',
    severity: 'blocking',
    body: 'claim',
    ...overrides,
  };
}

const FINDINGS = {
  summary: 'Checked the range.',
  findings: [
    finding(),
    finding({ line: 12, startLine: 11, severity: 'nit', body: 'span' }),
    finding({ path: 'src/one.ts', line: 11, side: 'LEFT', severity: 'question', body: 'deleted' }),
    finding({ path: 'src/one.ts', line: 99, severity: 'suggestion', body: 'off the diff' }),
    finding({ path: 'src/nowhere.ts', line: 1, body: 'untouched file' }),
  ],
  unverified: [{ claim: 'tests pass', command: 'npm test', reason: 'declined: host-exclusive' }],
};

describe('diff anchors', () => {
  it('records added, deleted, and context lines per side', () => {
    const anchors = parseDiffAnchors(PATCH);
    expect([...anchors.get('src/one.ts').RIGHT]).toEqual([10, 11, 12, 13]);
    expect([...anchors.get('src/one.ts').LEFT]).toEqual([10, 11, 12]);
    expect([...anchors.get('src/new.ts').RIGHT]).toEqual([1, 2]);
    expect(anchors.get('src/new.ts').LEFT.size).toBe(0);
    expect([...anchors.get('src/old.ts').LEFT]).toEqual([1, 2]);
  });

  it('keeps anchored findings and sets the rest aside instead of dropping them', () => {
    const { anchored, unanchored } = partitionFindings(FINDINGS.findings, parseDiffAnchors(PATCH));
    expect(anchored.map((item) => item.body)).toEqual(['claim', 'span', 'deleted']);
    expect(unanchored.map((item) => item.body)).toEqual(['off the diff', 'untouched file']);
  });
});

describe('review request', () => {
  const marker = buildMarker({ rival: 'codex', base: BASE, head: HEAD, id: 'id-1' });
  const request = buildReviewRequest({
    findings: FINDINGS,
    anchors: parseDiffAnchors(PATCH),
    marker,
    rival: 'codex',
    round: 2,
    scope: 'pull request 7',
    head: HEAD,
  });

  it('is one COMMENT review on the reviewed head with severity-tagged anchored comments', () => {
    expect(request).toMatchObject({ commit_id: HEAD, event: 'COMMENT' });
    expect(request.comments).toEqual([
      { path: 'src/one.ts', line: 11, side: 'RIGHT', body: '**blocking:** claim' },
      {
        path: 'src/one.ts',
        line: 12,
        side: 'RIGHT',
        start_line: 11,
        start_side: 'RIGHT',
        body: '**nit:** span',
      },
      { path: 'src/one.ts', line: 11, side: 'LEFT', body: '**question:** deleted' },
    ]);
  });

  it('carries the summary, the findings outside the diff, the unverified list, and the marker', () => {
    expect(request.body).toContain('Checked the range.');
    expect(request.body).toContain('round 2');
    expect(request.body).toContain('`src/one.ts:99` — **suggestion:** off the diff');
    expect(request.body).toContain('`src/nowhere.ts:1`');
    expect(request.body).toContain('tests pass — wanted `npm test`; declined: host-exclusive');
    expect(request.body.trim().endsWith(marker)).toBe(true);
  });

  it('matches an existing marked review by range, head, and state', () => {
    const reviews = [
      { id: 1, body: `x ${marker}`, commit_id: HEAD, state: 'COMMENTED' },
      { id: 2, body: `x ${marker}`, commit_id: 'c'.repeat(40), state: 'COMMENTED' },
      { id: 3, body: `x ${marker}`, commit_id: HEAD, state: 'APPROVED' },
      { id: 4, body: 'human comment', commit_id: HEAD, state: 'COMMENTED' },
    ];
    expect(matchingMarkedReviews(reviews, { base: BASE, head: HEAD }).map((r) => r.id)).toEqual([
      1,
    ]);
  });
});

// Reviews come back as `--paginate --slurp` pages: an array of per-page arrays.
function fakeGh({ head = HEAD, base = BASE, reviews = [], state = 'OPEN', pageSize = 30 } = {}) {
  const calls = [];
  const pages = () => {
    const chunks = [];
    for (let start = 0; start < reviews.length; start += pageSize) {
      chunks.push(reviews.slice(start, start + pageSize));
    }
    return chunks.length > 0 ? chunks : [[]];
  };
  const gh = (args, options) => {
    calls.push({ args, input: options?.input });
    if (args[0] === 'pr') {
      return JSON.stringify({
        number: 7,
        url: `https://github.com/${REPOSITORY}/pull/7`,
        state,
        isCrossRepository: false,
        baseRefName: 'main',
        baseRefOid: base,
        headRefName: 'feature',
        headRefOid: head,
      });
    }
    if (args[1] === '--method') {
      const request = JSON.parse(options.input);
      const created = {
        id: 42,
        html_url: 'https://github.com/x/pull/7#pullrequestreview-42',
        body: request.body,
        commit_id: request.commit_id,
        state: 'COMMENTED',
      };
      reviews.push(created);
      return JSON.stringify(created);
    }
    expect(args).toContain('--slurp');
    return JSON.stringify(pages());
  };
  return { gh, calls, reviews };
}

describe('posting', () => {
  const options = {
    number: 7,
    findings: FINDINGS,
    patch: PATCH,
    rival: 'codex',
    round: 1,
    scope: 'pull request 7',
    base: BASE,
    head: HEAD,
    id: 'id-1',
  };

  it('posts once, verifies the marker landed on the head, and reports the split', () => {
    const { gh, calls } = fakeGh();
    expect(postReview({ ...options, gh })).toEqual({
      state: 'posted',
      reviewId: 42,
      url: 'https://github.com/x/pull/7#pullrequestreview-42',
      comments: 3,
      unanchored: 2,
    });
    const post = calls.find(({ args }) => args[1] === '--method');
    expect(post.args).toContain(`repos/${REPOSITORY}/pulls/7/reviews`);
    expect(JSON.parse(post.input).event).toBe('COMMENT');
  });

  it('adopts an existing marked review for the same range instead of posting twice', () => {
    const marker = buildMarker({ rival: 'claude', base: BASE, head: HEAD, id: 'older' });
    const { gh, calls } = fakeGh({
      reviews: [{ id: 9, html_url: 'u', body: marker, commit_id: HEAD, state: 'COMMENTED' }],
    });
    expect(postReview({ ...options, gh })).toEqual({ state: 'adopted', reviewId: 9, url: 'u' });
    expect(calls.some(({ args }) => args[1] === '--method')).toBe(false);
  });

  it('finds a marked review on a later page of a long review list', () => {
    const marker = buildMarker({ rival: 'claude', base: BASE, head: HEAD, id: 'older' });
    const humans = Array.from({ length: 31 }, (_, index) => ({
      id: index,
      body: `human ${index}`,
      commit_id: HEAD,
      state: 'COMMENTED',
    }));
    const { gh } = fakeGh({
      reviews: [
        ...humans,
        { id: 99, html_url: 'u', body: marker, commit_id: HEAD, state: 'COMMENTED' },
      ],
    });
    expect(postReview({ ...options, gh })).toEqual({ state: 'adopted', reviewId: 99, url: 'u' });
  });

  it('refuses a head or base that moved since the review', () => {
    expect(() => postReview({ ...options, gh: fakeGh({ head: 'c'.repeat(40) }).gh })).toThrow(
      /head is/
    );
    expect(() => postReview({ ...options, gh: fakeGh({ base: 'd'.repeat(40) }).gh })).toThrow(
      /base is/
    );
    expect(() => postReview({ ...options, gh: fakeGh({ state: 'MERGED' }).gh })).toThrow(/MERGED/);
  });

  it('fails loudly when the posted review cannot be read back', () => {
    const { gh } = fakeGh();
    const forgetful = (args, options) =>
      args[0] === 'api' && !options ? '[[]]' : gh(args, options);
    expect(() => postReview({ ...options, gh: forgetful })).toThrow(/exactly one marked COMMENT/);
  });

  it('parses the CLI arguments', () => {
    expect(parsePostArgs(['--pr', '7', '--session', '/tmp/s'])).toEqual({
      number: 7,
      session: '/tmp/s',
    });
    expect(() => parsePostArgs(['--pr', 'seven', '--session', '/tmp/s'])).toThrow(/usage/);
  });
});
