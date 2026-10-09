import { useRef, useState } from 'react';
import type { PaletteLabel } from './drawing/palette';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import { addStroke, commitDrawing, createHistory, type Stroke } from './drawing/model';
import type { Brush } from './drawing/brushes';
import {
  exportPng,
  listPictures,
  reopenPicture,
  savePicture,
  type SavedPicture,
} from './platform/drawingFiles';
export function useDrawingScreen() {
  const [history, setHistory] = useState(createHistory);
  const historyRef = useRef(history);
  historyRef.current = history;
  const [color, setColor] = useState<PaletteLabel>('Purple');
  const [brush, setBrush] = useState<Brush>('marker');
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Pick a color and draw.');
  const [pictures, setPictures] = useState<SavedPicture[] | null>(null);
  const surface = useRef<DrawingSurfaceHandle>(null);
  const disabled = drawing || busy;

  function report(error: unknown) {
    setNotice(
      error instanceof Error ? error.message : 'That did not finish. Your picture is still here.'
    );
  }

  function finishStroke(stroke: Stroke) {
    try {
      const next = addStroke(historyRef.current, stroke);
      historyRef.current = next;
      setHistory(next);
      setNotice('');
    } catch (error) {
      report(error);
    }
  }

  async function save() {
    const snapshot = historyRef.current.drawing;
    setBusy(true);
    try {
      await savePicture(snapshot);
      setNotice('Picture saved on this device.');
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }

  async function exportPicture() {
    const snapshot = historyRef.current.drawing;
    setBusy(true);
    try {
      const base64 = await surface.current?.capturePng(snapshot);
      if (!base64) throw new Error('The drawing paper is not ready to export.');
      await exportPng(base64);
      setNotice('PNG ready. Your picture is still here.');
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }

  function showPictures() {
    try {
      setPictures(listPictures());
      setNotice('');
    } catch (error) {
      report(error);
    }
  }

  async function openPicture(picture: SavedPicture) {
    setBusy(true);
    setNotice('');
    try {
      const saved = await reopenPicture(picture.id);
      setHistory((current) => commitDrawing(current, saved));
      setPictures(null);
      setNotice('Picture opened. Undo returns to your previous picture.');
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }

  return {
    history,
    setHistory,
    color,
    setColor,
    brush,
    setBrush,
    drawing,
    setDrawing,
    busy,
    notice,
    pictures,
    setPictures,
    surface,
    disabled,
    report,
    finishStroke,
    save,
    exportPicture,
    showPictures,
    openPicture,
  };
}
