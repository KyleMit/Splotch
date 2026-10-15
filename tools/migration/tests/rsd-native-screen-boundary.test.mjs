import { act, createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { caller, host, mount } from './rsd-native-selection-host.mjs';
import { ProbeApp } from '../../../experiments/native-architecture/src/ProbeApp.tsx';
import { ERROR_SCREEN_COPY } from '../../../experiments/native-architecture/src/rsdDrawing/RsdErrorScreen.tsx';
import { ERROR_LOG_PREFIX } from '../../../web/src/lib/errorLog.ts';

// Shipping's root render boundary shows the Error Screen for a render error and its Start over
// renders the page again, and the drawing engine keeps its picture across that. The canonical
// root's boundary sits under the drawing session to the same end: Start over brings the screen
// back on the session's own history, Undo included, rather than a fresh launch. Negative controls:
// the boundary above DrawingSessionProvider comes back on an empty session; an Error Screen that
// keeps its tab title past Start over fails the title check.
vi.mock('../../../experiments/native-architecture/src/platform/shippingFont.tsx', () => ({
  ShippingFontGate: ({ children }) => children,
}));
// The web export's tab title, which the Error Screen names itself in while it shows.
const tab = vi.hoisted(() => ({ title: 'Splotch' }));
vi.mock('../../../experiments/native-architecture/src/platform/appPath.ts', () => ({
  currentAppPage: () => 'drawing',
  subscribeAppPage: () => () => {},
  setDocumentTitle(title) {
    const previous = tab.title;
    tab.title = title;
    return previous;
  },
}));

const fallback = vi.hoisted(() => ({ fails: false }));
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/drawingSheets.ts',
  async (load) => {
    const sheets = await load();
    return {
      ...sheets,
      RsdCrashScreen: (props) => {
        if (fallback.fails) throw new Error('The crash-screen chunk did not load.');
        return createElement(sheets.RsdCrashScreen, props);
      },
    };
  }
);

const RENDER_FAULT = new Error('A drawing screen render failed.');
const STROKES_BEFORE_FAULT = 2;
let errors;

beforeEach(() => {
  fallback.fails = false;
  caller.realScreen = true;
  caller.settingsStorage = {
    read: vi.fn(async () => '{"version":1,"soundEnabled":false}'),
    write: vi.fn(async () => {}),
  };
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  caller.paperRender.mockImplementation(() => {});
  errors.mockRestore();
});

async function settle() {
  await act(async () => {});
  await act(async () => {});
}

const paper = () => host.querySelector('[aria-label="Draw RSD fixture stroke"]');
const errorScreen = () =>
  [...host.querySelectorAll('[role="alert"]')].find((node) =>
    node.textContent.startsWith(ERROR_SCREEN_COPY.title)
  ) ?? null;
const startOver = () =>
  [...errorScreen().querySelectorAll('[role="button"]')].find(
    (node) => node.textContent === ERROR_SCREEN_COPY.restart
  );

it('shows the Error Screen for a render error and brings back the session it held', async () => {
  await mount(createElement(ProbeApp));
  await settle();
  for (let stroke = 0; stroke < STROKES_BEFORE_FAULT; stroke += 1)
    await act(async () => paper().click());

  // The stroke lands in the session, and drawing it is what fails to render.
  caller.paperRender.mockImplementation(() => {
    throw RENDER_FAULT;
  });
  await act(async () => paper().click());
  expect(errorScreen()).not.toBeNull();
  expect(errorScreen().textContent).toContain(ERROR_SCREEN_COPY.lines.join('\n'));
  expect(paper()).toBeNull();
  expect(errors).toHaveBeenCalledWith(ERROR_LOG_PREFIX.render, RENDER_FAULT);
  expect(tab.title).toBe(ERROR_SCREEN_COPY.documentTitle);
  const held = caller.liveScreen.history;
  expect(held.drawing.strokes).toHaveLength(STROKES_BEFORE_FAULT + 1);

  caller.paperRender.mockImplementation(() => {});
  await act(async () => startOver().click());
  await settle();
  expect(errorScreen()).toBeNull();
  expect(tab.title).toBe('Splotch');
  expect(paper()).not.toBeNull();
  expect(caller.liveScreen.history).toBe(held);
  expect(caller.liveScreen.history.undo).toHaveLength(STROKES_BEFORE_FAULT + 1);

  await act(async () => caller.liveScreen.undo());
  expect(caller.liveScreen.history.drawing.strokes).toHaveLength(STROKES_BEFORE_FAULT);
});

it('returns to the held session when the crash screen fails to load and its fallback closes', async () => {
  await mount(createElement(ProbeApp));
  await settle();
  await act(async () => paper().click());
  const held = caller.liveScreen.history;
  fallback.fails = true;
  caller.paperRender.mockImplementation(() => {
    throw RENDER_FAULT;
  });
  await act(async () => paper().click());
  expect(host.textContent).toContain('Did not load');
  expect(paper()).toBeNull();
  caller.paperRender.mockImplementation(() => {});
  await act(async () => host.querySelector('[aria-label="Close"]').click());
  await settle();
  expect(paper()).not.toBeNull();
  expect(caller.liveScreen.history.undo).toHaveLength(held.undo.length + 1);
});
