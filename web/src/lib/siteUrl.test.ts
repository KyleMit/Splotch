// @vitest-environment node
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import SocialCard from './components/page/SocialCard.svelte';
import { FEEDBACK_URL, SITE_ORIGIN } from './siteUrl';

// The site's own address is also what the home page's link-preview card
// carries, and that card mirrors a <title> and description in a template that
// cannot import anything. Moving the domain, or rewording the template, without
// moving the card would leave shared links pointing at the wrong place, and
// nothing else would fail.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const appHtml = read('../app.html');
const attribute = (html: string, pattern: RegExp) => html.match(pattern)?.[1];

it('composes the hosted feedback URL from the canonical site origin', () => {
  expect(FEEDBACK_URL).toBe(`${SITE_ORIGIN}/feedback`);
});

describe('the home page social card', () => {
  const { head } = render(SocialCard);

  it('links to the canonical origin', () => {
    expect(attribute(head, /property="og:url" content="([^"]+)"/)).toBe(`${SITE_ORIGIN}/`);
  });

  it("agrees with app.html's title and description", () => {
    expect(attribute(head, /property="og:title" content="([^"]+)"/)).toBe(
      attribute(appHtml, /<title>([^<]+)<\/title>/)
    );
    expect(attribute(head, /property="og:description" content="([^"]+)"/)).toBe(
      attribute(appHtml, /name="description" content="([^"]+)"/)
    );
  });
});

// A card in the template would precede every route's own in the head, and
// scrapers keep the first tag they meet, so the template must stay card-free.
it('leaves app.html without a social card of its own', () => {
  expect(appHtml).not.toMatch(/(?:property|name)="(?:og|twitter):/);
});
