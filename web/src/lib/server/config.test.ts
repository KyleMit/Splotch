// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// config.ts reads $env/dynamic/private at call time, same seam as github.test.ts.
const envState = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env: envState }));

import { config, DEFAULT_GITHUB_ISSUE_REPO } from './config';

describe('githubIssueRepo', () => {
  it('falls back to DEFAULT_GITHUB_ISSUE_REPO when the env var is unset or blank', () => {
    delete envState.GITHUB_ISSUE_REPO;
    expect(config.githubIssueRepo()).toBe(DEFAULT_GITHUB_ISSUE_REPO);

    envState.GITHUB_ISSUE_REPO = '   ';
    expect(config.githubIssueRepo()).toBe(DEFAULT_GITHUB_ISSUE_REPO);
  });

  it('honours a configured override', () => {
    envState.GITHUB_ISSUE_REPO = 'someone/elsewhere';
    expect(config.githubIssueRepo()).toBe('someone/elsewhere');
  });
});

// .env.example's one-time PAT setup tells the operator which repo to scope the
// token to, and its sample/default lines name the repo again — all prose that
// can't import DEFAULT_GITHUB_ISSUE_REPO. A repo mismatch there produces no
// error anywhere: a token scoped from the stale instruction just keeps filing
// user reports in the wrong (public) tracker. This reads the file and fails on
// divergence, the app.html.test.ts pattern for sites that can't share code.
describe('.env.example names DEFAULT_GITHUB_ISSUE_REPO', () => {
  // The path stays a parameter: Vite rewrites a `new URL('./literal',
  // import.meta.url)` into the served asset's http URL, which readFileSync
  // rejects (precedent: app.html.test.ts).
  function sourceFile(path: string): string {
    return readFileSync(new URL(path, import.meta.url), 'utf8');
  }

  const envExample = sourceFile('../../../.env.example');

  function envExampleLiteral(pattern: RegExp): string {
    const match = envExample.match(pattern);
    expect(match, `.env.example matches ${pattern}`).not.toBeNull();
    return match![1];
  }

  it('in the PAT scoping instruction', () => {
    expect(envExampleLiteral(/Only select repositories → (\S+)/)).toBe(DEFAULT_GITHUB_ISSUE_REPO);
  });

  it('in the documented default', () => {
    expect(envExampleLiteral(/GITHUB_ISSUE_REPO overrides .* \(default: (\S+)\)\./)).toBe(
      DEFAULT_GITHUB_ISSUE_REPO
    );
  });

  it('in the sample assignment', () => {
    expect(envExampleLiteral(/^# GITHUB_ISSUE_REPO=(\S+)$/m)).toBe(DEFAULT_GITHUB_ISSUE_REPO);
  });
});
