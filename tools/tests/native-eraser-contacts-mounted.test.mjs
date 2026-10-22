// @vitest-environment happy-dom
import { legacyDrawing } from './native-paper-fixtures.mjs';
import { act } from 'react';
import { flushSync } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  sdk,
  owner,
  historyOwner,
  root,
  host,
  touch,
  event,
  send,
  settle,
  open,
  twoContacts,
} from './native-contacts-mounted-harness.mjs';
import { createPaperScroll } from '../../src/drawing/paperGeometry.ts';
import { measurePaper as measureWebPaper } from '../../src/drawing/measurePaper.web.ts';
import { offlineLibrary } from '../../src/offlineLibrary/runtime.ts';
import { PageArtMotion } from '../../src/drawing/PageArtMotion.tsx';
import { prepareColoringPage } from '../../src/drawing/pageArtSelection.ts';
import { createLazyExport } from '../../src/lazyExport.ts';
const marker = { brush: 'marker', width: 22, color: 'Blue', points: [{ x: 40, y: 60 }] };

describe('mounted joint cohort, canonical history and capture ownership', () => {
  it.each(['pen', 'eraser', 'crayon', 'magic'])(
    'finishes two %s contacts in one Undo group using measured page coordinates',
    async (brush) => {
      const base = await open({ ...legacyDrawing(3, 'flower'), strokes: [marker] });
      await act(async () => owner.setBrush(brush));
      await settle();
      const before = owner.history;
      await twoContacts();
      expect(owner.history).toBe(before);
      expect(owner.drawing).toBe(true);
      await send('start', event([touch(0, 70, 80, 400)], undefined, { 0: 100 }), false);
      await send('end', event([], [touch(0, 90, 100, 500)], { 0: 100 }), false);
      expect(owner.history.undo).toEqual([...before.undo, base]);
      const added = owner.history.drawing.strokes.slice(1);
      expect(added.map(({ brush: selected }) => selected)).toEqual([brush, brush]);
      expect(added.map(({ points }) => points)).toEqual([
        [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
          { x: 50, y: 60 },
          { x: 70, y: 80 },
          { x: 90, y: 100 },
        ],
        [
          { x: 80, y: 90 },
          { x: 100, y: 110 },
        ],
      ]);
      const expectedStyles = {
        pen: [
          { brush: 'pen', width: 8, color: 'Purple' },
          { brush: 'pen', width: 8, color: 'Purple' },
        ],
        crayon: [
          { brush: 'crayon', width: 8, color: 'Purple', seed: 1 },
          { brush: 'crayon', width: 8, color: 'Purple', seed: 2 },
        ],
        magic: [
          { brush: 'magic', width: 8, rainbow: 3 },
          { brush: 'magic', width: 8, rainbow: 3 },
        ],
        eraser: [
          { brush: 'eraser', width: 16 },
          { brush: 'eraser', width: 16 },
        ],
      };
      expect(added.map(({ points: _points, ...style }) => style)).toEqual(expectedStyles[brush]);
      expect(host.querySelectorAll('[data-mask="true"]')).toHaveLength(brush === 'eraser' ? 1 : 0);
      await settle();
      await act(async () => owner.undo());
      expect(owner.history.drawing).toBe(base);
      expect(owner.history.drawing).toMatchObject({ version: 5, pageId: 'flower', rainbow: 3 });
    }
  );

  it('refuses a command during either active contact, including after a partial lift', async () => {
    await twoContacts();
    expect(() => owner.surface.current.lockInput()).toThrow('Finish drawing');
    await expect(owner.surface.current.captureInk(owner.history.drawing)).rejects.toThrow(
      'Lift your finger'
    );
    const before = owner.history;
    await act(async () => owner.save());
    expect(sdk.save).not.toHaveBeenCalled();
    expect(owner.history).toBe(before);
    await send('end', event([], [touch(0, 90, 100, 500)], { 0: 100 }), false);
    await act(async () => {
      void owner.save();
    });
    await settle();
    expect(sdk.save).toHaveBeenCalledOnce();
  });

  it('blocks admission under a synchronous command lease and while actual output is pending', async () => {
    const drawing = owner.history.drawing;
    const handle = owner.surface.current;
    const release = handle.lockInput();
    await send('start', event([touch(9, 50, 60, 100)]));
    await send('end', event([], [touch(9, 70, 80, 200)], { 9: 100 }));
    expect(owner.history.drawing).toBe(drawing);
    sdk.hold = true;
    let pending;
    await act(async () => {
      pending = handle.captureInk(drawing);
    });
    const failure = pending.catch((error) => error.message);
    await settle();
    await send('start', event([touch(0, 10, 20)]));
    await send('end', event([], [touch(0, 30, 40, 200)], { 0: 100 }), false);
    expect(owner.history.drawing).toBe(drawing);
    release();
    await act(async () => sdk.captures.at(-1).callback('late after release'));
    expect(await failure).toContain('changed');
    expect(owner.surface.current).toBe(handle);
    await send('start', event([touch(1, 50, 60, 300)]));
    await send('end', event([], [touch(1, 70, 80, 400)], { 1: 300 }), false);
    expect(owner.history.drawing.strokes).toHaveLength(1);
  });

  it('keeps a cohort through layout measurements and ignores stale, repeated or empty geometry', async () => {
    await twoContacts();
    const before = owner.history;
    sdk.autoMeasure = false;
    await act(async () => owner.surface.current.refreshGeometry());
    const stale = sdk.measurements.at(-1);
    expect(owner.history).toBe(before);
    expect(owner.drawing).toBe(true);
    await act(async () => owner.surface.current.refreshGeometry());
    const latest = sdk.measurements.at(-1);
    await act(async () => {
      latest(0, 0, 1024, 768, 40, 700);
      stale(0, 0, 1024, 768, 0, 0);
      latest(0, 0, 1024, 768, 0, 0);
    });
    await act(async () => owner.surface.current.refreshGeometry());
    await act(async () => sdk.measurements.at(-1)(0, 0, 0, 0, 0, 0));
    await send('move', event([touch(0, 90, 100, 400)], undefined, { 0: 100 }), false);
    await send('end', event([], [touch(0, 110, 120, 500)], { 0: 100 }), false);
    expect(owner.history.drawing.strokes).toHaveLength(2);
    expect(owner.history.undo).toHaveLength(1);
    expect(owner.history.drawing.strokes[0].points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
      { x: 90, y: 200 },
      { x: 110, y: 220 },
    ]);
    await send('start', event([touch(1, 60, 80, 600)]));
    await send('end', event([], [touch(1, 80, 100, 700)], { 1: 600 }), false);
    expect(owner.history.drawing.strokes.at(-1).points).toEqual([
      { x: 60, y: 180 },
      { x: 80, y: 200 },
    ]);
  });

  it('refuses old cohort/generation callbacks after automatic recovery and ignores a late measurement', async () => {
    const before = owner.history;
    const old = owner.recovery.callbacks;
    sdk.autoMeasure = false;
    await act(async () => owner.surface.current.refreshGeometry());
    const measurement = sdk.measurements.at(-1);
    sdk.autoMeasure = true;
    await act(async () => old.onRendererFault(new Error('SDK renderer fault')));
    expect(owner.recovery.generation).toBe(1);
    await settle();
    await act(async () => {
      measurement(0, 0, 1024, 768, 0, 0);
      old.onCohort([marker]);
      old.onDrawingChange(true);
      old.onRendererFault(new Error('late old renderer'));
    });
    expect(owner.history).toBe(before);
    expect(owner.recovery.failed).toBe(false);
    expect(owner.drawing).toBe(false);
    await send('start', event([touch(0, 10, 20)]));
    await send('end', event([], [touch(0, 30, 40, 200)], { 0: 100 }), false);
    expect(owner.history.drawing.strokes).toHaveLength(1);
  });

  it('retains one sound loop through a partial lift and ends it with the actual last contact', async () => {
    await twoContacts();
    expect(sdk.soundStart).toHaveBeenCalledOnce();
    expect(sdk.soundStop).not.toHaveBeenCalled();
    await send('end', event([], [touch(0, 90, 100, 500)], { 0: 100 }), false);
    expect(sdk.soundStop).toHaveBeenCalledOnce();
    expect(owner.history.drawing.strokes).toHaveLength(2);
    await settle();
    await act(async () => owner.undo());
    expect(owner.history.drawing.strokes).toEqual([]);
  });

  it('holds the real input lease throughout Settings and rejects commands until close', async () => {
    const before = owner.history;
    const staleChoosePage = owner.choosePage;
    await act(async () => owner.openSettings());
    expect(owner.settingsOpen).toBe(true);
    await send('start', event([touch(9, 50, 60, 100)]));
    await send('end', event([], [touch(9, 70, 80, 200)], { 9: 100 }));
    await act(async () => {
      await owner.save();
      await owner.clear();
      owner.choosePage('flower');
      staleChoosePage('turtle');
    });
    expect(sdk.save).not.toHaveBeenCalled();
    expect(sdk.captures).toEqual([]);
    expect(owner.history).toBe(before);
    await act(async () => owner.closeSettings());
    expect(owner.settingsOpen).toBe(false);
    await send('start', event([touch(10, 50, 60, 300)]));
    await send('end', event([], [touch(10, 70, 80, 400)], { 10: 300 }));
    expect(owner.history.drawing.strokes).toHaveLength(before.drawing.strokes.length + 1);
  });

  it('refuses Settings during an admitted cohort and keeps its sound through layout refresh', async () => {
    await twoContacts();
    await act(async () => owner.openSettings());
    expect(owner.settingsOpen).toBe(false);
    const before = owner.history;
    await act(async () => owner.surface.current.refreshGeometry());
    expect(sdk.soundStop).not.toHaveBeenCalled();
    await send('move', event([touch(0, 90, 100, 400)], undefined, { 0: 100 }), false);
    expect(owner.drawing).toBe(true);
    expect(owner.history).toBe(before);
    await send('end', event([], [touch(0, 110, 120, 500)], { 0: 100 }), false);
    expect(sdk.soundStop).toHaveBeenCalledOnce();
  });

  it('refreshes only on changed scroll offsets and translates web document coordinates', () => {
    const refresh = vi.fn();
    const scroll = createPaperScroll(refresh);
    scroll({ x: 0, y: 0 });
    scroll({ x: 0, y: 100 });
    scroll({ x: 0, y: 100 });
    expect(refresh).toHaveBeenCalledTimes(1);
    const measured = vi.fn();
    measureWebPaper(
      {
        getBoundingClientRect: () => ({ left: 20, top: 30, width: 1024, height: 768 }),
        ownerDocument: { defaultView: { scrollX: 40, scrollY: 500 } },
      },
      measured
    );
    expect(measured).toHaveBeenCalledExactlyOnceWith({
      width: 1024,
      height: 768,
      pageX: 60,
      pageY: 530,
    });
  });
});

