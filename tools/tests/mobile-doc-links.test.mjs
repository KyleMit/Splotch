import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const githubHeadingFragment = (heading) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

describe('mobile documentation links', () => {
  it('keeps both platform checklists linked to the shared native support matrix', () => {
    const nativeGuide = read('docs/MOBILE/native.md');
    const heading = nativeGuide.match(/^## (?<text>\d+\. Native support matrix)$/m)?.groups?.text;

    expect(heading).toBeDefined();

    const target = `native.md#${githubHeadingFragment(heading)}`;
    expect(read('docs/MOBILE/android.md')).toContain(`[native support matrix](${target})`);
    expect(read('docs/MOBILE/ios.md')).toContain(`[native support matrix](${target})`);
  });
});
