import { createContext, useContext, useState, type ReactNode } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { armTapZone, insideTapZone, tapPoint } from './tapZone';

// A press older than this did not open the dialog now opening: a programmatic open, a keyboard
// activation or a press on the paper flies in from the centre instead, as shipping's dialogs with
// no origin do.
const OPENER_PRESS_TTL_MS = 1000;

type Point = { x: number; y: number };

function createModalOrigin() {
  let last: (Point & { at: number }) | null = null;
  let zone: ReturnType<typeof armTapZone> = null;
  return {
    record(event: GestureResponderEvent) {
      last = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, at: Date.now() };
      return false;
    },
    blocks(event: GestureResponderEvent) {
      return insideTapZone(zone, tapPoint(event.nativeEvent), Date.now());
    },
    // Where the opening press landed, relative to the window centre the card settles on.
    take(window: { width: number; height: number }): Point {
      const press = last;
      last = null;
      const now = Date.now();
      zone = armTapZone(press && now - press.at <= OPENER_PRESS_TTL_MS ? press : null, now);
      if (!zone) return { x: 0, y: 0 };
      return { x: zone.x - window.width / 2, y: zone.y - window.height / 2 };
    },
  };
}

type ModalOrigin = ReturnType<typeof createModalOrigin>;

const ModalOriginScope = createContext<ModalOrigin | null>(null);

export function ModalOriginProvider({ children }: { children: ReactNode }) {
  const [origin] = useState(createModalOrigin);
  return <ModalOriginScope value={origin}>{children}</ModalOriginScope>;
}

export function useModalOrigin() {
  return useContext(ModalOriginScope);
}
