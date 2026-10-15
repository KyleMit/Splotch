import { SCREENSHOT_COOLDOWN_MS } from '../../../web/src/lib/drawing/screenshotTiming';
import type { History } from './drawing/model';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import { isUnsaved, type UnsavedOutcome } from './export/pictureSave';
import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from 'react';
import type { View } from 'react-native';
import { drawingPaperSize, type PaperSize } from './drawing/paperSpace';
import { createSaveFailure } from './export/saveFailure';
import { capturePicture, savePicture } from './keepPicture';
import { unsavedPictureStore } from './platform/unsavedPictures';

// One save's polaroid: the captured PNG it shows, the paper it was drawn on, and whether the
// save failed under it, which takes it back mid-flight.
export type PolaroidFlight = Readonly<{
  id: number;
  pngBase64: string;
  paper: PaperSize;
  discarded: boolean;
}>;

// The screen's Save Failure Banner owner; Try again saves through the same platform save.
export function useSaveFailure() {
  const [, publish] = useReducer((count: number) => count + 1, 0);
  const [owner] = useState(() => createSaveFailure(savePicture, publish, unsavedPictureStore));
  useEffect(() => {
    void owner.restore();
  }, [owner]);
  return owner;
}

// The polaroid the Save screenshot button sends up, starting from that button's tile.
export function usePolaroidFlights() {
  const [flight, setFlight] = useState<PolaroidFlight | null>(null);
  const nextId = useRef(0);
  const cameraTile = useRef<View>(null);
  // The flight finishes through `land`, so it keeps one identity for the flight's lifetime.
  const land = useCallback(
    (id: number) => setFlight((current) => (current?.id === id ? null : current)),
    []
  );
  return {
    flight,
    cameraTile,
    land,
    launch(pngBase64: string, paper: PaperSize) {
      nextId.current += 1;
      const id = nextId.current;
      setFlight({ id, pngBase64, paper, discarded: false });
      return id;
    },
    discard(id: number) {
      setFlight((current) => (current?.id === id ? { ...current, discarded: true } : current));
    },
  };
}

export function useSaveAction({
  historyRef,
  surface,
  runCommand,
  setNotice,
  flights,
  reportSaveFailure,
}: {
  historyRef: RefObject<History>;
  surface: RefObject<DrawingSurfaceHandle | null>;
  runCommand: (action: () => Promise<void>) => Promise<void>;
  setNotice: (notice: string) => void;
  flights: ReturnType<typeof usePolaroidFlights>;
  reportSaveFailure: (outcome: UnsavedOutcome, pngBase64: string | null) => void;
}) {
  const state = useRef<{ active: Promise<void> | null; cooldownUntil: number }>({
    active: null,
    cooldownUntil: 0,
  }).current;
  async function save() {
    const capture: { started: boolean; pngBase64: string | null; flight: number | null } = {
      started: false,
      pngBase64: null,
      flight: null,
    };
    await runCommand(async () => {
      capture.started = true;
      const drawing = historyRef.current.drawing;
      capture.pngBase64 = await capturePicture(drawing, surface.current);
      if (capture.pngBase64) {
        capture.flight = flights.launch(capture.pngBase64, drawingPaperSize(drawing));
        setNotice('');
      }
    });
    if (!capture.started) return;
    const outcome = capture.pngBase64 ? await savePicture(capture.pngBase64) : 'failed';
    if (!isUnsaved(outcome)) {
      state.cooldownUntil = performance.now() + SCREENSHOT_COOLDOWN_MS;
      return;
    }
    if (capture.flight !== null) flights.discard(capture.flight);
    reportSaveFailure(outcome, capture.pngBase64);
  }
  return () => {
    if (state.active) return state.active;
    if (performance.now() < state.cooldownUntil) return Promise.resolve();
    state.active = save().finally(() => {
      state.active = null;
    });
    return state.active;
  };
}
