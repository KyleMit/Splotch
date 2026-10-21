import { describe, expect, it } from 'vitest';
import {
  PAGE_TEXT_WITHOUT_JS,
  pageWithoutJsProblems,
} from '../migration/check-native-web-pages-without-js.mjs';
import { documentPages } from '../migration/prerender-native-web-pages.mjs';

it('names the text every page document must read without JavaScript', () => {
  expect(Object.keys(PAGE_TEXT_WITHOUT_JS)).toEqual(documentPages().map(({ page }) => page));
  const privacy = PAGE_TEXT_WITHOUT_JS.privacy();
  expect(privacy.heading).toBe('Privacy policy');
  expect(privacy.text.length).toBeGreaterThan(1);
  expect(privacy.outsideLinks.length).toBeGreaterThan(0);
});

describe('without JavaScript', () => {
  const expected = {
    heading: 'Privacy policy',
    text: ['Splotch is a drawing app'],
    outsideLinks: ['https://openai.com/policies/services-agreement/'],
  };
  const read = {
    shown: ['phone-light'],
    heading: 'Privacy policy',
    text: 'Splotch is a drawing app made for kids. OpenAI (openai.com/policies/services-agreement)',
    links: ['https://splotch.test/'],
  };

  it('accepts a page that reads in full and names its outside addresses', () => {
    expect(pageWithoutJsProblems('privacy.html', 'phone-light', expected, read)).toEqual([]);
  });

  it('rejects the wrong variant, heading or text, and a linked or unnamed outside address', () => {
    const problems = (change) =>
      pageWithoutJsProblems('privacy.html', 'phone-light', expected, { ...read, ...change });
    expect(problems({ shown: ['phone-light', 'phone-dark'] })).toEqual([
      'privacy.html (phone-light, JavaScript off) shows variants [phone-light, phone-dark] instead of phone-light',
    ]);
    expect(problems({ heading: 'Oops' })[0]).toContain('is headed "Oops"');
    expect(problems({ text: 'openai.com' })[0]).toContain(
      'does not read: Splotch is a drawing app'
    );
    expect(problems({ links: expected.outsideLinks })[0]).toContain(
      'links outside the grown-up check'
    );
    expect(problems({ text: 'Splotch is a drawing app' })[0]).toContain(
      'does not name the address of'
    );
  });
});
