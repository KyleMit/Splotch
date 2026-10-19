// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addStrokes,
  createHistory,
  emptyDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { parseDrawing } from '../../experiments/native-architecture/src/drawing/drawingFormat.ts';
import {
  adoptPaper,
  LEGACY_PAPER,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { useRendererRecovery } from '../../experiments/native-architecture/src/useRendererRecovery.ts';

const fixture = parseDrawing({
  version: 3,
  pageId: 'flower',
  rainbow: 5,
  strokes: [
    { brush: 'magic', rainbow: 5, points: [{ x: 100, y: 100 }] },
    { brush: 'eraser', points: [{ x: 960, y: 740 }] },
  ],
});
let host, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('generation and real input/command admission', () => {
  function harness() {
    let recovery;
    const rendererFault = { current: false },
      command = { current: false };
    const release = vi.fn(),
      lockInput = vi.fn(() => release);
    const options = {
      rendererFault,
      command,
      blocked: false,
      surface: { current: { lockInput } },
      setPreparing: vi.fn(),
      setDrawing: vi.fn(),
      finishCohort: vi.fn(),
      report: vi.fn(),
      setNotice: vi.fn(),
    };
    function Consumer() {
      recovery = useRendererRecovery(options);
      return null;
    }
    act(() => root.render(createElement(Consumer)));
    return {
      options,
      release,
      lockInput,
      get: () => recovery,
      render: () => act(() => root.render(createElement(Consumer))),
    };
  }
  it('ignores every old renderer callback and a duplicate Retry before React commits', () => {
    const h = harness(),
      old = h.get();
    act(() => old.callbacks.onRendererFault(new Error('fault')));
    expect(h.get().generation).toBe(1);
    expect(h.get().failed).toBe(false);
    expect(h.lockInput).not.toHaveBeenCalled();
    act(() => h.get().callbacks.onRendererFault(new Error('persistent fault')));
    const retry = h.get().retry;
    act(() => {
      retry();
      retry();
    });
    expect(h.lockInput).toHaveBeenCalledTimes(1);
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.get().generation).toBe(2);
    const counts = [h.options.setPreparing.mock.calls.length, h.options.report.mock.calls.length];
    act(() => {
      old.callbacks.onPreparingChange(false);
      old.callbacks.onRendererFault(new Error('late'));
      old.callbacks.onDrawingChange(true);
      old.callbacks.onCohort([fixture.strokes[0]], LEGACY_PAPER);
      old.callbacks.onError(new Error('late ordinary'));
    });
    expect(h.options.setPreparing).toHaveBeenCalledTimes(counts[0]);
    expect(h.options.report).toHaveBeenCalledTimes(counts[1]);
    expect(h.options.setDrawing).not.toHaveBeenCalled();
    expect(h.options.finishCohort).not.toHaveBeenCalled();
    act(() => h.get().callbacks.onPreparingChange(false));
    expect(h.options.setPreparing).toHaveBeenLastCalledWith(false);
  });
  it('forwards the identical adopted paper atomically and refuses its stale generation and unmounted callbacks', () => {
    const h = harness();
    const paper = adoptPaper(342, 256.5, 1);
    const strokes = [{ brush: 'pen', color: 'Red', width: 22, points: [{ x: 200, y: 300 }] }];
    const initial = createHistory(emptyDrawing());
    let history = initial;
    h.options.finishCohort.mockImplementation((ink, reference) => {
      history = addStrokes(history, ink, reference);
    });
    const old = h.get();
    act(() => old.callbacks.onCohort(strokes, paper));
    expect(h.options.finishCohort).toHaveBeenLastCalledWith(strokes, paper);
    expect(h.options.finishCohort.mock.calls[0][0]).toBe(strokes);
    expect(h.options.finishCohort.mock.calls[0][1]).toBe(paper);
    expect(history.drawing.paper).toBe(paper);
    expect(history.undo).toEqual([initial.drawing]);
    const committed = history;
    act(() => old.callbacks.onRendererFault(new Error('fault')));
    act(() => h.get().callbacks.onRendererFault(new Error('persistent fault')));
    act(() => h.get().retry());
    act(() => old.callbacks.onCohort(strokes, paper));
    expect(history).toBe(committed);
    expect(h.options.finishCohort).toHaveBeenCalledOnce();
    const current = h.get();
    act(() => current.callbacks.onCohort(strokes, paper));
    expect(h.options.finishCohort).toHaveBeenCalledTimes(2);
    expect(history.drawing.paper).toBe(paper);
    const afterRetry = history;
    act(() => root.render(null));
    act(() => current.callbacks.onCohort(strokes, paper));
    expect(history).toBe(afterRetry);
    expect(h.options.finishCohort).toHaveBeenCalledTimes(2);
  });
  it('refuses command/modal admission and an actual active-contact lock failure after silent recovery without losing the persistent fault', () => {
    const h = harness();
    act(() => h.get().callbacks.onRendererFault(new Error('fault')));
    act(() => h.get().callbacks.onRendererFault(new Error('persistent fault')));
    h.options.command.current = true;
    act(() => h.get().retry());
    expect(h.lockInput).not.toHaveBeenCalled();
    h.options.command.current = false;
    h.options.blocked = true;
    h.render();
    act(() => h.get().retry());
    expect(h.lockInput).not.toHaveBeenCalled();
    h.options.blocked = false;
    h.render();
    h.lockInput.mockImplementationOnce(() => {
      throw new Error('active contact');
    });
    act(() => h.get().retry());
    expect(h.get().generation).toBe(1);
    expect(h.get().failed).toBe(true);
    expect(h.options.rendererFault.current).toBe(true);
    expect(h.options.report).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'active contact' })
    );
  });
});
