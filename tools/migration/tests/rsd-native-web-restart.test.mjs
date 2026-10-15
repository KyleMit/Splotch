import { canonicalPaper } from '../../tests/native-paper-fixtures.mjs';
import { act, createElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, root } from './rsd-native-selection-host.mjs';
import { AppRestartRoot } from '../../../experiments/native-architecture/src/product/AppRestart.tsx';
import {
  DrawingSessionProvider,
  useDrawingHistory,
  useStartOver,
} from '../../../experiments/native-architecture/src/product/DrawingSession.tsx';
import {
  createHistory,
  addStroke,
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
  it('starts each process blank while retaining ink and Undo across a screen remount', async () => {
    let app, replace;
    function Probe() {
      app = useDrawingHistory();
      return null;
    }
    function Process() {
      const [keys, setKeys] = useState({ launch: 0, screen: 0 });
      replace = setKeys;
      return createElement(
        DrawingSessionProvider,
        { key: keys.launch },
        createElement(Probe, { key: keys.screen })
      );
    }
    await mount(createElement(Process));
    expect(app.history.drawing).toEqual(emptyDrawing());
    await act(async () =>
      app.setHistory((history) =>
        addStroke(
          history,
          { brush: 'pen', width: 14, color: 'Purple', points: [{ x: 10, y: 20 }] },
          canonicalPaper()
        )
      )
    );
    expect(app.history.undo).toHaveLength(1);
    const sameSession = app.history;
    await act(async () => replace({ launch: 0, screen: 1 }));
    expect(app.history).toBe(sameSession);
    await act(async () => replace({ launch: 1, screen: 0 }));
    expect(app.history).toEqual(createHistory());
  });

  it('reloads to a blank page even when session storage refuses', async () => {
    const refuse = () => {
      throw new Error('Storage is disabled');
    };
    vi.stubGlobal('sessionStorage', { getItem: refuse, setItem: refuse, removeItem: refuse });
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
    await act(async () => app.setHistory(createHistory(emptyDrawing(RAINBOW_IN_USE))));
    await act(async () => app.startOver());
    expect(assigned).toEqual(['/']);
    await act(async () => root.unmount());
    history.replaceState(null, '', assigned[0]);
    await mount(page());
    expect(app.history.drawing).toEqual(emptyDrawing());
    expect(location.search).toBe('');
  });
});