describe('the coloring page action after picker retirement', () => {
  async function choose(pageId = 'turtle') {
    await open({
      ...legacyDrawing(),
      strokes: [{ brush: 'magic', rainbow: 0, width: 30, points: [{ x: 40, y: 60 }] }],
    });
    await act(async () => owner.setPagePickerOpen(true));
    const retired = owner.pagePickerDismissed;
    const dismissed = () => retired(() => {});
    const reopen = owner.setPagePickerOpen;
    const before = owner.history;
    await act(async () => owner.choosePage(pageId));
    return { before, dismissed, reopen };
  }

  it('holds history and the input lease through actual dismissal and its next frame', async () => {
    const { before, dismissed, reopen } = await choose();
    expect(owner.pagePickerOpen).toBe(false);
    expect(owner.history).toBe(before);
    expect(owner.commandBusy).toBe(true);
    await send('start', event([touch(9, 50, 60, 100)]));
    await send('end', event([], [touch(9, 70, 80, 200)], { 9: 100 }));
    expect(owner.history).toBe(before);
    expect(owner.drawing).toBe(false);
    await act(async () => {
      owner.choosePage('flower');
      dismissed();
      dismissed();
    });
    expect(owner.history).toBe(before);
    expect(owner.commandBusy).toBe(true);
    expect(sdk.frames.size).toBe(1);
    await act(async () => {
      owner.setPagePickerOpen(true);
      reopen(true);
    });
    expect(owner.pagePickerOpen).toBe(false);
    expect(owner.history).toBe(before);
    expect(sdk.frames.size).toBe(1);
    await settle();
    expect(owner.history.drawing.pageId).toBe('turtle');
    expect(owner.history.undo).toEqual([before.drawing]);
    expect(owner.notice).toBe('Little turtle ready.');
    expect(owner.commandBusy).toBe(false);
    const selected = owner.history;
    await send('start', event([touch(10, 50, 60, 300)]));
    await send('end', event([], [touch(10, 70, 80, 400)], { 10: 300 }));
    expect(owner.history.drawing.strokes).toHaveLength(selected.drawing.strokes.length + 1);
    const completed = owner.history;
    await act(async () => dismissed());
    await settle();
    expect(owner.history).toBe(completed);
  });

  it('does not select anything when a picker merely closes', async () => {
    await settle();
    const before = owner.history;
    await act(async () => owner.setPagePickerOpen(true));
    const retired = owner.pagePickerDismissed;
    const dismissed = () => retired(() => {});
    await act(async () => owner.setPagePickerOpen(false));
    await act(async () => dismissed());
    await settle();
    expect(owner.history).toBe(before);
    expect(owner.commandBusy).toBe(false);
  });

  it('ignores a previous picker dismissal while a new choice waits', async () => {
    const first = await choose();
    await act(async () => first.dismissed());
    await settle();
    const second = await choose('flower');
    await act(async () => first.dismissed());
    await settle();
    expect(owner.history).toBe(second.before);
    expect(owner.commandBusy).toBe(true);
    await act(async () => second.dismissed());
    await settle();
    expect(owner.history.drawing.pageId).toBe('flower');
    expect(owner.history.undo).toEqual([...second.before.undo, second.before.drawing]);
  });

  it('keeps the picker open and releases its lease when page readiness fails', async () => {
    const readiness = vi
      .spyOn(offlineLibrary, 'openPage')
      .mockRejectedValue(new Error('Page unavailable.'));
    try {
      const { before } = await choose();
      expect(owner.pagePickerOpen).toBe(true);
      expect(owner.history).toBe(before);
      expect(owner.commandBusy).toBe(false);
      expect(owner.failure.detail).toBe('Page unavailable.');
      let release;
      expect(() => {
        release = owner.surface.current.lockInput();
      }).not.toThrow();
      release();
    } finally {
      readiness.mockRestore();
    }
  });

  it('cancels a choice if its picker closes while readiness is pending', async () => {
    let ready;
    const readiness = vi.spyOn(offlineLibrary, 'openPage').mockImplementation(
      () =>
        new Promise((resolve) => {
          ready = resolve;
        })
    );
    try {
      const { before, dismissed } = await choose();
      expect(owner.pagePickerOpen).toBe(true);
      await act(async () => {
        owner.setPagePickerOpen(false);
        dismissed();
        ready();
      });
      await settle();
      expect(owner.history).toBe(before);
      expect(owner.commandBusy).toBe(false);
    } finally {
      readiness.mockRestore();
    }
  });

  it.each(['dismissal', 'frame', 'completed frame'])(
    'cancels feature-disabled selection during %s',
    async (phase) => {
      const { before, dismissed } = await choose();
      if (phase !== 'dismissal') await act(async () => dismissed());
      const lateFrames = [...sdk.frames.values()];
      await act(async () => {
        if (phase === 'completed frame') {
          sdk.frames.clear();
          lateFrames.forEach((frame) => frame(0));
        }
        owner.setColoringBookEnabled(false);
        if (phase === 'completed frame') owner.setColoringBookEnabled(true);
      });
      await act(async () => {
        dismissed();
        lateFrames.forEach((frame) => frame(0));
      });
      await settle();
      expect(owner.history).toBe(before);
      expect(owner.commandBusy).toBe(false);
    }
  );

  it.each(['dismissal', 'frame', 'completed frame'])(
    'cancels an unmounted selection during %s',
    async (phase) => {
      const { before, dismissed } = await choose();
      const history = historyOwner.historyRef;
      if (phase !== 'dismissal') await act(async () => dismissed());
      const lateFrames = [...sdk.frames.values()];
      await act(async () => {
        if (phase === 'completed frame') {
          sdk.frames.clear();
          lateFrames.forEach((frame) => frame(0));
        }
        flushSync(() => root.render(null));
      });
      await act(async () => {
        dismissed();
        lateFrames.forEach((frame) => frame(0));
      });
      expect(history.current).toBe(before);
      expect(sdk.frames.size).toBe(0);
    }
  );
});

