// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { SHORT_PAGE_HEIGHT_PX } from './breakpoints';

it.each(['../routes/beta/+page.svelte'])('%s uses the short-page height', (path) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const heights = [...source.matchAll(/@media \(max-height: (\d+)px\)/g)].map((match) =>
    Number(match[1])
  );
  expect(heights).toEqual([SHORT_PAGE_HEIGHT_PX]);
});
