// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RELEASE_SECTION_ICONS } from './releaseSections';
import { RELEASE_SECTION_TITLES } from '../../../tools/release/gen-release-notes.mjs';

// ReleaseSectionHeading's title prop is closed over RELEASE_SECTION_ICONS, and
// the generator is the only producer of that prop: a heading it wraps that the
// union lacks fails svelte-check on the generated component, and a union member
// it does not recognise ships as a plain heading with no icon.
describe('release section vocabulary', () => {
  it('matches between the app and the release-notes generator', () => {
    expect([...RELEASE_SECTION_TITLES].sort()).toEqual(Object.keys(RELEASE_SECTION_ICONS).sort());
  });
});
