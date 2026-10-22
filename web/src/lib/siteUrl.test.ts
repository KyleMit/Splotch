// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { HOME_CARD, SHARE_IMAGE_URL } from './components/page/socialCard';
import { FEEDBACK_URL, SITE_ORIGIN } from './siteUrl';

it('composes the hosted feedback URL from the canonical site origin', () => {
  expect(FEEDBACK_URL).toBe(`${SITE_ORIGIN}/feedback`);
});

describe('the home page social card', () => {
  it('links to the canonical origin', () => {
    expect(`${SITE_ORIGIN}${HOME_CARD.path}`).toBe(`${SITE_ORIGIN}/`);
    expect(SHARE_IMAGE_URL.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
  });
});
