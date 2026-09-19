import { beforeEach, describe, expect, it } from 'vitest';
import { APP_VERSION } from '$lib/appVersion';
import {
  setCrayon,
  setDeleteSound,
  setDrawingSound,
  setSound,
  setSoundVolume,
  setToolDrawerEnabled,
  setUndoButton,
} from '$lib/state/settings.svelte';
import {
  SECTIONS,
  sectionContentStamp,
  sectionIcon,
  sectionLabel,
  sectionSubtitle,
} from './sections';

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

  // Set once per child rather than per session: below the drawer a parent keeps
  // tuning, above the feature sections.
  it('files Accessibility between Tool Drawer and Coloring', () => {
    const ids = SECTIONS.map((section) => section.id);
    expect(ids.indexOf('accessibility')).toBe(ids.indexOf('controls') + 1);
    expect(ids.indexOf('coloring')).toBe(ids.indexOf('accessibility') + 1);
  });

  it('names the sections a cross-link points at by their own icon and label', () => {
    expect(sectionLabel('controls')).toBe('Tool Drawer');
    expect(sectionIcon('controls')).toBe('controls');
    expect(sectionLabel('sound')).toBe('Sound');
  });
});

describe('Accessibility section subtitle', () => {
  it('says who the section helps', () => {
    expect(sectionSubtitle('accessibility')).toBe('Make it easier to see and tap');
  });
});

describe('sound section subtitle', () => {
  it.each([
    [false, true, true, 'Muted'],
    [true, false, false, 'No sources'],
    [true, true, true, 'Volume 65%'],
    [true, true, false, 'Volume 65% · drawing only'],
    [true, false, true, 'Volume 65% · deleting only'],
  ] as const)(
    'summarizes master=%s drawing=%s delete=%s',
    (masterEnabled, drawingEnabled, deleteEnabled, expected) => {
      setSound(masterEnabled);
      setDrawingSound(drawingEnabled);
      setDeleteSound(deleteEnabled);
      setSoundVolume(65);

      expect(sectionSubtitle('sound')).toBe(expected);
    }
  );
});

describe('Tool Drawer section subtitle', () => {
  beforeEach(() => {
    setToolDrawerEnabled(true);
    setCrayon(true);
    setUndoButton(true);
  });

  it('lists the drawer while every tool is showing', () => {
    expect(sectionSubtitle('controls')).toBe('Pen, crayon, magic brush & more');
  });

  it('counts the tools the parent switched off', () => {
    setUndoButton(false);
    expect(sectionSubtitle('controls')).toBe('1 tool hidden');
    setCrayon(false);
    expect(sectionSubtitle('controls')).toBe('2 tools hidden');
  });

  // The switch hides every tool the count would describe, and leaves their
  // flags as they were, so the row names the switch rather than a count that
  // means nothing until it is back on.
  it('names the switch when the drawer is off, whatever the per-tool flags say', () => {
    setUndoButton(false);
    setToolDrawerEnabled(false);
    expect(sectionSubtitle('controls')).toBe('Tool drawer off');
  });
});
