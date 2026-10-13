import { createContext, useContext, useState, type ReactNode } from 'react';
import type { GestureResponderEvent } from 'react-native';

// A press older than this did not open the dialog now opening: a programmatic open, a keyboard
// activation or a press on the paper flies in from the centre instead, as shipping's dialogs with
// no origin do.
const OPENER_PRESS_TTL_MS = 1000;

type Point = { x: number; y: number };

function createModalOrigin() {
  let last: (Point & { at: number }) | null = null;
  return {
    record(event: GestureResponderEvent) {
      last = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, at: Date.now() };
      return false;
    },
    // Where the opening press landed, relative to the window centre the card settles on.
    take(window: { width: number; height: number }): Point {
      const press = last;
      last = null;
      if (!press || Date.now() - press.at > OPENER_PRESS_TTL_MS) return { x: 0, y: 0 };
      return { x: press.x - window.width / 2, y: press.y - window.height / 2 };
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
