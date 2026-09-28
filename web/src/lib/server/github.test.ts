// @vitest-environment node
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

// github.ts reads GITHUB_ISSUE_TOKEN/REPO from $env/dynamic/private at call time;
// escapeIssueMarkdown touches no env, but the module still imports it.
const envState = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: envState }));

import { GITHUB_REQUEST_TIMEOUT_MS } from '$lib/ai/limits';
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

  // Were the text's own backslash left alone, it would pair with the added one
  // into an escaped backslash and re-arm the character after it.
  it.each([
    ['an image embed', '\\![x](http://evil/p.png)', '\\\\\\![x](http://evil/p.png)'],
    ['a mention', '\\@octocat', '\\\\\\@octocat'],
    ['a back-reference', '\\#1', '\\\\\\#1'],
    ['a raw tag', '\\<img src=x>', '\\\\\\<img src=x>'],
  ])('keeps %s inert behind a backslash the text already carries', (_, text, escaped) => {
    expect(escapeIssueMarkdown(text)).toBe(escaped);
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
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('POSTs the issue with the full header/body contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
    });
    vi.stubGlobal('fetch', fetchMock);

    await createIssue(input);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/KyleMit/splotch-feedback/issues');
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

  // A stalled GitHub must fail as the caller's own error path, which deletes
  // stored AI-report evidence, before the platform kills the function and skips
  // that cleanup.
  it('gives up on a GitHub call that never answers at its own deadline', async () => {
    vi.useFakeTimers();
    // AbortSignal.timeout runs on Node's internal timers, which fake timers
    // cannot advance, so this stand-in keeps its behaviour on the faked clock.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), ms);
      return controller.signal;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          })
      )
    );

    let settled = false;
    const outcome = createIssue(input)
      .catch((reason: unknown) => reason)
      .finally(() => {
        settled = true;
      });

    await vi.advanceTimersByTimeAsync(GITHUB_REQUEST_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(await outcome).toMatchObject({ name: 'TimeoutError' });
  });

  it('rejects without calling fetch when no token is configured', async () => {
    envState.GITHUB_ISSUE_TOKEN = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(createIssue(input)).rejects.toThrow('GITHUB_ISSUE_TOKEN is not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
