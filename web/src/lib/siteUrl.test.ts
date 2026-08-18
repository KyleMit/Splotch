// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { FEEDBACK_URL, SITE_ORIGIN } from './siteUrl';

// The site's own address is also a literal in a template, which cannot import
// the constant. Moving the domain without moving it would leave /beta printing
// an address that no longer resolves, and nothing else would fail.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

it('composes the hosted feedback URL from the canonical site origin', () => {
  expect(FEEDBACK_URL).toBe(`${SITE_ORIGIN}/feedback`);
});

it("agrees with app.html's canonical Open Graph URL", () => {
  const canonical = read('../app.html').match(/property="og:url" content="([^"]+)"/);
  expect(canonical?.[1]).toBe(`${SITE_ORIGIN}/`);
});
