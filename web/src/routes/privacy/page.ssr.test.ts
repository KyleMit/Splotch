// @vitest-environment node
import { createHash } from 'node:crypto';
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
// updated" date the page showed and a SHA-256 of policyText() for it. A change
// to the text appends a revision rather than editing one, so the unique-date
// check below makes re-pinning a new text under an old date fail.
const POLICY_REVISIONS = [
  {
    lastUpdated: 'September 8, 2026',
    textSha256: '136283bb95095b9ef98fabf7ccfbeb24986a4af3b2ba252fb5679184a82a03a9',
  },
] as const;

const LEDE = /<p class="lede\b[^>]*>([\s\S]*?)<\/p>/g;
const HIGHLIGHT_LIST = /<ul class="highlights\b[^>]*>([\s\S]*?)<\/ul>/g;
const SECTION = /<section id="[^"]*"[^>]*>([\s\S]*?)<\/section>/g;

function blocks(body: string, pattern: RegExp): string[] {
  return [...body.matchAll(pattern)].map((match) => match[1]);
}

function policyBlocks(body: string) {
  return {
    lede: blocks(body, LEDE),
    highlights: blocks(body, HIGHLIGHT_LIST),
    sections: blocks(body, SECTION),
  };
}

// What a parent reads, not how the source is laid out: whitespace runs
// collapse the way a browser collapses them, so a formatter rewrapping
// template copy leaves the hash alone while any changed word — including the
// value of a constant the page interpolates from another module — moves it.
// The chrome around the policy (masthead, contents rail) is left out so a
// shared-component change doesn't read as a policy change.
function policyText(body: string): string {
  const { lede, highlights, sections } = policyBlocks(body);
  return [...lede, ...highlights, ...sections]
    .map((block) =>
      block
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .join('\n');
}

describe('privacy policy "Last updated" date', () => {
  const body = render(PrivacyPage).body;
  const latest = POLICY_REVISIONS[POLICY_REVISIONS.length - 1];

  it('hashes the lede, the summary, and every contents section', () => {
    const { lede, highlights, sections } = policyBlocks(body);
    expect(lede).toHaveLength(1);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].match(/<li\b/g)).toHaveLength(HIGHLIGHTS.length);
    expect(sections).toHaveLength(SECTIONS.length);
  });

  it('moves with the policy text', () => {
    const textSha256 = createHash('sha256').update(policyText(body)).digest('hex');
    expect(
      textSha256,
      `The rendered privacy policy text changed. Set LAST_UPDATED in web/src/routes/privacy/+page.svelte to the date this change publishes, then append { lastUpdated: <that date>, textSha256: '${textSha256}' } to POLICY_REVISIONS in this file.`
    ).toBe(latest.textSha256);
  });

  it('shows the date of the newest revision', () => {
    expect(/Last updated ([^<]+)</.exec(body)?.[1]).toBe(latest.lastUpdated);
  });

  it('gives every revision its own date', () => {
    const dates = POLICY_REVISIONS.map(({ lastUpdated }) => lastUpdated);
    expect(new Set(dates).size).toBe(dates.length);
  });
});
