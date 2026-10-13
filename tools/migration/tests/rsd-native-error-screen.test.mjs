import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement, useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { host, mount, records } from './rsd-native-selection-host.mjs';
import { flat, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import {
  ERROR_COPY_MAX_WIDTH_PX,
  ERROR_DOTTIE_PX,
  ERROR_RESTART_MIN_WIDTH_PX,
  ERROR_SCREEN_COPY,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdErrorScreen.tsx';
import { displayFontSize } from '../../../experiments/native-architecture/src/rsdDrawing/displayType.ts';
import { AppRestartRoot } from '../../../experiments/native-architecture/src/product/AppRestart.tsx';
import {
  DrawingSessionProvider,
  useDrawingHistory,
  useStartOver,
} from '../../../experiments/native-architecture/src/product/DrawingSession.tsx';
import { drawingDraftStorage } from '../../../experiments/native-architecture/src/platform/drawingDraft.ts';
import { decodeDrawingDraft } from '../../../experiments/native-architecture/src/product/drawingDraft.ts';
import {
  createHistory,
  emptyDrawing,
} from '../../../experiments/native-architecture/src/drawing/model.ts';

// A picture in progress, told from a fresh page by its rainbow brush's position.
const RAINBOW_IN_USE = 7;

const SHIPPING_ERROR_SCREEN = readFileSync(
  join(import.meta.dirname, '../../../web/src/lib/components/ErrorScreen.svelte'),
  'utf8'
);

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
  it('keeps the copy and literals ErrorScreen.svelte writes', () => {
    const markup = SHIPPING_ERROR_SCREEN.replace(/\s+/g, ' ');
    expect(markup).toContain(`<h1>${ERROR_SCREEN_COPY.title}</h1>`);
    expect(markup).toContain(`<p>${ERROR_SCREEN_COPY.lines.join('<br />')}</p>`);
    expect(markup).toMatch(new RegExp(`>${ERROR_SCREEN_COPY.restart}</button>`));
    expect(markup).toContain(`const DOTTIE_SIZE_PX = ${ERROR_DOTTIE_PX};`);
    expect(markup).toContain(`max-width: ${ERROR_COPY_MAX_WIDTH_PX}px;`);
    expect(markup).toContain('dottie-stumped.svg');
    expect(markup).toContain(`min-width: ${ERROR_RESTART_MIN_WIDTH_PX}px;`);
  });

  it('shows a renderer fault on the Error Screen, whose Start over brings the paper back', async () => {
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
    // Start over is shipping's restart, not the renderer retry the banner used to offer.
    await act(async () => startOver().click());
    expect(screen.recovery.retry).not.toHaveBeenCalled();
    expect(startOver().disabled).toBe(true);
  });

  // Shipping's location.assign('/') keeps nothing of the picture: it reloads on a blank page.
  // Negative control: restarting without storing the blank page brings the old drawing back.
  it('restarts the app on a fresh drawing, the blank page stored before the remount', async () => {
    // A draft store that keeps what it is given, so the remounted app reads back the last write.
    let stored = null;
    const reads = vi.spyOn(drawingDraftStorage, 'read').mockImplementation(async () => stored);
    const writes = vi.spyOn(drawingDraftStorage, 'write').mockImplementation(async (snapshot) => {
      stored = snapshot;
    });
    const launches = [];
    let session;
    function Probe() {
      const history = useDrawingHistory();
      const startOver = useStartOver();
      session = { history: history.history, setHistory: history.setHistory, startOver };
      useEffect(() => {
        launches.push(writes.mock.calls.length);
      }, []);
      return null;
    }
    try {
      await mount(
        createElement(
          AppRestartRoot,
          null,
          createElement(DrawingSessionProvider, null, createElement(Probe))
        )
      );
      const drawn = emptyDrawing(RAINBOW_IN_USE);
      await act(async () => session.setHistory(createHistory(drawn)));
      expect(decodeDrawingDraft(stored)).toEqual(drawn);
      await act(async () => session.startOver());
      expect(launches).toHaveLength(2);
      const lastWrite = decodeDrawingDraft(writes.mock.calls.at(-1)[0]);
      expect(lastWrite).toEqual(emptyDrawing());
      expect(launches[1]).toBe(writes.mock.calls.length);
      expect(session.history.drawing).toEqual(emptyDrawing());
    } finally {
      writes.mockRestore();
      reads.mockRestore();
    }
  });

  it('stays away while the paper draws', async () => {
    await mountToolbar(toolbarScreen());
    expect(errorScreen()).toBeNull();
  });
});
