import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, root } from './rsd-native-selection-host.mjs';
import { AppRestartRoot } from '../../../experiments/native-architecture/src/product/AppRestart.tsx';
import {
  DrawingSessionProvider,
  useDrawingHistory,
  useStartOver,
} from '../../../experiments/native-architecture/src/product/DrawingSession.tsx';
import { drawingDraftStorage } from '../../../experiments/native-architecture/src/platform/drawingDraft.ts';
import { FRESH_START_PARAM } from '../../../experiments/native-architecture/src/platform/appRestart.web.ts';
import {
  decodeDrawingDraft,
  encodeDrawingDraft,
} from '../../../experiments/native-architecture/src/product/drawingDraft.ts';
import {
  createHistory,
  emptyDrawing,
} from '../../../experiments/native-architecture/src/drawing/model.ts';

// The web export's restart, which reloads the page rather than remounting the tree.
vi.mock(
  '../../../experiments/native-architecture/src/platform/appRestart.ts',
  () => import('../../../experiments/native-architecture/src/platform/appRestart.web.ts')
);

// A picture in progress, told from a fresh page by its rainbow brush's position.
const RAINBOW_IN_USE = 7;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
});

describe("the web export's Start over", () => {
  // Negative control: with the mark kept in the refused session storage, or a fresh launch that
  // reads the draft back, the reloaded page returns the picture the fault left.
  it('reloads to a blank page when session storage and the blank draft write both refuse', async () => {
    const refuse = () => {
      throw new Error('Storage is disabled');
    };
    vi.stubGlobal('sessionStorage', { getItem: refuse, setItem: refuse, removeItem: refuse });
    const store = { snapshot: null, refuse: false };
    vi.spyOn(drawingDraftStorage, 'read').mockImplementation(async () => store.snapshot);
    vi.spyOn(drawingDraftStorage, 'write').mockImplementation(async (snapshot) => {
      if (store.refuse) throw new Error('The draft store is full.');
      store.snapshot = snapshot;
    });
    const assigned = [];
    vi.spyOn(location, 'assign').mockImplementation((url) => assigned.push(url));
    let app;
    function Probe() {
      const history = useDrawingHistory();
      app = { history: history.history, setHistory: history.setHistory, startOver: useStartOver() };
      return null;
    }
    const page = () =>
      createElement(
        AppRestartRoot,
        null,
        createElement(DrawingSessionProvider, null, createElement(Probe))
      );

    await mount(page());
    const drawn = emptyDrawing(RAINBOW_IN_USE);
    await act(async () => app.setHistory(createHistory(drawn)));
    expect(decodeDrawingDraft(store.snapshot)).toEqual(drawn);
    store.refuse = true;
    await act(async () => app.startOver());
    expect(assigned).toEqual([`/?${FRESH_START_PARAM}=1`]);
    expect(store.snapshot).toBe(encodeDrawingDraft(drawn));

    // The browser loads the address it was sent to: a new page, with the old draft still stored.
    await act(async () => root.unmount());
    history.replaceState(null, '', assigned[0]);
    await mount(page());
    expect(app.history.drawing).toEqual(emptyDrawing());
    expect(location.search).toBe('');
  });
});
