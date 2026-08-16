import { beforeEach, describe, expect, it } from 'vitest';
import { sectionContentStamp } from '$lib/components/settings/sections';
import { STORAGE_KEYS } from '$lib/storage';
import {
  hasSectionActivity,
  isSectionUnseen,
  markSectionSeen,
  reloadSectionsSeen,
} from './sectionsSeen.svelte';
import { reloadSessionCounters } from './sessionCounters.svelte';

beforeEach(() => {
  localStorage.clear();
  reloadSectionsSeen();
  reloadSessionCounters();
});

describe('section seen stamps', () => {
  it('treats a section with no stored stamp as unseen', () => {
    expect(isSectionUnseen('appearance')).toBe(true);
  });

  it('marks a section seen and persists its current content stamp', () => {
    markSectionSeen('appearance');

    expect(isSectionUnseen('appearance')).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.parentSectionsSeen)!)).toEqual({
      appearance: sectionContentStamp('appearance'),
    });
  });

  it('records seen sections while activity dots are still suppressed', () => {
    expect(hasSectionActivity('appearance')).toBe(false);

    markSectionSeen('appearance');
    localStorage.setItem(STORAGE_KEYS.settingsActivitySessionCount, '6');
    reloadSessionCounters();

    expect(isSectionUnseen('appearance')).toBe(false);
    expect(hasSectionActivity('appearance')).toBe(false);
    expect(hasSectionActivity('sound')).toBe(true);
  });

  it('re-dots a section when its content stamp changes', () => {
    const currentStamp = sectionContentStamp('appearance');
    localStorage.setItem(
      STORAGE_KEYS.parentSectionsSeen,
      JSON.stringify({ appearance: `${currentStamp}-older` })
    );

    reloadSectionsSeen();

    expect(isSectionUnseen('appearance')).toBe(true);
  });

  it('re-reads restored stamps into the live store', () => {
    localStorage.setItem(
      STORAGE_KEYS.parentSectionsSeen,
      JSON.stringify({ sound: sectionContentStamp('sound') })
    );

    reloadSectionsSeen();

    expect(isSectionUnseen('sound')).toBe(false);
    expect(isSectionUnseen('appearance')).toBe(true);
  });

  it('ignores unknown section ids from persisted data', () => {
    localStorage.setItem(
      STORAGE_KEYS.parentSectionsSeen,
      JSON.stringify({ retiredSection: '1', appearance: sectionContentStamp('appearance') })
    );

    reloadSectionsSeen();
    markSectionSeen('sound');

    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.parentSectionsSeen)!)).toEqual({
      appearance: sectionContentStamp('appearance'),
      sound: sectionContentStamp('sound'),
    });
  });
});
