import { createHash } from 'node:crypto';
import { Window } from 'happy-dom';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';

import PrivacyPage from './+page.svelte';
import { HIGHLIGHTS, SECTIONS } from './contents';

// The privacy policy ships in both builds and may differ between them (the
// feedback link's destination already does), so the "Last updated" guard runs
// under each build's define: page.ssr.test.ts renders the native branch and
// page.webSsr.test.ts the web one.
type Build = 'web' | 'native';

// Every published revision of the policy text, oldest first: the "Last
// updated" date the page showed and, per build, a SHA-256 of what
// renderedPolicy() reads. The failure below asks for a new revision to be
// appended, and the unique-date check makes an appended revision that keeps
// the old date fail. Nothing here can stop an entry being edited in place;
// that is a mistake for review to catch.
const POLICY_REVISIONS: readonly { lastUpdated: string; textSha256: Record<Build, string> }[] = [
  {
    lastUpdated: 'September 8, 2026',
    textSha256: {
      web: '82b7535b96ad801809c5861a9a86325fd6ea9f82a177ddb178cd421255941053',
      native: 'd57893d5775d8b96cbcbfff0527a05ed45a09e56b58cdba32d8e9094c5934255',
    },
  },
  {
    lastUpdated: 'September 28, 2026',
    textSha256: {
      web: '36fd5395b8ed3c72b054d47b8fb07ceec0d2975f390f40ab4d45a55c5c4e5bab',
      native: 'b0b8e9a7c95149a43cae7f14767f6131946faf75e0c6a277adb8821dbcf0339c',
    },
  },
];

// Each policy block as what a parent reads, not how the source is laid out:
// its text content with whitespace runs collapsed the way a browser collapses
// them, then its link destinations. Neither a formatter rewrapping template
// copy nor an inline tag around a word changes that, while any changed word —
// including the value of a constant the page interpolates from another module
// — or link destination does. The chrome around the policy (masthead, contents
// rail) is left out so a shared-component change doesn't read as a policy
// change.
function renderedPolicy() {
  const { document } = new Window();
  document.body.innerHTML = render(PrivacyPage).body;
  const blocks = (selector: string) =>
    [...document.querySelectorAll(selector)].map((block) => {
      const text = (block.textContent ?? '').replace(/\s+/g, ' ').trim();
      const links = [...block.querySelectorAll('a[href]')].map((link) => link.getAttribute('href'));
      return [text, ...links].join('\n');
    });
  return {
    lede: blocks('.lede'),
    highlights: blocks('.highlights li'),
    sections: blocks('.sections section'),
    updated: document.querySelector('.short-version .updated')?.textContent,
  };
}

export function describePolicyRevisions(build: Build) {
  describe(`privacy policy "Last updated" date in the ${build} build`, () => {
    const { lede, highlights, sections, updated } = renderedPolicy();
    const latest = POLICY_REVISIONS[POLICY_REVISIONS.length - 1];

    it('hashes the lede, every summary line, and every contents section', () => {
      expect(lede).toHaveLength(1);
      expect(highlights).toHaveLength(HIGHLIGHTS.length);
      expect(sections).toHaveLength(SECTIONS.length);
    });

    it('moves with the policy text', () => {
      const textSha256 = createHash('sha256')
        .update([...lede, ...highlights, ...sections].join('\n\n'))
        .digest('hex');
      expect(
        textSha256,
        `The rendered ${build} privacy policy changed. Set LAST_UPDATED in web/src/routes/privacy/+page.svelte to the date this change publishes, then append a revision with that date to POLICY_REVISIONS in web/src/routes/privacy/policyRevisionsTestHarness.ts. Its textSha256.${build} is '${textSha256}'; the other build's suite (npm run test:unit runs both) reports its own.`
      ).toBe(latest.textSha256[build]);
    });

    it('shows the date of the newest revision', () => {
      expect(updated).toBe(`Last updated ${latest.lastUpdated}`);
    });

    it('gives every revision its own date', () => {
      const dates = POLICY_REVISIONS.map(({ lastUpdated }) => lastUpdated);
      expect(new Set(dates).size).toBe(dates.length);
    });
  });
}
