import { describe, expect, it } from 'vitest';
import { collectPrState, formatPrState } from '../show-pr-state.mjs';

const head = 'a'.repeat(40);
const basePr = {
  number: 42,
  url: 'https://github.com/KyleMit/Splotch/pull/42',
  headRefOid: head,
  baseRefName: 'main',
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  isDraft: false,
  state: 'OPEN',
  reviewDecision: null,
};

function fakeGh({
  moved = false,
  malformedChecks = false,
  missingPageInfo = false,
  checkError,
} = {}) {
  const calls = [];
  let viewCount = 0;
  const run = (args, options) => {
    calls.push({ args, options });
    if (args[0] === 'pr' && args[1] === 'view') {
      viewCount++;
      return JSON.stringify(
        viewCount === 1 ? basePr : { headRefOid: moved ? 'b'.repeat(40) : head }
      );
    }
    if (args[0] === 'pr' && args[1] === 'checks') {
      const stdout = malformedChecks
        ? 'not JSON'
        : JSON.stringify([
            { name: 'Quality', state: 'SUCCESS', bucket: 'pass', workflow: 'Quality' },
          ]);
      return checkError
        ? { status: 1, stdout: '', stderr: checkError }
        : { status: 0, stdout, stderr: '' };
    }
    if (args[0] === 'api' && args[1] === 'graphql') {
      const after = args.find((arg) => arg.startsWith('after='));
      return JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: after
                ? {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    nodes: [
                      {
                        id: 'thread-2',
                        isResolved: true,
                        path: 'b.mjs',
                        line: 2,
                      },
                    ],
                  }
                : {
                    pageInfo: missingPageInfo ? null : { hasNextPage: true, endCursor: 'cursor-1' },
                    nodes: [
                      {
                        id: 'thread-1',
                        isResolved: false,
                        path: 'a.mjs',
                        line: 1,
                      },
                    ],
                  },
            },
          },
        },
      });
    }
    throw new Error(`Unexpected gh call: ${args.join(' ')}`);
  };
  return { run, calls };
}

describe('show-pr-state', () => {
  it('collects every review-thread page and checks the PR head again', () => {
    const gh = fakeGh();
    const state = collectPrState({ number: 42, repository: 'KyleMit/Splotch', run: gh.run });
    expect(state.threads.map((thread) => thread.id)).toEqual(['thread-1', 'thread-2']);
    expect(state.checks).toHaveLength(1);
    expect(Object.keys(state)).toEqual(['repository', 'pr', 'checks', 'threads']);
    const query = gh.calls
      .find(({ args }) => args[1] === 'graphql')
      .args.find((arg) => arg.startsWith('query='));
    expect(query).toContain('nodes{id isResolved path line}}');
    expect(gh.calls.filter(({ args }) => args[0] === 'pr' && args[1] === 'view')).toHaveLength(2);
    expect(gh.calls.find(({ args }) => args[1] === 'checks').options).toEqual({
      allowedExitCodes: [0, 1, 8],
      includeResult: true,
    });
    expect(formatPrState(state)).toContain('1 unresolved');
  });

  it('refuses a snapshot taken across a head change', () => {
    const gh = fakeGh({ moved: true });
    expect(() =>
      collectPrState({ number: 42, repository: 'KyleMit/Splotch', run: gh.run })
    ).toThrow('PR head moved');
  });

  it('does not turn malformed checks into an empty green state', () => {
    const gh = fakeGh({ malformedChecks: true });
    expect(() =>
      collectPrState({ number: 42, repository: 'KyleMit/Splotch', run: gh.run })
    ).toThrow('gh pr checks did not return JSON');
  });

  it('reports zero registered checks while CI is still registering', () => {
    const gh = fakeGh({ checkError: "no checks reported on the 'feature' branch" });
    const state = collectPrState({ number: 42, repository: 'KyleMit/Splotch', run: gh.run });
    expect(state.checks).toEqual([]);
    expect(formatPrState(state)).toContain('Registered checks: 0');
  });

  it('preserves a real gh checks error', () => {
    const gh = fakeGh({ checkError: 'error connecting to api.github.com' });
    expect(() =>
      collectPrState({ number: 42, repository: 'KyleMit/Splotch', run: gh.run })
    ).toThrow('error connecting to api.github.com');
  });

  it('rejects a review response without pagination metadata', () => {
    const gh = fakeGh({ missingPageInfo: true });
    expect(() =>
      collectPrState({ number: 42, repository: 'KyleMit/Splotch', run: gh.run })
    ).toThrow('Review threads response is incomplete');
  });
});
