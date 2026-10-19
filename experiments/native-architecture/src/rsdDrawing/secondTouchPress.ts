import { createContext, useContext, useLayoutEffect, useState } from 'react';
import type { GestureResponderEvent, NativeTouchEvent, ViewInstance } from 'react-native';
import { useModalOrigin } from './modalOrigin';

type Frame = Readonly<{ x: number; y: number; width: number; height: number }>;
type Sample = Pick<NativeTouchEvent, 'identifier' | 'pageX' | 'pageY' | 'timestamp'>;
type Owner = {
  enabled: () => boolean;
  measure: (complete: (frame: Frame | null) => void) => void;
  pressIn: () => void;
  pressOut: () => void;
  press: (event: GestureResponderEvent) => void;
};
type Contact = {
  identifier: string;
  frame: Frame | null;
  sample: Sample;
  pressed: boolean;
  release: GestureResponderEvent | null;
};

type Target = {
  bounds: () => Frame | null;
  start: (event: GestureResponderEvent, identifier: string) => void;
  move: (event: GestureResponderEvent) => void;
  end: (event: GestureResponderEvent) => void;
  cancel: () => void;
  priority: 'control' | 'clear';
};

// The palette paints above the Clear tab where their bounds overlap.
const TARGET_PRIORITY = { clear: 0, control: 1 } as const;

export function nativePressFrame(view: ViewInstance | null): Frame | null {
  if (!view) return null;
  const { x, y, width, height } = view.getBoundingClientRect();
  return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0
    ? { x, y, width, height }
    : null;
}

export function createSecondTouchRoutes() {
  const targets = new Set<Target>();
  const held = new Map<string, Target>();
  const targetAt = (sample: Pick<Sample, 'pageX' | 'pageY'>) =>
    [...targets]
      .reverse()
      .sort((a, b) => TARGET_PRIORITY[b.priority] - TARGET_PRIORITY[a.priority])
      .find((target) => {
        const frame = target.bounds();
        return frame !== null && inside(sample, frame);
      });
  const cancel = () => {
    for (const target of new Set(held.values())) target.cancel();
    held.clear();
  };
  return {
    register(target: Target) {
      targets.add(target);
      return () => {
        targets.delete(target);
        for (const [identifier, owner] of held) if (owner === target) held.delete(identifier);
        target.cancel();
      };
    },
    // Paper packets and responder touches allocate identifiers independently on iOS.
    containsPoint: (sample: Pick<Sample, 'pageX' | 'pageY'>) => targetAt(sample) != null,
    start(event: GestureResponderEvent) {
      let point: Sample | null = null;
      if (event.nativeEvent.touches.length < 2) return point;
      for (const sample of event.nativeEvent.changedTouches) {
        const identifier = String(sample.identifier);
        if (held.has(identifier)) continue;
        const target = targetAt(sample);
        if (!target) continue;
        held.set(identifier, target);
        target.start(event, identifier);
        point = sample;
      }
      return point;
    },
    move(event: GestureResponderEvent) {
      for (const sample of event.nativeEvent.changedTouches)
        held.get(String(sample.identifier))?.move(event);
    },
    end(event: GestureResponderEvent) {
      for (const sample of event.nativeEvent.changedTouches) {
        const identifier = String(sample.identifier);
        const target = held.get(identifier);
        held.delete(identifier);
        target?.end(event);
      }
    },
    cancel,
  };
}

export const SecondTouchRouteScope = createContext<ReturnType<
  typeof createSecondTouchRoutes
> | null>(null);

export function useSecondTouchLayout(capturePress: () => boolean) {
  const [contacts] = useState(createSecondTouchRoutes);
  const origin = useModalOrigin();
  useLayoutEffect(() => contacts.cancel, [contacts]);
  return {
    contacts,
    handlers: {
      onStartShouldSetResponderCapture(event: GestureResponderEvent) {
        const point = contacts.start(event);
        if (point) origin?.record({ nativeEvent: point });
        return capturePress();
      },
      onTouchStart: contacts.start,
      onTouchMove: contacts.move,
      onTouchEnd: contacts.end,
      onTouchCancel: contacts.cancel,
    },
  };
}

