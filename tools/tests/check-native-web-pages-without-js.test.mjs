import { describe, expect, it } from 'vitest';
import {
  PAGE_TEXT_WITHOUT_JS,
  pageWithoutJsProblems,
  sectionLinkProblems,
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

describe('a page whose links must stay links without JavaScript', () => {
  const expected = {
    heading: 'This page wandered off',
    text: [],
    outsideLinks: [],
    linked: ['/', '/changelog', 'https://play.google.com/apps/testing/art.splotch.app'],
  };
  const read = {
    shown: ['phone-light'],
    heading: 'This page wandered off',
    text: '',
    links: [
      'https://splotch.test/',
      'https://splotch.test/changelog',
      'https://play.google.com/apps/testing/art.splotch.app',
    ],
  };

  it('accepts every expected link, on the page’s own origin or outside it', () => {
    expect(pageWithoutJsProblems('404.html', 'phone-light', expected, read)).toEqual([]);
  });

  it('rejects a page missing one', () => {
    expect(
      pageWithoutJsProblems('404.html', 'phone-light', expected, {
        ...read,
        links: read.links.slice(0, 1),
      })
    ).toEqual([
      '404.html (phone-light, JavaScript off) does not link: /changelog, https://play.google.com/apps/testing/art.splotch.app',
    ]);
  });
});

describe('a followed section link', () => {
  const at = 'privacy.html (desktop-light, JavaScript off)';
  const followed = { href: '#reports', found: true, visible: true, top: -0.4, viewportHeight: 800 };

  it('accepts a target scrolled into view', () => {
    expect(sectionLinkProblems(at, followed)).toEqual([]);
  });

  it('rejects a missing, hidden or out-of-view target, and a page with no section link', () => {
    expect(
      sectionLinkProblems(at, { ...followed, found: false, visible: false, top: null })
    ).toEqual([`${at} follows #reports to no target, not into view`]);
    expect(sectionLinkProblems(at, { ...followed, visible: false })[0]).toContain(
      'a hidden target'
    );
    expect(sectionLinkProblems(at, { ...followed, top: 900 })[0]).toContain('a target at 900 px');
    expect(sectionLinkProblems(at, null)).toEqual([`${at} has no in-page section link to follow`]);
  });
});