function webPagePreparation() {
  const requests = [];
  sdk.pageArt = createLazyExport(() =>
    new Promise((resolve, reject) => requests.push({ resolve, reject })).then(() => ({
      PageArtMotion,
      prepareColoringPage,
    }))
  );
  return requests;
}

describe('web page preparation through the production command owner', () => {
  async function select() {
    await open({
      ...legacyDrawing(),
      strokes: [{ brush: 'magic', rainbow: 0, width: 30, points: [{ x: 40, y: 60 }] }],
    });
    const requests = webPagePreparation();
    await act(async () => owner.setPagePickerOpen(true));
    const before = owner.history;
    const paper = owner.surface.current;
    const lock = paper.lockInput;
    const releases = vi.fn();
    vi.spyOn(paper, 'lockInput').mockImplementation(() => {
      const release = lock();
      return () => {
        release();
        releases();
      };
    });
    await act(async () => owner.choosePage('turtle'));
    expect(requests).toHaveLength(1);
    expect(owner.history).toBe(before);
    expect(owner.pagePickerOpen).toBe(true);
    expect(owner.commandBusy).toBe(true);
    return { requests, before, releases };
  }

  it('holds existing history through resource rejection, retry, picker retirement and its frame', async () => {
    const { requests, before, releases } = await select();
    await act(async () => requests[0].reject(new Error('Page Art chunk unavailable.')));
    expect(owner.history).toBe(before);
    expect(owner.pagePickerOpen).toBe(true);
    expect(owner.commandBusy).toBe(false);
    expect(owner.failure.detail).toBe('Page Art chunk unavailable.');
    expect(releases).toHaveBeenCalledOnce();
    await act(async () => owner.choosePage('turtle'));
    expect(requests).toHaveLength(2);
    await act(async () => requests[1].resolve());
    expect(owner.pagePickerOpen).toBe(false);
    expect(owner.history).toBe(before);
    expect(owner.commandBusy).toBe(true);
    await act(async () => owner.pagePickerDismissed(() => {}));
    expect(owner.history).toBe(before);
    await settle();
    expect(owner.history.drawing.pageId).toBe('turtle');
    expect(owner.history.undo).toEqual([before.drawing]);
    expect(owner.commandBusy).toBe(false);
    expect(releases).toHaveBeenCalledTimes(2);
  });

  it.each(['close', 'disable', 'unmount'])(
    'cancels held resource preparation on %s without resurrecting art',
    async (action) => {
      const { requests, releases } = await select();
      await act(async () => {
        if (action === 'close') owner.setPagePickerOpen(false);
        if (action === 'disable') owner.setColoringBookEnabled(false);
        if (action === 'unmount') root.unmount();
      });
      const cancelled = historyOwner.historyRef.current;
      await act(async () => requests[0].resolve());
      await settle();
      expect(historyOwner.historyRef.current).toBe(cancelled);
      expect(releases).toHaveBeenCalledOnce();
    }
  );
});