export function useSecondTouchTarget(target: Target) {
  const routes = useContext(SecondTouchRouteScope);
  useLayoutEffect(() => routes?.register(target), [routes, target]);
}

export function useSecondTouchRoutes() {
  return useContext(SecondTouchRouteScope);
}

function inside(sample: Pick<Sample, 'pageX' | 'pageY'>, frame: Frame) {
  return (
    Number.isFinite(sample.pageX) &&
    Number.isFinite(sample.pageY) &&
    sample.pageX >= frame.x &&
    sample.pageX <= frame.x + frame.width &&
    sample.pageY >= frame.y &&
    sample.pageY <= frame.y + frame.height
  );
}

function ownSample(event: GestureResponderEvent, identifier: string) {
  return event.nativeEvent.changedTouches?.find((touch) => String(touch.identifier) === identifier);
}

// A target-delivered secondary touch uses the button's own bounds; Pressable keeps its
// single-touch and assistive activation lifecycle.
export function createSecondTouchPress(owner: Owner) {
  let contact: Contact | null = null;
  let released: Sample | null = null;

  function paint(current: Contact, pressed: boolean) {
    if (current.pressed === pressed) return;
    current.pressed = pressed;
    if (pressed) owner.pressIn();
    else owner.pressOut();
  }

  function cancel() {
    if (contact) paint(contact, false);
    contact = null;
  }

  function finish(current: Contact) {
    const event = current.release;
    if (!event || !current.frame || contact !== current) return;
    const accepted = owner.enabled() && inside(current.sample, current.frame);
    released = current.sample;
    cancel();
    if (accepted) owner.press(event);
  }

  return {
    start(event: GestureResponderEvent, contactIdentifier = String(event.nativeEvent.identifier)) {
      released = null;
      if (contact || !owner.enabled() || event.nativeEvent.touches.length < 2) return;
      const identifier = contactIdentifier;
      const sample = ownSample(event, identifier);
      if (!sample) return;
      event.persist();
      const current: Contact = { identifier, sample, frame: null, pressed: false, release: null };
      contact = current;
      owner.measure((frame) => {
        if (contact !== current || current.release) return;
        if (!frame || !inside(current.sample, frame) || !owner.enabled()) {
          cancel();
          return;
        }
        current.frame = frame;
        paint(current, inside(current.sample, frame));
      });
    },
    move(event: GestureResponderEvent) {
      if (!contact) return;
      const sample = ownSample(event, contact.identifier);
      if (!sample) return;
      contact.sample = sample;
      if (!owner.enabled()) cancel();
      else if (contact.frame) paint(contact, inside(sample, contact.frame));
    },
    end(event: GestureResponderEvent) {
      if (!contact) return;
      const sample = ownSample(event, contact.identifier);
      if (!sample) return;
      event.persist();
      contact.sample = sample;
      contact.release = event;
      const current = contact;
      owner.measure((frame) => {
        if (contact !== current) return;
        if (!frame) {
          cancel();
          return;
        }
        current.frame = frame;
        finish(current);
      });
    },
    press(event: GestureResponderEvent) {
      const identifier = contact?.identifier ?? (released ? String(released.identifier) : null);
      const sample =
        identifier === null
          ? event.nativeEvent
          : (ownSample(event, identifier) ?? event.nativeEvent);
      if (contact?.identifier === String(sample.identifier)) return;
      if (
        released &&
        String(sample.identifier) === String(released.identifier) &&
        sample.timestamp === released.timestamp
      ) {
        released = null;
        return;
      }
      if (owner.enabled()) owner.press(event);
    },
    cancel,
  };
}
