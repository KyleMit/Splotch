import { useRef, useState, type RefObject } from 'react';
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
import { inkPngIsEmpty } from './drawing/inkCoverage';
import { COLORING_PAGES, type PageId } from './drawing/pages';

export function useDrawingScreen() {
  const [history, renderHistory] = useState(createHistory);
  const historyRef = useRef(history);
  const [color, setColor] = useState<PaletteLabel>('Purple');
  const [brush, setBrush] = useState<Brush>('marker');
  const [preparing, setPreparing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Pick a color and draw.');
  const [pictures, setPictures] = useState<SavedPicture[] | null>(null);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const surface = useRef<DrawingSurfaceHandle>(null);
  const disabled = drawing || busy || preparing || pagePickerOpen;

  function setHistory(next: History | ((current: History) => History)) {
    const value = typeof next === 'function' ? next(historyRef.current) : next;
    historyRef.current = value;
    renderHistory(value);
  }

  const { command, runCommand, undo, clear } = useSurfaceCommands({
    historyRef,
    setHistory,
    surface,
    setBusy,
    setNotice,
    report,
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
    if (command.current) return;
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
      await exportPng(base64);
      setNotice('PNG ready. Your picture is still here.');
    });
  }

  function showPictures() {
    if (command.current) return;
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

  return {
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

function useSurfaceCommands({
  historyRef,
  setHistory,
  surface,
  setBusy,
  setNotice,
  report,
}: {
  historyRef: RefObject<History>;
  setHistory: (next: History | ((current: History) => History)) => void;
  surface: RefObject<DrawingSurfaceHandle | null>;
  setBusy: (busy: boolean) => void;
  setNotice: (notice: string) => void;
  report: (error: unknown) => void;
}) {
  const command = useRef(false);
  async function runCommand(action: () => Promise<void>) {
    if (command.current) return;
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
    if (command.current) return;
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
      const pixels = snapshot.drawing.strokes.length
        ? await surface.current?.captureInk(snapshot.drawing)
        : null;
      if (snapshot.drawing.strokes.length && !pixels)
        throw new Error('The drawing paper is not ready to check.');
      const empty = pixels ? await inkPngIsEmpty(pixels) : true;
      if (historyRef.current !== snapshot)
        throw new Error('The picture changed before Clear finished. Please try again.');
      setHistory(clearDrawing(snapshot, empty));
      setNotice('Pick a color and draw.');
    });
  }

  return { command, runCommand, undo, clear };
}
