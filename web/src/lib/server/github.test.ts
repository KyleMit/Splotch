// @vitest-environment node
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

// github.ts reads GITHUB_ISSUE_TOKEN/REPO from $env/dynamic/private at call time;
// escapeIssueMarkdown touches no env, but the module still imports it.
const envState = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: envState }));

import { createIssue, escapeIssueMarkdown } from './github';

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

describe('createIssue', () => {
  const input = { title: 'Bug', body: 'It broke', labels: ['bug'] };

  beforeEach(() => {
    envState.GITHUB_ISSUE_TOKEN = 'test-token';
    delete envState.GITHUB_ISSUE_REPO;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the issue with the full header/body contract and returns url + number', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      json: async () => ({ html_url: 'https://github.com/KyleMit/Splotch/issues/42', number: 42 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await createIssue(input);

    expect(result).toEqual({ url: 'https://github.com/KyleMit/Splotch/issues/42', number: 42 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/KyleMit/Splotch/issues');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer test-token',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'splotch-feedback',
    });
    expect(init.body).toBe(JSON.stringify(input));
  });

  it('rejects with the truncated response body when GitHub returns a non-201 status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 422, text: async () => 'some error body' })
    );

    await expect(createIssue(input)).rejects.toThrow(
      'GitHub issue creation failed (422): some error body'
    );
  });

  it('truncates a long error body to 300 characters', async () => {
    const longBody = 'x'.repeat(400);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 500, text: async () => longBody }));

    await expect(createIssue(input)).rejects.toThrow(
      new Error(`GitHub issue creation failed (500): ${'x'.repeat(300)}`)
    );
  });

  it('falls back to an empty detail when the error response body cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ status: 500, text: async () => Promise.reject(new Error('boom')) })
    );

    await expect(createIssue(input)).rejects.toThrow('GitHub issue creation failed (500): ');
  });

  it('rejects when a 201 response is missing html_url/number', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 201, json: async () => ({}) }));

    await expect(createIssue(input)).rejects.toThrow(
      'GitHub issue creation returned an unexpected payload'
    );
  });

  it('rejects without calling fetch when no token is configured', async () => {
    envState.GITHUB_ISSUE_TOKEN = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(createIssue(input)).rejects.toThrow('GITHUB_ISSUE_TOKEN is not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
