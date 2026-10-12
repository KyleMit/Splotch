// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOME_CARD, SHARE_IMAGE_URL } from './components/page/socialCard';
import { FEEDBACK_URL, SITE_ORIGIN } from './siteUrl';

// The site's own address is also what every link-preview card carries, so the
// card's origin is pinned here. The rendered card is checked end to end by
// tests/page.spec.ts: the unit runner compiles the native branch, which leaves
// the card out.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const appHtml = read('../app.html');

it('composes the hosted feedback URL from the canonical site origin', () => {
  expect(FEEDBACK_URL).toBe(`${SITE_ORIGIN}/feedback`);
});

describe('the home page social card', () => {
  it('links to the canonical origin', () => {
    expect(`${SITE_ORIGIN}${HOME_CARD.path}`).toBe(`${SITE_ORIGIN}/`);
    expect(SHARE_IMAGE_URL.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
  });
});

// A title, description, or card in the template would precede every route's
// own in the head; a browser tab shows the first <title> and scrapers keep the
// first tag they meet, so the template carries none of the three. Every route
// sets its own in <svelte:head>, the home route from HOME_CARD.
it('leaves app.html without a title, description, or social card of its own', () => {
  expect(appHtml).not.toMatch(/<title>/);
  expect(appHtml).not.toMatch(/name="description"/);
  expect(appHtml).not.toMatch(/(?:property|name)="(?:og|twitter):/);
});
