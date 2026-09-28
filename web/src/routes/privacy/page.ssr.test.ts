// @vitest-environment node
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { IMAGE_REPORT_RETENTION_DAYS, IMAGE_REPORT_REVIEW_HOURS } from '$lib/imageReport';

import PrivacyPage from './+page.svelte';
import { describePolicyRevisions } from './policyRevisionsTestHarness';

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

// The unit config compiles `__IS_CAPACITOR__` as true, so this is the native
// render; page.webSsr.test.ts runs the same guard on the web one.
describePolicyRevisions('native');
