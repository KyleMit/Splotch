// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { observeContentEnd, trailingRowCutHeight, type RowCutMeasurements } from './scrollCue';

// A two-column phone picker: eight tiles over four 150px rows, an 8px gap, and
// a header block above the grid.
const PHONE: RowCutMeasurements = {
  gridTop: 88,
  rowHeight: 150,
  rowGap: 8,
  rowCount: 4,
  viewportHeight: 690,
  contentHeight: 744,
};

describe('trailingRowCutHeight', () => {
  it('cuts the trailing row in half', () => {
    // 88 header + three whole rows and their gaps (474) + half of the fourth.
    expect(trailingRowCutHeight(PHONE)).toBe(88 + 3 * 158 + 75);
  });

  it('leaves the height alone when nothing sits below the fold', () => {
    expect(trailingRowCutHeight({ ...PHONE, contentHeight: PHONE.viewportHeight })).toBeNull();
  });

  it('shortens rather than lengthens when the fold already cuts deep into a row', () => {
    const height = trailingRowCutHeight({ ...PHONE, viewportHeight: 700 });
    expect(height).not.toBeNull();
    expect(height!).toBeLessThan(700);
  });

  it('gives no row away on a viewport too short to seat one whole row plus the peek', () => {
    // A landscape phone: the modal is height-starved, and cutting here would
    // leave less than a row of list to choose from.
    expect(
      trailingRowCutHeight({
        ...PHONE,
        rowHeight: 223,
        rowGap: 12,
        rowCount: 3,
        viewportHeight: 318,
        contentHeight: 800,
      })
    ).toBeNull();
  });

  it('declines a cut that would cost a roomy viewport a whole row of choices', () => {
    // A desktop window: the page grid's rows are tall enough that budgeting one
    // away drops the picker from two-and-a-bit rows to one-and-a-half.
    expect(
      trailingRowCutHeight({
        gridTop: 128,
        rowHeight: 281,
        rowGap: 12,
        rowCount: 3,
        viewportHeight: 765,
        contentHeight: 996,
      })
    ).toBeNull();
  });

  it('leaves the height alone when only padding overflows', () => {
    // Every row already fits; the overflow is the content's own bottom padding,
    // so a cut would expose blank space rather than a tile.
    expect(
      trailingRowCutHeight({ ...PHONE, rowCount: 3, contentHeight: PHONE.viewportHeight + 4 })
    ).toBeNull();
  });

  it('ignores an unmeasurable grid', () => {
    expect(trailingRowCutHeight({ ...PHONE, rowHeight: 0 })).toBeNull();
    expect(trailingRowCutHeight({ ...PHONE, viewportHeight: 0 })).toBeNull();
  });
});

// The sentinel's box as each of the three states reports it: laid out and on
// screen, laid out and clipped away below the fold, and not laid out at all.
const ON_SCREEN = { width: 320, height: 0 } as DOMRectReadOnly;
const NO_BOX = { width: 0, height: 0 } as DOMRectReadOnly;

class FakeIntersectionObserver {
  static live: FakeIntersectionObserver[] = [];
  targets = new Set<unknown>();
  observations = 0;
  disconnected = false;
  constructor(private callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.live.push(this);
  }
  observe(target: unknown) {
    // The real observer ignores an observe() of a target it already holds, so
    // only a target that was dropped first can be counted as a fresh reading.
    if (this.targets.has(target)) return;
    this.targets.add(target);
    this.observations += 1;
  }
  unobserve(target: unknown) {
    this.targets.delete(target);
  }
  disconnect() {
    this.disconnected = true;
    this.targets.clear();
  }
  report(boundingClientRect: DOMRectReadOnly, isIntersecting: boolean) {
    this.callback(
      [{ boundingClientRect, isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
}

class FakeResizeObserver {
  static live: FakeResizeObserver[] = [];
  disconnected = false;
  constructor(private callback: () => void) {
    FakeResizeObserver.live.push(this);
  }
  observe() {}
  disconnect() {
    this.disconnected = true;
  }
  resize() {
    this.callback();
  }
}

describe('observeContentEnd', () => {
  const realIntersectionObserver = globalThis.IntersectionObserver;
  const realResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    FakeIntersectionObserver.live = [];
    FakeResizeObserver.live = [];
    globalThis.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.IntersectionObserver = realIntersectionObserver;
    globalThis.ResizeObserver = realResizeObserver;
  });

  function attach() {
    const sentinel = {} as HTMLElement;
    const reported: boolean[] = [];
    const handle = observeContentEnd(sentinel, (atEnd) => reported.push(atEnd));
    return {
      sentinel,
      reported,
      handle,
      intersection: FakeIntersectionObserver.live[0],
      resize: FakeResizeObserver.live[0],
    };
  }

  it('says nothing about content that fits, so the cue never arms', () => {
    const { reported, intersection } = attach();
    intersection.report(ON_SCREEN, true);
    expect(reported).toEqual([]);
  });

  it('arms once content runs past the fold and retires again at the end', () => {
    const { reported, intersection } = attach();
    intersection.report(ON_SCREEN, false);
    expect(reported).toEqual([false]);
    intersection.report(ON_SCREEN, true);
    expect(reported).toEqual([false, true]);
  });

  it('reports a state change once, not on every reading', () => {
    const { reported, intersection } = attach();
    intersection.report(ON_SCREEN, false);
    intersection.report(ON_SCREEN, false);
    expect(reported).toEqual([false]);
  });

  it('ignores a surface with no layout box, which would arm the cue unseen', () => {
    const { reported, intersection } = attach();
    intersection.report(NO_BOX, false);
    expect(reported).toEqual([]);
  });

  it('re-observes on a resize, since being shown is not an intersection change', () => {
    const { sentinel, intersection, resize } = attach();
    expect(intersection.observations).toBe(1);
    resize.resize();
    expect(intersection.observations).toBe(2);
    expect(intersection.targets.has(sentinel)).toBe(true);
  });

  it('keeps an armed cue armed across a hide and a reopen', () => {
    const { reported, intersection, resize } = attach();
    intersection.report(ON_SCREEN, false);
    // Closing the surface takes its box away; reopening it resizes from zero,
    // and the fresh reading finds the same content still past the fold.
    intersection.report(NO_BOX, false);
    resize.resize();
    intersection.report(ON_SCREEN, false);
    expect(reported).toEqual([false]);
  });

  it('tears both observers down', () => {
    const { handle, intersection, resize } = attach();
    handle.destroy();
    expect(intersection.disconnected).toBe(true);
    expect(resize.disconnected).toBe(true);
  });
});
