// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { SITE_ORIGIN } from './siteUrl';

// The site's own address is also a literal in a template and a build config,
// neither of which can import the constant. Moving the domain without moving
// them would leave /android-beta printing an address that no longer resolves,
// and nothing else would fail.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

it("agrees with app.html's canonical Open Graph URL", () => {
  const canonical = read('../app.html').match(/property="og:url" content="([^"]+)"/);
  expect(canonical?.[1]).toBe(`${SITE_ORIGIN}/`);
});

it("agrees with vite.config.ts's native API base", () => {
  const base = read('../../vite.config.ts').match(/isCapacitor \? '([^']+)'/);
  expect(base?.[1]).toBe(SITE_ORIGIN);
});
