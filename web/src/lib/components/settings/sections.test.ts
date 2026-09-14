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
import { SECTIONS, sectionContentStamp, sectionSubtitle } from './sections';

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
