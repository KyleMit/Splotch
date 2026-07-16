import { describe, it, expect, vi } from 'vitest';

// github.ts reads GITHUB_ISSUE_TOKEN/REPO from $env/dynamic/private at call time;
// escapeIssueMarkdown touches no env, but the module still imports it.
vi.mock('$env/dynamic/private', () => ({ env: {} as Record<string, string | undefined> }));

import { escapeIssueMarkdown } from './github';

describe('escapeIssueMarkdown', () => {
  it('defuses user and team mentions so the issue does not notify anyone', () => {
    expect(escapeIssueMarkdown('ping @octocat and @acme/team')).toBe(
      'ping \\@octocat and \\@acme/team'
    );
  });

  it('defuses issue/PR back-references', () => {
    expect(escapeIssueMarkdown('see #1 and #1234')).toBe('see \\#1 and \\#1234');
  });

  it('defuses image embeds but leaves plain links intact', () => {
    expect(escapeIssueMarkdown('![x](http://evil/tracker.png)')).toBe(
      '\\![x](http://evil/tracker.png)'
    );
    expect(escapeIssueMarkdown('[docs](https://example.com)')).toBe('[docs](https://example.com)');
  });

  it('escapes raw HTML tags (no <img>/<a> injection)', () => {
    expect(escapeIssueMarkdown('<img src=x onerror=1>')).toBe('\\<img src=x onerror=1>');
  });

  it('leaves an ordinary email address and prose untouched apart from the escapes', () => {
    // No word char immediately after '@' in a bare '@ ', and '#' not before a
    // digit, stay as-is; the '@' in an email is followed by a letter so it is
    // escaped (harmless — renders literally, still no mention since the local
    // part precedes it, but escaping is the safe default).
    expect(escapeIssueMarkdown('email me at a@b.com about issue # 5')).toBe(
      'email me at a\\@b.com about issue # 5'
    );
  });

  it('is a no-op for clean text', () => {
    expect(escapeIssueMarkdown('Undo does nothing after I clear the page.')).toBe(
      'Undo does nothing after I clear the page.'
    );
  });
});
