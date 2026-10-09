import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PaletteLabel } from './drawing/palette';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import {
  changePage,
  addStroke,
  commitDrawing,
  createHistory,
  clearDrawing,
  undoDrawing,
  type History,
  type Stroke,
} from './drawing/model';
import {
  exportPng,
  listPictures,
  reopenPicture,
  savePicture,
  type SavedPicture,
} from './platform/drawingFiles';
import type { Brush } from './drawing/brushes';
import { createInkObservation } from './drawing/inkCoverage';
import { COLORING_PAGES, type PageId } from './drawing/pages';
import { useRendererRecovery } from './useRendererRecovery';

export function useDrawingScreen() {
  const { history, historyRef, setHistory } = useDrawingHistory();
  const [color, setColor] = useState<PaletteLabel>('Purple');
  const [brush, setBrush] = useState<Brush>('marker');
  const [preparing, setPreparing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Pick a color and draw.');
  const [pictures, setPictures] = useState<SavedPicture[] | null>(null);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const surface = useRef<DrawingSurfaceHandle>(null);
  const rendererFault = useRef(false);
  const disabled = drawing || busy || preparing || pagePickerOpen;

  const { command, runCommand, undo, clear } = useSurfaceCommands({
    historyRef,
    setHistory,
    surface,
    setBusy,
    setNotice,
    report,
    blocked: () => rendererFault.current || preparing || drawing,
  });

  function report(error: unknown) {
    setNotice(
      error instanceof Error ? error.message : 'That did not finish. Your picture is still here.'
    );
  }

  function finishStroke(stroke: Stroke) {
    try {
      const next = addStroke(historyRef.current, stroke);
      setHistory(next);
      setNotice('');
    } catch (error) {
      report(error);
    }
  }

  function choosePage(pageId: PageId) {
    if (command.current || rendererFault.current || preparing || drawing || busy) return;
    const next = changePage(historyRef.current, pageId);
    if (next !== historyRef.current) {
      setHistory(next);
      setNotice(`${COLORING_PAGES[pageId].label} ready. Undo brings your picture back.`);
    }
    setPagePickerOpen(false);
  }

  async function save() {
    await runCommand(async () => {
      const snapshot = historyRef.current.drawing;
      await savePicture(snapshot);
      setNotice('Picture saved on this device.');
    });
  }

  async function exportPicture() {
    await runCommand(async () => {
      const snapshot = historyRef.current.drawing;
      const base64 = await surface.current?.capturePng(snapshot);
      if (!base64) throw new Error('The drawing paper is not ready to export.');
      if (historyRef.current.drawing !== snapshot)
        throw new Error('The picture changed before export finished. Please try again.');
      await exportPng(base64);
      setNotice('PNG ready. Your picture is still here.');
    });
  }

  function showPictures() {
    if (command.current || rendererFault.current || preparing || drawing || busy) return;
    try {
      setPictures(listPictures());
      setNotice('');
    } catch (error) {
      report(error);
    }
  }

  async function openPicture(picture: SavedPicture) {
    await runCommand(async () => {
      setNotice('');
      const saved = await reopenPicture(picture.id);
      setHistory((current) => commitDrawing(current, saved));
      setPictures(null);
      setNotice('Picture opened. Undo returns to your previous picture.');
    });
  }

  const recovery = useRendererRecovery({
    surface,
    rendererFault,
    command,
    blocked: drawing || busy || pagePickerOpen || pictures !== null,
    setPreparing,
    setDrawing,
    finishStroke,
    report,
    setNotice,
  });

  return {
    recovery,
    history,
    color,
    setColor,
    brush,
    setBrush,
    drawing,
    setDrawing,
    busy: busy || preparing,
    setPreparing,
    clear,
    undo,
    notice,
    pictures,
    setPictures,
    surface,
    pagePickerOpen,
    setPagePickerOpen,
    choosePage,
    disabled,
    report,
    finishStroke,
    save,
    exportPicture,
    showPictures,
    openPicture,
  };
}

function useDrawingHistory() {
  const [history, renderHistory] = useState(createHistory);
  const historyRef = useRef(history);
  function setHistory(next: History | ((current: History) => History)) {
    const value = typeof next === 'function' ? next(historyRef.current) : next;
    historyRef.current = value;
    renderHistory(value);
  }
  return { history, historyRef, setHistory };
}

function useSurfaceCommands({
  historyRef,
  setHistory,
  surface,
  setBusy,
  setNotice,
  report,
  blocked,
}: {
  historyRef: RefObject<History>;
  setHistory: (next: History | ((current: History) => History)) => void;
  surface: RefObject<DrawingSurfaceHandle | null>;
  setBusy: (busy: boolean) => void;
  setNotice: (notice: string) => void;
  report: (error: unknown) => void;
  blocked: () => boolean;
}) {
  const command = useRef(false);
  const mounted = useRef(true);
  const observations = useRef<ReturnType<typeof createInkObservation> | null>(null);
  if (!observations.current) observations.current = createInkObservation();
  useEffect(() => {
    if (!observations.current) observations.current = createInkObservation();
    const owner = observations.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      owner.dispose();
      if (observations.current === owner) observations.current = null;
    };
  }, []);
  async function runCommand(action: () => Promise<void>) {
    if (command.current || blocked()) return;
    let release: (() => void) | undefined;
    try {
      if (!surface.current) throw new Error('The drawing paper is not ready.');
      release = surface.current.lockInput();
      command.current = true;
      setBusy(true);
      await action();
    } catch (error) {
      report(error);
    } finally {
      if (release) {
        release();
        command.current = false;
        setBusy(false);
      }
    }
  }

  function undo() {
    if (command.current || blocked()) return;
    let release: (() => void) | undefined;
    try {
      release = surface.current?.lockInput();
      setHistory(undoDrawing);
    } catch (error) {
      report(error);
    } finally {
      release?.();
    }
  }

  async function clear() {
    await runCommand(async () => {
      const snapshot = historyRef.current;
      const owner = surface.current;
      const isCurrent = () =>
        mounted.current &&
        command.current &&
        !blocked() &&
        historyRef.current === snapshot &&
        surface.current === owner;
      const observation = snapshot.drawing.strokes.length
        ? observations.current?.begin(isCurrent)
        : null;
      try {
        const pixels = snapshot.drawing.strokes.length
          ? await owner?.captureInk(snapshot.drawing)
          : null;
        if (snapshot.drawing.strokes.length && (!pixels || !observation))
          throw new Error('The drawing paper is not ready to check.');
        const empty = pixels && observation ? await observation.observe(pixels) : true;
        if (!isCurrent())
          throw new Error('The picture changed before Clear finished. Please try again.');
        setHistory(clearDrawing(snapshot, empty));
        setNotice('Pick a color and draw.');
      } finally {
        observation?.cancel();
      }
    });
  }

  return { command, runCommand, undo, clear };
}
