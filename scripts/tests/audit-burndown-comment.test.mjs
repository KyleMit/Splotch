// Locks the per-commit PR comment rendering in scripts/audit-burndown/comment.mjs.
// These comments are posted unattended during a burndown, so a regression here
// silently ships malformed history onto the PR (or, via an unescaped #<n>, pings
// unrelated issues/PRs).

import { describe, expect, it } from 'vitest';
import { commitCommentBody, escapeHashRefs, findingProblem } from '../audit-burndown/comment.mjs';

const FINDING = [
  '### [P3][duplication] Extract the shared glaze stamp',
  '',
  '**File(s):** `web/src/lib/drawing/strokeOps.ts:395-413` — pinned at SHA f934d43',
  '',
  '#### Problem',
  '',
  'The stamp is written twice and the two already differ subtly.',
  '',
  '#### Proposed solution',
  '',
  'Extract one helper.',
].join('\n');

describe('findingProblem', () => {
  it('extracts the Problem section, not the File(s) line or the proposed solution', () => {
    const p = findingProblem(FINDING);
    expect(p).toBe('The stamp is written twice and the two already differ subtly.');
  });

  it('falls back to the File(s) line when there is no Problem heading', () => {
    const p = findingProblem('### [P4][naming] Rename thing\n\n**File(s):** `a.ts`\n');
    expect(p).toBe('**File(s):** `a.ts`');
  });

  it('truncates a very long problem', () => {
    const long = ['### [x] t', '', '#### Problem', '', 'x'.repeat(2000)].join('\n');
    const p = findingProblem(long);
    expect(p.length).toBeLessThan(1000);
    expect(p).toContain('…');
  });

  it('balances a code fence left dangling by truncation', () => {
    const codey = [
      '### [x] t',
      '',
      '#### Problem',
      '',
      'Here is the offending code:',
      '',
      '```ts',
      ...Array.from(
        { length: 60 },
        (_, i) => `const line${i} = ${i}; // padding to force truncation`
      ),
      '```',
    ].join('\n');
    const p = findingProblem(codey);
    // truncated mid-block, but the ``` fences must still be balanced (even count)
    expect((p.match(/```/g) ?? []).length % 2).toBe(0);
  });
});

describe('commitCommentBody', () => {
  const base = {
    sha: '863ee85aaa432436081e1f25bf6e062e3c82fed1',
    title: '[P1][complexity] Split initDrawingCanvas',
    problem: 'The function is 125 lines.',
    fix: 'Extracted five named setup helpers.',
  };

  it('renders the sha heading, issue, and fix', () => {
    const body = commitCommentBody(base);
    expect(body).toContain('### `863ee85aaa43` — [P1][complexity] Split initDrawingCanvas');
    expect(body).toContain('**Issue**');
    expect(body).toContain('The function is 125 lines.');
    expect(body).toContain('**Fix**');
    expect(body).toContain('Extracted five named setup helpers.');
  });

  it('marks a clean first-pass approval when there were no catches', () => {
    expect(commitCommentBody(base)).toContain('approved on the first pass');
  });

  it('lists adversarial catches when the reviewer required changes', () => {
    const body = commitCommentBody({
      ...base,
      catches: ['Missed a call site in engine.ts', 'Left a dangling import'],
    });
    expect(body).toContain('reviewer caught the following');
    expect(body).toContain('- Missed a call site in engine.ts');
    expect(body).toContain('- Left a dangling import');
    expect(body).not.toContain('approved on the first pass');
  });

  it('adds the E2E gate line only when specs are present', () => {
    expect(commitCommentBody(base)).not.toContain('E2E gate');
    const gated = commitCommentBody({ ...base, e2eSpecs: ['tests/engine.spec.ts'] });
    expect(gated).toContain('**E2E gate** — `tests/engine.spec.ts`');
  });

  it('escapes bare #<digits> so a finding reference cannot ping an unrelated PR', () => {
    const body = commitCommentBody({ ...base, fix: 'Closes the gap noted in #42.' });
    expect(body).toContain('\\#42');
    expect(body).not.toMatch(/[^\\]#42/);
  });

  it('handles a missing fix summary without throwing', () => {
    const body = commitCommentBody({ ...base, fix: '' });
    expect(body).toContain('_(implementer reported no summary)_');
  });
});

describe('escapeHashRefs', () => {
  it('escapes #<digit> but leaves markdown headings (# followed by space) alone', () => {
    expect(escapeHashRefs('see #7 and #123')).toBe('see \\#7 and \\#123');
    expect(escapeHashRefs('#### Problem')).toBe('#### Problem');
  });
});
