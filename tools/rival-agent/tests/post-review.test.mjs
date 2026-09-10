import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildMarker,
  buildReviewRequest,
  matchingMarkedReviews,
  parseDiffAnchors,
  parsePostArgs,
  partitionFindings,
  postReview,
  postFromSession,
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

  it('does not mistake hunk content for file headers', () => {
    const patch = `diff --git a/db/schema.sql b/db/schema.sql
index 111..222 100644
--- a/db/schema.sql
+++ b/db/schema.sql
@@ -1,4 +1,4 @@
 create table t (
--- legacy column
+++ replacement column
 );
`;
    const anchors = parseDiffAnchors(patch);
    expect([...anchors.keys()]).toEqual(['db/schema.sql']);
    expect([...anchors.get('db/schema.sql').RIGHT]).toEqual([1, 2, 3]);
    expect([...anchors.get('db/schema.sql').LEFT]).toEqual([1, 2, 3]);
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

  const sensitiveExamples = [
    '12345678-ABCDEF0123456789',
    'R9Z12345678',
    'abcdef0123456789',
    'IOS_UDID=' + 'e'.repeat(40),
    'adb -s SYNTHETIC123 shell',
    '"deviceId": "SYNTHETIC123"',
    'ghp_' + 'x'.repeat(36),
    'sk-proj-' + 'x'.repeat(40),
    'API_KEY=syntheticCredentialValue',
    'Authorization: Bearer syntheticCredentialValue',
    '-----BEGIN PRIVATE KEY-----',
  ];

  it.each(sensitiveExamples)('blocks a sensitive review body before any POST: %s', (value) => {
    const { gh, calls } = fakeGh();
    expect(() => postReview({ ...options, findings: { ...FINDINGS, summary: value }, gh })).toThrow(
      /publication blocked.*body:/
    );
    expect(calls.some(({ args }) => args.includes('POST'))).toBe(false);
  });

  it.each(sensitiveExamples)('blocks a sensitive inline comment before any POST: %s', (value) => {
    const { gh, calls } = fakeGh();
    expect(() =>
      postReview({
        ...options,
        findings: { ...FINDINGS, findings: [finding({ body: value })] },
        gh,
      })
    ).toThrow(/publication blocked.*comments\[0\].body:/);
    expect(calls.some(({ args }) => args.includes('POST'))).toBe(false);
  });

  it.each(['claim', 'command', 'reason'])(
    'scans unverified %s without echoing the value',
    (field) => {
      const value = 'R9Z12345678';
      const { gh } = fakeGh();
      let error;
      try {
        postReview({
          ...options,
          findings: {
            ...FINDINGS,
            unverified: [{ claim: 'claim', command: 'command', reason: 'reason', [field]: value }],
          },
          gh,
        });
      } catch (caught) {
        error = caught;
      }
      expect(error?.message).toContain('publication blocked');
      expect(error?.message).not.toContain(value);
      expect(error?.message).toContain('--sanitized-findings');
    }
  );

  it('blocks off-diff findings and inline paths containing identifiers', () => {
    const value = 'R9Z12345678';
    expect(() =>
      postReview({
        ...options,
        findings: { ...FINDINGS, findings: [finding({ line: 99, body: value })] },
        gh: fakeGh().gh,
      })
    ).toThrow(/body:/);
    expect(() =>
      postReview({
        ...options,
        patch: PATCH.replaceAll('src/one.ts', `src/${value}.ts`),
        findings: { ...FINDINGS, findings: [finding({ path: `src/${value}.ts` })] },
        gh: fakeGh().gh,
      })
    ).toThrow(/comments\[0\].path:/);
  });

  it('publishes clean findings byte-for-byte, including commit references and marker UUIDs', () => {
    const { gh, calls } = fakeGh();
    const findings = { ...FINDINGS, summary: `Checked ${BASE} through ${HEAD}.` };
    const id = '12345678-1234-1234-1234-123456789abc';
    postReview({ ...options, findings, id, gh });
    const request = buildReviewRequest({
      ...options,
      findings,
      anchors: parseDiffAnchors(PATCH),
      marker: buildMarker({ ...options, id }),
    });
    expect(JSON.parse(calls.find(({ args }) => args.includes('POST')).input)).toEqual(request);
  });
});

