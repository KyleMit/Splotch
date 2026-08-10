// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// tsconfig.json restates the include list SvelteKit generates into
// .svelte-kit/tsconfig.json so it can add the web-root tests; this fails when the
// generated list gains an entry the restatement lacks. That the root-test globs
// themselves survive in tsconfig.json and vitest.config.ts is guarded from outside
// both, by tools/tests/web-root-unit-tests.test.mjs.
const includeOf = (path: string): string[] => {
  const withoutLineComments = readFileSync(new URL(path, import.meta.url), 'utf8').replace(
    /^\s*\/\/.*$/gm,
    ''
  );
  return JSON.parse(withoutLineComments).include;
};

const rebasedFromSvelteKitDir = (entry: string) =>
  entry.startsWith('../')
    ? `./${entry.slice('../'.length)}`
    : `./.svelte-kit/${entry.replace(/^\.\//, '')}`;

describe('web/tsconfig.json include', () => {
  it('restates every glob SvelteKit generates', () => {
    expect(includeOf('./tsconfig.json')).toEqual(
      expect.arrayContaining(includeOf('./.svelte-kit/tsconfig.json').map(rebasedFromSvelteKitDir))
    );
  });
});
