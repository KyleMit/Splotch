// @vitest-environment happy-dom
import { act, createElement, useMemo } from 'react';
import { expect, it, vi } from 'vitest';
import { root, settle } from './native-contacts-mounted-harness.mjs';
import { NativePaper } from '../../experiments/native-architecture/src/rsdDrawing/NativePaper.tsx';
import { useDrawingScreen } from '../../experiments/native-architecture/src/useDrawingScreen.ts';
import { useDrawingSound } from '../../experiments/native-architecture/src/useDrawingSound.ts';
import { DrawingSessionProvider } from '../../experiments/native-architecture/src/product/DrawingSession.tsx';
import {
  drawingPaper,
  paperProjection,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';

const renders = vi.hoisted(() => ({ surface: 0 }));

// DrawingSurface runs its commit probe once per render: the native boundary's own counter.
vi.mock('../../experiments/native-architecture/src/drawing/perfProbe.ts', async (original) => ({
  ...(await original()),
  useSurfaceCommitProbe: () => {
    renders.surface += 1;
  },
}));

const FRAME = { left: 0, top: 0, width: 1024, height: 768 };

let screen, sound;

// The drawing screen's paper as RsdPaperSlot mounts it, under the real screen and sound owners:
// every change either owner makes renders this owner and the paper with it.
function Paper() {
  screen = useDrawingScreen();
  sound = useDrawingSound();
  const paper = drawingPaper(screen.history.drawing);
  const projection = useMemo(() => paperProjection(paper), [paper]);
  return createElement(NativePaper, {
    screen,
    sound,
    menuOpen: false,
    lifted: false,
    frame: FRAME,
    projection,
  });
}

async function mountPaper() {
  await act(async () =>
    root.render(createElement(DrawingSessionProvider, null, createElement(Paper)))
  );
  await settle();
  expect(sound.settings.status).toBe('ready');
}

async function surfaceRenders(change) {
  const before = renders.surface;
  await act(async () => change());
  await settle();
  return renders.surface - before;
}

// Negative controls: rendering DrawingSurface without NativePaper's memo, or handing it a fresh
// set of renderer-recovery handlers each render (useRendererRecovery without its useMemo), renders
// the surface for each of these.
it('leaves the surface alone for a screen render that changes nothing it is handed', async () => {
  await mountPaper();
  expect(await surfaceRenders(() => screen.report(new Error('Fixture failure.')))).toBe(0);
  expect(screen.failure).not.toBeNull();
  expect(await surfaceRenders(() => screen.dismissFailure())).toBe(0);
  expect(await surfaceRenders(() => sound.owner.settings.setEnabled(false))).toBe(0);
  expect(sound.settings.soundEnabled).toBe(false);
});

// Positive control: the memo still lets through what the surface acts on.
it('renders the surface once for a paint, a width and a dialog it must act on', async () => {
  await mountPaper();
  expect(await surfaceRenders(() => sound.owner.settings.setColor('Blue'))).toBe(1);
  expect(sound.settings.selectedColor).toBe('Blue');
  expect(await surfaceRenders(() => sound.owner.settings.setWidth('drawing', 'thick'))).toBe(1);
  expect(await surfaceRenders(() => screen.openSettings())).toBe(1);
  expect(screen.settingsOpen).toBe(true);
  expect(await surfaceRenders(() => screen.closeSettings())).toBe(1);
});
