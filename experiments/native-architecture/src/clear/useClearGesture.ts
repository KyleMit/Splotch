import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Animated, Easing, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { impactThreshold } from '../platform/clearHaptics';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { hasDrawingInk, type Drawing } from '../drawing/model';
import type { ClearSound } from '../audio/pageTurnSound';
import {
  ACCEPT_ZONE_HIDE_DELAY_MS,
  COACHMARK_AUTO_DISMISS_MS,
  FLOOD_COMMITTED_OPACITY,
  FLOOD_RELEASE_MS,
  RETURN_HOME_MS,
  acceptRadius,
  createClearGesture,
  type ClearGestureEffects,
  type Point,
} from './dragToClear';

// The accept ring's reveal and the delete-ready emphasis, from the ring's pop and --duration-base.
const RING_REVEAL_MS = 300;
const EMPHASIS_MS = 200;
// ClearButton.svelte's clear-lift-off squash as the button leaves its dock.
const LIFT_OFF_MS = 180;
const EASE_POP = Easing.bezier(0.34, 1.56, 0.64, 1);

export type ClearSheet = Readonly<{ id: number; drawing: Drawing }>;

type Owner = {
  disabled: boolean;
  drawing: Drawing;
  onClear: () => Promise<void>;
  sound: ClearSound | null;
};

type Timer = ReturnType<typeof setTimeout>;
type ClearGesture = ReturnType<typeof createClearGesture>;

// The gesture belongs to the finger that pressed Clear, as the shipping action filters by
// pointerId: a second finger on the paper must never move, cross or commit it. Its position comes
// from whichever touch list carries its identifier; absent from both, the event is not its own.
function fingerPoint(event: GestureResponderEvent, finger: string | null): Point | null {
  const { nativeEvent } = event;
  for (const touch of [...(nativeEvent.changedTouches ?? []), ...(nativeEvent.touches ?? [])])
    if (String(touch.identifier) === finger) return { x: touch.pageX, y: touch.pageY };
  return null;
}

function createClearValues() {
  return {
    drag: new Animated.ValueXY({ x: 0, y: 0 }),
    lift: new Animated.Value(0),
    emphasis: new Animated.Value(0),
    ring: new Animated.Value(0),
    progress: new Animated.Value(0),
    flood: new Animated.Value(0),
  };
}

type ClearValues = ReturnType<typeof createClearValues>;

function goHome(drag: Animated.ValueXY, reduced: boolean) {
  drag.stopAnimation();
  if (reduced) {
    drag.setValue({ x: 0, y: 0 });
    return;
  }
  Animated.timing(drag, {
    toValue: { x: 0, y: 0 },
    duration: RETURN_HOME_MS,
    easing: EASE_POP,
    useNativeDriver: true,
  }).start();
}

function fade(value: Animated.Value, toValue: number, duration: number, reduced: boolean) {
  value.stopAnimation();
  if (reduced) {
    value.setValue(toValue);
    return;
  }
  Animated.timing(value, {
    toValue,
    duration,
    easing: Easing.linear,
    useNativeDriver: true,
  }).start();
}

type Context = {
  owner: RefObject<Owner>;
  reduced: RefObject<boolean>;
  values: ClearValues;
  later: (run: () => void, delay: number) => Timer;
  cancel: (timer: Timer | null) => void;
  ringHide: { current: Timer | null };
  reached: { current: boolean };
  sheets: { current: number };
  set: {
    dragging: (value: boolean) => void;
    reached: (value: boolean) => void;
    ringShown: (value: boolean) => void;
    coachmark: (value: boolean) => void;
    clearing: (value: boolean) => void;
    sheet: (value: ClearSheet) => void;
    pending: (change: number) => void;
  };
};

function markReached({ reached, set, values, reduced }: Context, next: boolean) {
  if (reached.current === next) return;
  reached.current = next;
  set.reached(next);
  fade(values.emphasis, next ? 1 : 0, EMPHASIS_MS, reduced.current);
  values.flood.setValue(next ? FLOOD_COMMITTED_OPACITY : 0);
}

function letGo(context: Context) {
  const { values, set, reduced, later } = context;
  markReached(context, false);
  set.dragging(false);
  values.progress.setValue(0);
  fade(values.ring, 0, EMPHASIS_MS, reduced.current);
  context.ringHide.current = later(() => {
    context.ringHide.current = null;
    set.ringShown(false);
  }, ACCEPT_ZONE_HIDE_DELAY_MS);
  goHome(values.drag, reduced.current);
}

