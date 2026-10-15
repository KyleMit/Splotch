import { describe, expect, it } from 'vitest';
import {
  NAV_ROW_CLEARANCE_PX,
  SCROLL_END_EPSILON_PX,
  SCROLLSPY_LINE_INSET_PX,
  navRevealOffset,
  sectionJumpOffset,
  spiedSectionAt,
  stackedOffsets,
} from '../../experiments/native-architecture/src/settings/settingsPane.ts';
import { SECTION_JUMP_INSET_PX } from '../../web/src/lib/components/settings/paneScroll.ts';

describe('the pane scroll geometry', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('stacks offsets from heights alone, and waits for every height', () => {
    expect(stackedOffsets([100, 200, 50], 3, 4, 60)).toEqual([4, 164, 424]);
    expect(stackedOffsets([100, undefined, 50], 3, 4, 60)).toBeNull();
  });

  it('elects the last section passing the reading line, and the last one at the scroll end', () => {
    const offsets = [0, 400, 800, 1200];
    const extent = (offset) => ({ offset, viewport: 500, content: 1500 });
    expect(spiedSectionAt(ids, offsets, extent(400 - SCROLLSPY_LINE_INSET_PX - 1))).toBe('a');
    expect(spiedSectionAt(ids, offsets, extent(400 - SCROLLSPY_LINE_INSET_PX))).toBe('b');
    expect(spiedSectionAt(ids, offsets, extent(1000 - SCROLL_END_EPSILON_PX))).toBe('d');
    // An unmeasured pane is not at its end.
    expect(spiedSectionAt(ids, offsets, { offset: 0, viewport: 0, content: 0 })).toBe('a');
    expect(spiedSectionAt(ids, offsets, { offset: 0, viewport: 500, content: 0 })).toBe('a');
  });

  it('parks a jump just under the pane top', () => {
    expect(sectionJumpOffset(500)).toBe(500 - SECTION_JUMP_INSET_PX);
  });

  it('scrolls the nav only as far as keeps the elected row clear of its edges', () => {
    const nav = { offset: 100, viewport: 300, content: 900 };
    expect(navRevealOffset({ top: 110, height: 50 }, nav)).toBe(110 - NAV_ROW_CLEARANCE_PX);
    expect(navRevealOffset({ top: 400, height: 50 }, nav)).toBe(
      400 + 50 - 300 + NAV_ROW_CLEARANCE_PX
    );
    expect(navRevealOffset({ top: 880, height: 50 }, nav)).toBe(600);
  });
});
