import { useCallback, useReducer, useRef, useState } from 'react';
import type { View } from 'react-native';
import type { PaperSize } from './drawing/paperSpace';
import { createSaveFailure } from './export/saveFailure';
import { savePicture } from './keepPicture';

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
  const [owner] = useState(() => createSaveFailure(savePicture, publish));
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