// Each decision of the pure state machine becomes the shipping feedback: the ring, the wash, the
// flood, the page that leaves, the page-turn sound, the threshold haptic and the coachmark.
function clearEffects(context: Context): ClearGestureEffects {
  const { owner, reduced, values, set } = context;
  return {
    showTutorial: () => set.coachmark(true),
    dismissTutorial: () => set.coachmark(false),
    begin() {
      // A drag that starts while the last one's ring is fading keeps its own ring.
      context.cancel(context.ringHide.current);
      context.ringHide.current = null;
      owner.current.sound?.start();
      set.dragging(true);
      set.ringShown(true);
      values.progress.setValue(0);
      values.flood.setValue(0);
      values.ring.setValue(0);
      fade(values.ring, 1, RING_REVEAL_MS, reduced.current);
      if (!reduced.current) {
        values.lift.setValue(1);
        fade(values.lift, 0, LIFT_OFF_MS, false);
      }
    },
    follow(offset, progress, isReached) {
      values.drag.setValue(offset);
      values.progress.setValue(progress);
      markReached(context, isReached);
    },
    threshold: impactThreshold,
    commit() {
      const { drawing, onClear, sound } = owner.current;
      sound?.commit();
      const flooded = context.reached.current;
      letGo(context);
      if (flooded) {
        values.flood.setValue(FLOOD_COMMITTED_OPACITY);
        fade(values.flood, 0, FLOOD_RELEASE_MS, reduced.current);
      }
      set.clearing(true);
      if (!reduced.current && hasDrawingInk(drawing)) {
        context.sheets.current += 1;
        set.sheet({ id: context.sheets.current, drawing });
      }
      set.pending(1);
      void onClear().finally(() => set.pending(-1));
    },
    cancel() {
      owner.current.sound?.cancel();
      letGo(context);
    },
    settled: () => set.clearing(false),
  };
}

function useLatest<Value>(value: Value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function clearResponder(
  gesture: ClearGesture,
  disabled: boolean,
  finger: { current: string | null }
) {
  return {
    onStartShouldSetResponder: () => !disabled && gesture.accepts(),
    onResponderTerminationRequest: () => false,
    onResponderGrant: (event: GestureResponderEvent) => {
      finger.current = String(event.nativeEvent.identifier);
      const at = fingerPoint(event, finger.current);
      if (at) gesture.down(at);
    },
    onResponderMove: (event: GestureResponderEvent) => {
      const at = fingerPoint(event, finger.current);
      if (at) gesture.move(at);
    },
    onResponderRelease: (event: GestureResponderEvent) => {
      const at = fingerPoint(event, finger.current);
      finger.current = null;
      if (at) gesture.up(at);
      else gesture.terminate();
    },
    onResponderTerminate: () => {
      finger.current = null;
      gesture.terminate();
    },
  };
}

export function useClearGesture(owner: Owner) {
  const latest = useLatest(owner);
  const window = useWindowDimensions();
  const radius = useLatest(acceptRadius(window.width, window.height));
  const reduced = useReduceMotion();
  const motion = useLatest(reduced);
  const [values] = useState(createClearValues);
  const [dragging, setDragging] = useState(false);
  const [reached, setReached] = useState(false);
  const [ringShown, setRingShown] = useState(false);
  const [coachmark, setCoachmark] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [sheet, setSheet] = useState<ClearSheet | null>(null);
  const [pending, setPending] = useState(0);
  const finishSheet = useCallback(
    (id: number) => setSheet((current) => (current?.id === id ? null : current)),
    []
  );
  const [timers] = useState(() => new Set<Timer>());
  const ringHide = useRef<Timer | null>(null);
  const finger = useRef<string | null>(null);
  const reachedNow = useRef(false);
  const sheets = useRef(0);
  const context: Context = {
    owner: latest,
    reduced: motion,
    values,
    later(run, delay) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        run();
      }, delay);
      timers.add(timer);
      return timer;
    },
    cancel(timer) {
      if (timer === null) return;
      clearTimeout(timer);
      timers.delete(timer);
    },
    ringHide,
    reached: reachedNow,
    sheets,
    set: {
      dragging: setDragging,
      reached: setReached,
      ringShown: setRingShown,
      coachmark: setCoachmark,
      clearing: setClearing,
      sheet: setSheet,
      pending: (change) => setPending((count) => count + change),
    },
  };
  const effects = useLatest(clearEffects(context));
  const [gesture] = useState(() =>
    createClearGesture(
      {
        showTutorial: () => effects.current.showTutorial(),
        dismissTutorial: () => effects.current.dismissTutorial(),
        begin: () => effects.current.begin(),
        follow: (offset, progress, isReached) =>
          effects.current.follow(offset, progress, isReached),
        threshold: () => effects.current.threshold(),
        commit: () => effects.current.commit(),
        cancel: () => effects.current.cancel(),
        settled: () => effects.current.settled(),
      },
      () => radius.current
    )
  );
  useEffect(
    () => () => {
      gesture.dispose();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
    [gesture, timers]
  );
  useEffect(() => {
    if (!coachmark) return;
    const timer = setTimeout(() => setCoachmark(false), COACHMARK_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [coachmark]);
  // A layout change moves the dock out from under the coachmark's geometry.
  useEffect(() => setCoachmark(false), [window.width, window.height]);
  useEffect(() => {
    if (owner.disabled) gesture.terminate();
  }, [gesture, owner.disabled]);

  return {
    values,
    reduced,
    dragging,
    reached,
    ringShown,
    coachmark,
    clearing,
    sheet,
    // The clean page stands under the departing one until the clear has landed.
    covered: pending > 0 || sheet !== null,
    radius: radius.current,
    finishSheet,
    responder: clearResponder(gesture, owner.disabled, finger),
    activate: () => {
      if (!owner.disabled) gesture.activate();
    },
  };
}

export type ClearControl = ReturnType<typeof useClearGesture>;
