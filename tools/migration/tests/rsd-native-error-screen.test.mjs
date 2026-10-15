import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { caller, host, mount, records } from './rsd-native-selection-host.mjs';
import { flat, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import {
  ERROR_COPY_MAX_WIDTH_PX,
  ERROR_DOTTIE_PX,
  ERROR_RESTART_MIN_WIDTH_PX,
  ERROR_SCREEN_COPY,
  RsdCrashScreen,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdErrorScreen.tsx';
import { displayFontSize } from '../../../experiments/native-architecture/src/rsdDrawing/displayType.ts';
import { AppRestartRoot } from '../../../experiments/native-architecture/src/product/AppRestart.tsx';
import {
  DrawingSessionProvider,
  useDrawingHistory,
  useStartOver,
} from '../../../experiments/native-architecture/src/product/DrawingSession.tsx';
import {
  createHistory,
  emptyDrawing,
} from '../../../experiments/native-architecture/src/drawing/model.ts';
import { inkedDrawing } from './rsd-native-clear-fixture.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
const SHIPPING_ERROR_SCREEN = readFileSync(
  join(import.meta.dirname, '../../../web/src/lib/components/ErrorScreen.svelte'),
  'utf8'
);

afterEach(() => {
  delete caller.exportPng;
});

const errorScreen = () =>
  [...host.querySelectorAll('[role="alert"]')].find((node) =>
    node.textContent.startsWith(ERROR_SCREEN_COPY.title)
  ) ?? null;
const startOver = () =>
  [...errorScreen().querySelectorAll('[role="button"]')].find(
    (node) => node.textContent === ERROR_SCREEN_COPY.restart
  );

function rendererFault(recovery) {
  const detail = 'The drawing paper stopped drawing.';
  return toolbarScreen({
    notice: detail,
    failure: { kind: 'error', detail },
    recovery: { failed: true, retryDisabled: false, retry: vi.fn(), ...recovery },
  });
}

describe("the drawing screen's Error Screen", () => {
  it('wears the shipping font when the failed drawing screen cannot provide it', async () => {
    await mount(createElement(RsdCrashScreen, { onRestart: vi.fn(async () => {}) }));
    const copy = records.props.findLast(
      (props) => props.children?.[0] === ERROR_SCREEN_COPY.lines[0]
    );
    expect(flat(copy?.style)?.fontFamily).toMatch(/Quicksand/);
  });

  it('keeps the copy and literals ErrorScreen.svelte writes', () => {
    const markup = SHIPPING_ERROR_SCREEN.replace(/\s+/g, ' ');
    expect(markup).toContain(`<title>${ERROR_SCREEN_COPY.documentTitle}</title>`);
    expect(markup).toContain(`<h1>${ERROR_SCREEN_COPY.title}</h1>`);
    expect(markup).toContain(`<p>${ERROR_SCREEN_COPY.lines.join('<br />')}</p>`);
    expect(markup).toMatch(new RegExp(`>${ERROR_SCREEN_COPY.restart}</button>`));
    expect(markup).toContain(`const DOTTIE_SIZE_PX = ${ERROR_DOTTIE_PX};`);
    expect(markup).toContain(`max-width: ${ERROR_COPY_MAX_WIDTH_PX}px;`);
    expect(markup).toContain('dottie-stumped.svg');
    expect(markup).toContain(`min-width: ${ERROR_RESTART_MIN_WIDTH_PX}px;`);
  });

  it('shows a renderer fault with the shipping fresh-drawing action rather than a renderer Retry', async () => {
    const screen = rendererFault();
    await mountToolbar(screen);
    expect(errorScreen()).not.toBeNull();
    expect(errorScreen().textContent).toContain(ERROR_SCREEN_COPY.title);
    expect(errorScreen().textContent).toContain(ERROR_SCREEN_COPY.lines.join('\n'));
    expect(host.textContent).not.toContain('Retry drawing');
    expect(host.querySelector('[data-testid="rsd-failure-banners"]')).toBeNull();
    const title = records.props.findLast(
      (props) => props.children === ERROR_SCREEN_COPY.title || props.children?.[0] === 'Oops!'
    );
    expect(flat(title?.style)?.fontSize).toBe(displayFontSize(records.dimensions.width));
    await act(async () => startOver().click());
    expect(screen.recovery.retry).not.toHaveBeenCalled();
    expect(startOver().disabled).toBe(true);
  });

  it('stays away while the paper draws', async () => {
    await mountToolbar(toolbarScreen());
    expect(errorScreen()).toBeNull();
  });

  it.each(['page picker', 'command'])(
    'starts a fresh native session after persistent renderer failure while a %s is open',
    async (blocker) => {
      caller.realScreen = true;
      const launches = vi.fn();
      let session, finishCapture;
      function Probe() {
        session = useDrawingHistory();
        useEffect(launches, []);
        return createElement(RsdDrawingScreen);
      }
      await mount(
        createElement(
          AppRestartRoot,
          null,
          createElement(DrawingSessionProvider, null, createElement(Probe))
        )
      );
      await act(async () =>
        session.setHistory({ drawing: inkedDrawing(), undo: [emptyDrawing()] })
      );
      let clearing;
      if (blocker === 'page picker') {
        await act(async () => caller.liveScreen.setPagePickerOpen(true));
      } else {
        caller.exportPng = () =>
          new Promise((resolve) => {
            finishCapture = resolve;
          });
        await act(async () => {
          clearing = caller.liveScreen.clear(true);
        });
      }
      expect(caller.liveScreen.pagePickerOpen).toBe(blocker === 'page picker');
      expect(caller.liveScreen.commandBusy).toBe(blocker === 'command');
      await act(async () =>
        caller.liveScreen.recovery.callbacks.onRendererFault(new Error('Lost renderer.'))
      );
      expect(caller.liveScreen.recovery.failed).toBe(false);
      await act(async () =>
        caller.liveScreen.recovery.callbacks.onRendererFault(new Error('Still lost.'))
      );
      expect(errorScreen()).not.toBeNull();
      const departed = session;
      await act(async () => startOver().click());
      expect(launches).toHaveBeenCalledTimes(2);
      expect(errorScreen()).toBeNull();
      expect(session.history).toEqual(createHistory());
      expect(session.setHistory).not.toBe(departed.setHistory);
      expect(caller.liveScreen.pagePickerOpen).toBe(false);
      expect(caller.liveScreen.commandBusy).toBe(false);
      if (finishCapture) {
        await act(async () => {
          finishCapture('cmVhbC1wbmc=');
          await clearing;
        });
      }
      expect(session.history).toEqual(createHistory());
    }
  );

  it('clears native ink and Undo, then remounts a fresh session on Start over', async () => {
    const launches = vi.fn();
    let session;
    function Probe() {
      const history = useDrawingHistory();
      const restart = useStartOver();
      session = { ...history, restart };
      useEffect(launches, []);
      return null;
    }
    await mount(
      createElement(
        AppRestartRoot,
        null,
        createElement(DrawingSessionProvider, null, createElement(Probe))
      )
    );
    await act(async () => session.setHistory({ drawing: inkedDrawing(), undo: [emptyDrawing()] }));
    expect(session.history.drawing.strokes).toHaveLength(1);
    expect(session.history.undo).toHaveLength(1);
    const departed = session;
    await act(async () => session.restart());
    expect(launches).toHaveBeenCalledTimes(2);
    expect(departed.historyRef.current).toEqual(createHistory());
    expect(session.history).toEqual(createHistory());
    expect(session.setHistory).not.toBe(departed.setHistory);
  });
});
