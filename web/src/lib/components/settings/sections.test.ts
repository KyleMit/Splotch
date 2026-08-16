import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '$lib/appVersion';
import { SECTIONS, sectionContentStamp } from './sections';

describe('SECTIONS', () => {
  // `as const satisfies` derives SectionId from this list and rejects an id
  // outside the union, but it accepts the same id twice. A duplicate would
  // type-check while SECTION_BY_ID (Object.fromEntries) kept only the last
  // entry's metadata and both shells rendered two rows keyed on the same id —
  // so the "appears once" half of the invariant needs a runtime assertion.
  it('has no duplicate ids', () => {
    const ids = SECTIONS.map((section) => section.id);
    expect(new Set(ids).size, `duplicate section id in SECTIONS: ${ids.join(', ')}`).toBe(
      ids.length
    );
  });

  it("uses the app version as What's New's content stamp", () => {
    expect(sectionContentStamp('whatsnew')).toBe(APP_VERSION);
  });
});
