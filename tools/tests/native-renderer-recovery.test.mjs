// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
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
  vi.clearAllMocks();
});

describe('generation and real input/command admission', () => {
  function harness() {
    let recovery;
    const rendererFault = { current: false },
      command = { current: false };
    const release = vi.fn(),
      lockInput = vi.fn(() => release);
    const options = {
      isCurrent: () => true,
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
    const retry = h.get().retry;
    act(() => {
      retry();
      retry();
    });
    expect(h.lockInput).toHaveBeenCalledTimes(1);
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.get().generation).toBe(1);
    const counts = [h.options.setPreparing.mock.calls.length, h.options.report.mock.calls.length];
    act(() => {
      old.callbacks.onPreparingChange(false);
      old.callbacks.onRendererFault(new Error('late'));
      old.callbacks.onDrawingChange(true);
      old.callbacks.onCohort([fixture.strokes[0]]);
      old.callbacks.onError(new Error('late ordinary'));
    });
    expect(h.options.setPreparing).toHaveBeenCalledTimes(counts[0]);
    expect(h.options.report).toHaveBeenCalledTimes(counts[1]);
    expect(h.options.setDrawing).not.toHaveBeenCalled();
    expect(h.options.finishCohort).not.toHaveBeenCalled();
    act(() => h.get().callbacks.onPreparingChange(false));
    expect(h.options.setPreparing).toHaveBeenLastCalledWith(false);
  });
  it('rejects renderer faults after the actual consumer unmounts', () => {
    const h = harness();
    const old = h.get();
    act(() => root.render(null));
    act(() => old.callbacks.onRendererFault(new Error('unmounted renderer')));
    expect(h.options.rendererFault.current).toBe(false);
    expect(h.options.report).not.toHaveBeenCalled();
    expect(h.options.setPreparing).not.toHaveBeenCalled();
  });
  it('refuses command/modal admission and an actual active-contact lock failure without losing the fault', () => {
    const h = harness();
    act(() => h.get().callbacks.onRendererFault(new Error('fault')));
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
    expect(h.get().generation).toBe(0);
    expect(h.get().failed).toBe(true);
    expect(h.options.rendererFault.current).toBe(true);
    expect(h.options.report).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'active contact' })
    );
  });
});
