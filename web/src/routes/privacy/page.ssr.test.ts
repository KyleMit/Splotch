// @vitest-environment node
import { createHash } from 'node:crypto';
import { Window } from 'happy-dom';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { IMAGE_REPORT_RETENTION_DAYS, IMAGE_REPORT_REVIEW_HOURS } from '$lib/imageReport';

import PrivacyPage from './+page.svelte';
import { HIGHLIGHTS, SECTIONS } from './contents';

// Text is compared as rendered, never whitespace-normalized: a formatter
// wrapping template copy leaves a newline run inside the text node, which a
// browser shows as one space but an anchored text locator no longer matches.
// tools/mobile/tests/privacy-consistency.test.mjs checks the source's wording;
// only a render shows what an interpolated constant turns into.
function renderedParagraphs(sectionId: string): string[] {
  const body = render(PrivacyPage).body;
  const section = new RegExp(`<section id="${sectionId}"[^>]*>([\\s\\S]*?)</section>`).exec(
    body
  )?.[1];
  return [...(section ?? '').matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].map((match) =>
    match[1].replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '')
  );
}

describe('privacy policy report section', () => {
  it('states the review window and the retention window of a confirmed report', () => {
    expect(renderedParagraphs('reports')).toContainEqual(
      expect.stringContaining(
        `respond within ${IMAGE_REPORT_REVIEW_HOURS} hours. A daily cleanup deletes the report after ${IMAGE_REPORT_RETENTION_DAYS} days.`
      )
    );
  });
});

// Every published revision of the policy text, oldest first: the "Last
// updated" date the page showed and a SHA-256 of policyText() for it. The
// failure below asks for a new revision to be appended, and the unique-date
// check makes an appended revision that keeps the old date fail. Nothing here
// can stop an entry being edited in place; that is a mistake for review to
// catch.
const POLICY_REVISIONS = [
  {
    lastUpdated: 'September 8, 2026',
    textSha256: 'd57893d5775d8b96cbcbfff0527a05ed45a09e56b58cdba32d8e9094c5934255',
  },
] as const;

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

describe('privacy policy "Last updated" date', () => {
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
      `The rendered privacy policy text changed. Set LAST_UPDATED in web/src/routes/privacy/+page.svelte to the date this change publishes, then append { lastUpdated: <that date>, textSha256: '${textSha256}' } to POLICY_REVISIONS in this file.`
    ).toBe(latest.textSha256);
  });

  it('shows the date of the newest revision', () => {
    expect(updated).toBe(`Last updated ${latest.lastUpdated}`);
  });

  it('gives every revision its own date', () => {
    const dates = POLICY_REVISIONS.map(({ lastUpdated }) => lastUpdated);
    expect(new Set(dates).size).toBe(dates.length);
  });
});