describe('sanitized recovery', () => {
  let session;
  afterEach(() => {
    if (session) rmSync(session, { recursive: true, force: true });
  });

  function setup() {
    session = mkdtempSync(join(tmpdir(), 'safe-review-test-'));
    mkdirSync(join(session, 'packet'));
    writeFileSync(join(session, 'packet/diff.patch'), PATCH);
    writeFileSync(
      join(session, 'session.json'),
      JSON.stringify({
        rival: 'claude',
        round: 1,
        scope: { description: 'pull request 7', base: BASE, head: HEAD },
      })
    );
    const original = { ...FINDINGS, summary: 'Device R9Z12345678' };
    const originalText = JSON.stringify(original);
    writeFileSync(join(session, 'findings.json'), originalText);
    const sanitized = { ...original, summary: 'Device [REDACTED]' };
    const sanitizedFindings = join(session, 'sanitized.json');
    writeFileSync(sanitizedFindings, JSON.stringify(sanitized));
    return { originalText, sanitized, sanitizedFindings };
  }

  it('publishes a marked copy on the original range without altering local findings or anchors', () => {
    const { originalText, sanitizedFindings } = setup();
    const { gh, calls } = fakeGh();
    postFromSession({ number: 7, session, sanitizedFindings, gh });
    const posted = JSON.parse(calls.find(({ args }) => args.includes('POST')).input);
    expect(posted.body).toContain('Sanitized review:');
    expect(posted.body).toContain(`base=${BASE};head=${HEAD};`);
    expect(posted.commit_id).toBe(HEAD);
    expect(JSON.stringify(posted)).not.toContain('R9Z12345678');
    expect(posted.comments).toEqual(
      buildReviewRequest({ findings: FINDINGS, anchors: parseDiffAnchors(PATCH) }).comments
    );
    expect(readFileSync(join(session, 'findings.json'), 'utf8')).toBe(originalText);
  });

  it('rescans a sanitized copy and refuses remaining sensitive values', () => {
    const { sanitized, sanitizedFindings } = setup();
    sanitized.findings = [
      finding({ body: 'ghp_' + 'x'.repeat(36) }),
      ...sanitized.findings.slice(1),
    ];
    writeFileSync(sanitizedFindings, JSON.stringify(sanitized));
    const { gh, calls } = fakeGh();
    expect(() => postFromSession({ number: 7, session, sanitizedFindings, gh })).toThrow(
      /publication blocked/
    );
    expect(calls.some(({ args }) => args.includes('POST'))).toBe(false);
  });

  it.each(['path', 'line', 'side', 'severity'])(
    'refuses changes to %s during sanitization',
    (field) => {
      const { sanitized, sanitizedFindings } = setup();
      sanitized.findings = sanitized.findings.map((item) => ({
        ...item,
        [field]: { path: 'src/other.ts', line: 12, side: 'LEFT', severity: 'nit' }[field],
      }));
      writeFileSync(sanitizedFindings, JSON.stringify(sanitized));
      expect(() =>
        postFromSession({ number: 7, session, sanitizedFindings, gh: fakeGh().gh })
      ).toThrow(/preserve every finding/);
    }
  );

  it('refuses the original findings as a sanitized copy', () => {
    setup();
    expect(() =>
      postFromSession({
        number: 7,
        session,
        sanitizedFindings: join(session, 'findings.json'),
        gh: fakeGh().gh,
      })
    ).toThrow(/separate sanitized/);
  });

  it('parses the explicit sanitized copy option', () => {
    expect(
      parsePostArgs([
        '--pr',
        '7',
        '--session',
        '/tmp/s',
        '--sanitized-findings',
        '/tmp/s/sanitized.json',
      ])
    ).toEqual({ number: 7, session: '/tmp/s', sanitizedFindings: '/tmp/s/sanitized.json' });
  });
});
