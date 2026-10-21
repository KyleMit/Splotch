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
  const feedback = PAGE_TEXT_WITHOUT_JS.feedback();
  expect(feedback.heading).toBe('Send us feedback');
  expect(feedback.text).toContain(
    'Sending feedback needs JavaScript. Turn it on in your browser, then reload this page to send a report.'
  );
  expect(feedback.hiddenText).toEqual([
    "Something's broken",
    'I have an idea',
    "Your report goes to our private support tracker. Please don't include personal details like names or email addresses.",
    'Send report',
  ]);
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

  it('rejects a control shown that cannot work without JavaScript', () => {
    const form = { ...expected, outsideLinks: [], hiddenText: ['Send report'] };
    expect(pageWithoutJsProblems('feedback.html', 'phone-light', form, read)).toEqual([]);
    expect(
      pageWithoutJsProblems('feedback.html', 'phone-light', form, {
        ...read,
        text: `${read.text} Send report`,
      })
    ).toEqual([
      'feedback.html (phone-light, JavaScript off) shows what cannot work without JavaScript: Send report',
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

  it('rejects a target that holds the link, which stays in view without scrolling', () => {
    expect(sectionLinkProblems(at, { ...followed, top: 0, holdsLink: true })).toEqual([
      `${at} follows #reports to an element that holds the link, which no fragment scrolls`,
    ]);
  });
});
