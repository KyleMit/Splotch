import { act, createElement, createRef } from 'react';
import { expect, it, vi } from 'vitest';
import { mount } from './rsd-native-selection-host.mjs';
import {
  DrawingSessionProvider,
  useDrawingHistory,
} from '../../../experiments/native-architecture/src/product/DrawingSession.tsx';
import { useRendererRecovery } from '../../../experiments/native-architecture/src/useRendererRecovery.ts';
import { addStrokes } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { adoptPaper } from '../../../experiments/native-architecture/src/drawing/paperSpace.ts';

it('restores one lost renderer silently and preserves session ink and Undo through a persistent fault', async () => {
  let recovery, session;
  const surface = createRef();
  const rendererFault = createRef();
  const command = createRef();
  const report = vi.fn();
  function Probe() {
    session = useDrawingHistory();
    recovery = useRendererRecovery({
      surface,
      rendererFault,
      command,
      blocked: false,
      setPreparing: vi.fn(),
      setDrawing: vi.fn(),
      report,
      setNotice: vi.fn(),
      finishCohort: (strokes, paper) =>
        session.setHistory((history) => addStrokes(history, strokes, paper)),
    });
    return null;
  }
  await mount(createElement(DrawingSessionProvider, null, createElement(Probe)));
  await act(async () =>
    recovery.callbacks.onCohort(
      [{ brush: 'pen', color: 'Red', width: 8, points: [{ x: 100, y: 100 }] }],
      adoptPaper(402, 700, 1)
    )
  );
  const ink = session.history;
  const original = recovery.callbacks;
  await act(async () => original.onRendererFault(new Error('Lost context.')));
  expect(recovery.generation).toBe(1);
  expect(recovery.failed).toBe(false);
  expect(report).not.toHaveBeenCalled();
  expect(session.history).toBe(ink);
  await act(async () => original.onRendererFault(new Error('Stale context.')));
  expect(recovery.generation).toBe(1);
  await act(async () => recovery.callbacks.onRendererFault(new Error('Still lost.')));
  expect(recovery.failed).toBe(true);
  expect(report).toHaveBeenCalledOnce();
  expect(surface.current).toBeNull();
  await act(async () => recovery.retry());
  expect(recovery.generation).toBe(2);
  expect(recovery.failed).toBe(false);
  expect(session.history).toBe(ink);
  expect(session.history.undo).toHaveLength(1);
  await act(async () => recovery.callbacks.onPreparingChange(false));
  await act(async () => recovery.callbacks.onRendererFault(new Error('Later context.')));
  expect(recovery.generation).toBe(3);
  expect(recovery.failed).toBe(false);
});
