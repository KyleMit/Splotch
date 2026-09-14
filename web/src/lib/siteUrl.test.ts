// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOME_CARD, SHARE_IMAGE_URL } from './components/page/socialCard';
import { FEEDBACK_URL, SITE_ORIGIN } from './siteUrl';

// The site's own address is also what every link-preview card carries, and
// the home page's card mirrors a <title> and description in a template that
// cannot import anything. Moving the domain, or rewording the template,
// without moving the card would leave shared links pointing at the wrong
// place, and nothing else would fail. The rendered card is checked end to end
// by tests/page.spec.ts: the unit runner compiles the native branch, which
// leaves the card out.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const appHtml = read('../app.html');
const attribute = (html: string, pattern: RegExp) => html.match(pattern)?.[1];

it('composes the hosted feedback URL from the canonical site origin', () => {
  expect(FEEDBACK_URL).toBe(`${SITE_ORIGIN}/feedback`);
});

describe('the home page social card', () => {
  it('links to the canonical origin', () => {
    expect(`${SITE_ORIGIN}${HOME_CARD.path}`).toBe(`${SITE_ORIGIN}/`);
    expect(SHARE_IMAGE_URL.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
  });

  it("agrees with app.html's title and description", () => {
    expect(HOME_CARD.title).toBe(attribute(appHtml, /<title>([^<]+)<\/title>/));
    expect(HOME_CARD.description).toBe(attribute(appHtml, /name="description" content="([^"]+)"/));
  });
});

// A card in the template would precede every route's own in the head, and
// scrapers keep the first tag they meet, so the template must stay card-free.
it('leaves app.html without a social card of its own', () => {
  expect(appHtml).not.toMatch(/(?:property|name)="(?:og|twitter):/);
});
