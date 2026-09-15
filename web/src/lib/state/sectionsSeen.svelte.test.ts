import { tick } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { sectionContentStamp, type SectionId } from '$lib/components/settings/sections';
import { STORAGE_KEYS } from '$lib/storage';
import { createSectionsSeen, type SectionsSeenState } from './sectionsSeen.svelte';
import { createSessionCounters, type SessionCountersState } from './sessionCounters.svelte';

let counters: SessionCountersState;
let seen: SectionsSeenState;

beforeEach(() => {
  localStorage.clear();
  counters = createSessionCounters();
  seen = createSectionsSeen(counters);
});

describe('section seen stamps', () => {
  it('treats a section with no stored stamp as unseen', () => {
    expect(seen.isSectionUnseen('appearance')).toBe(true);
  });

  it('marks a section seen and persists its current content stamp', () => {
    seen.markSectionSeen('appearance');

    expect(seen.isSectionUnseen('appearance')).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.parentSectionsSeen)!)).toEqual({
      appearance: sectionContentStamp('appearance'),
    });
  });

  it('records seen sections while activity dots are still suppressed', () => {
    expect(seen.hasSectionActivity('appearance')).toBe(false);

    seen.markSectionSeen('appearance');
    localStorage.setItem(STORAGE_KEYS.settingsActivitySessionCount, '6');
    counters.reloadSessionCounters();

    expect(seen.isSectionUnseen('appearance')).toBe(false);
    expect(seen.hasSectionActivity('appearance')).toBe(false);
    expect(seen.hasSectionActivity('sound')).toBe(true);
  });

  it('re-dots a section when its content stamp changes', () => {
    const currentStamp = sectionContentStamp('appearance');
    localStorage.setItem(
      STORAGE_KEYS.parentSectionsSeen,
      JSON.stringify({ appearance: `${currentStamp}-older` })
    );

    seen.reloadSectionsSeen();

    expect(seen.isSectionUnseen('appearance')).toBe(true);
  });

  it('re-reads restored stamps into the live store', () => {
    localStorage.setItem(
      STORAGE_KEYS.parentSectionsSeen,
      JSON.stringify({ sound: sectionContentStamp('sound') })
    );

    seen.reloadSectionsSeen();

    expect(seen.isSectionUnseen('sound')).toBe(false);
    expect(seen.isSectionUnseen('appearance')).toBe(true);
  });

  it('ignores unknown section ids from persisted data', () => {
    localStorage.setItem(
      STORAGE_KEYS.parentSectionsSeen,
      JSON.stringify({ retiredSection: '1', appearance: sectionContentStamp('appearance') })
    );

    seen.reloadSectionsSeen();
    seen.markSectionSeen('sound');

    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.parentSectionsSeen)!)).toEqual({
      appearance: sectionContentStamp('appearance'),
      sound: sectionContentStamp('sound'),
    });
  });
});

// WideShell's landing effect marks the section it lands on seen, and that effect
// also re-locks Parent Center and scrolls the pane back to the landing section
// every time it runs. Marking is a command, so it must not subscribe its caller.
describe('marking a section seen from an effect', () => {
  // Every flush the effect could be rescheduled into has run by the second tick.
  async function settle() {
    await tick();
    await tick();
  }

  async function countEffectRuns(id: SectionId) {
    let runs = 0;
    const stop = $effect.root(() => {
      $effect(() => {
        runs += 1;
        seen.markSectionSeen(id);
      });
    });
    await settle();
    return { runs: () => runs, stop };
  }

  it('runs the effect once when the section was unseen', async () => {
    const effect = await countEffectRuns('appearance');

    expect(effect.runs()).toBe(1);
    effect.stop();
  });

  it('leaves the effect alone when the stamps reload', async () => {
    seen.markSectionSeen('appearance');
    const effect = await countEffectRuns('appearance');

    seen.reloadSectionsSeen();
    await settle();

    expect(effect.runs()).toBe(1);
    effect.stop();
  });
});
