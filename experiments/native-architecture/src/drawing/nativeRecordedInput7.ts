import type { GestureResponderEvent, NativeTouchEvent } from 'react-native';
import type { ContactSound, SoundContact } from '../audio/contactSound';
import { createRecordedContactCohort7, type CompletedCohort7, type LiveCohort7 } from './recordedContactCohort7';
import { contactLifetime, responderTarget } from './touchBoundary';
import { paperFrame, paperLocation, type PaperFrame } from './paperGeometry';
import { containsPaperPoint, paperContactPoint, readDrawingPaper, type AdoptedPaper } from './paperSpace';
import { MAX_CONTACTS_7, type Point7, type Style7 } from './recordedTypes7';

type NativeRecordedPort7 = Readonly<{
  paper: AdoptedPaper;
  frame: () => PaperFrame | null;
  style: () => Style7;
  firstSeed: number;
  sound: ContactSound | null;
  preview: (snapshot: LiveCohort7 | null) => void;
  complete: (cohort: CompletedCohort7) => void;
  abandon: (seedCursor: number) => void;
  error: (error: unknown) => void;
}>;

function createRecordedSound7(sound: ContactSound | null) {
  const contacts = new Map<string, SoundContact>();
  function end(identifier: string) {
    const contact = contacts.get(identifier);
    contacts.delete(identifier);
    contact?.end();
  }
  return {
    start(identifier: string, point: Point7, timestamp: number) {
      if (sound) contacts.set(identifier, sound.begin(point, timestamp));
    },
    sample(identifier: string, point: Point7, timestamp: number) {
      contacts.get(identifier)?.sample(point, timestamp);
    },
    end,
    cancel() {
      let failure: unknown;
      let failed = false;
      for (const identifier of contacts.keys()) {
        try { end(identifier); } catch (error) { if (!failed) failure = error;failed = true; }
      }
      if (failed) throw failure;
    },
  };
}

function changedRecordedTouches7(event: GestureResponderEvent, seen: WeakSet<object>) {
  if (seen.has(event.nativeEvent)) return [];
  seen.add(event.nativeEvent);
  const touches = event.nativeEvent.changedTouches;
  if (touches.length > MAX_CONTACTS_7 || new Set(touches.map((t) => t.identifier)).size !== touches.length)
    throw new Error('The recorded contact delivery is invalid.');
  return touches;
}

function createFrameLock7(readFrame: () => PaperFrame | null) {
  let reference: PaperFrame | null = null;
  return {
    current() {
      const value = readFrame();
      const frame = value && paperFrame(value.width, value.height, value.pageX, value.pageY);
      if (!frame || (reference && (frame.width !== reference.width || frame.height !== reference.height ||
          frame.pageX !== reference.pageX || frame.pageY !== reference.pageY)))
        throw new Error('The recorded paper geometry changed.');
      return frame;
    },
    adopt(frame: PaperFrame) { reference ??= Object.freeze({ ...frame }); },
  };
}

export function createNativeRecordedInput7(port: NativeRecordedPort7) {
  const paper = readDrawingPaper(port.paper);
  if (paper.kind !== 'adopted') throw new Error('Recorded input requires adopted paper.');
  const cohort = createRecordedContactCohort7(paper, 'per-frame', port.firstSeed);
  const sound = createRecordedSound7(port.sound);
  let target: unknown = null;
  const lifetimes = new Map<string, number>();
  const starts = new WeakSet<object>();
  const moves = new WeakSet<object>();
  const ends = new WeakSet<object>();
  let scheduled: number | null = null;
  let closed = false;
  let published: LiveCohort7 | null = null;
  const frameLock = createFrameLock7(port.frame);
  const currentFrame = frameLock.current;
  function stopFrame() {
    if (scheduled !== null) cancelAnimationFrame(scheduled);
    scheduled = null;
  }
  function cancel() {
    if (closed) return;
    closed = true;stopFrame();lifetimes.clear();
    try { port.abandon(cohort.allocationCursor()); }
    finally {
      cohort.cancel();published = null;
      try { sound.cancel(); } finally { port.preview(null); }
    }
  }
  function guarded(action: () => void) {
    if (closed) return;
    try { action(); } catch (error) { try { cancel(); } finally { port.error(error); } }
  }
  function publish() {
    const snapshot = cohort.snapshot();
    if (snapshot === published) return;
    published = snapshot;port.preview(snapshot);
  }
  function point(touch: NativeTouchEvent, starting: boolean) {
    const frame = currentFrame();
    const location = paperLocation(touch, frame);
    if (!location) throw new Error('The recorded paper geometry changed.');
    if (starting && !containsPaperPoint(location.x, location.y, frame.width, frame.height))
      throw new Error('The recorded contact started outside the paper.');
    frameLock.adopt(frame);
    return paperContactPoint(location.x, location.y, frame.width, frame.height);
  }
  function reconcile(event: GestureResponderEvent, ending = false) {
    currentFrame();
    const active = event.nativeEvent.touches;
    if (active.length > MAX_CONTACTS_7 || new Set(active.map((touch) => touch.identifier)).size !== active.length)
      throw new Error('The recorded active contacts are invalid.');
    for (const [identifier, startedAt] of lifetimes) {
      const touch = active.find((item) => item.identifier === identifier);
      if (touch && contactLifetime(event, touch, 'active')?.startedAt === startedAt) continue;
      const ended = ending ? event.nativeEvent.changedTouches.find((item) => item.identifier === identifier) : undefined;
      if (!touch && ended && contactLifetime(event, ended, 'ended')?.startedAt === startedAt) continue;
      throw new Error('The recorded contact disappeared or changed lifetime.');
    }
  }
  function frameDrain() {
    if (scheduled !== null) return;
    scheduled = requestAnimationFrame(() => {
      scheduled = null;
      guarded(() => {
        currentFrame();
        if (cohort.hasActive()) { cohort.drain();publish(); }
      });
    });
  }
  return {
    start(event: GestureResponderEvent) {
      guarded(() => {
        reconcile(event);
        const owner = responderTarget(event);
        if (owner === null || (target !== null && owner !== target)) throw new Error('The recorded paper owner changed.');
        target = owner;
        for (const touch of changedRecordedTouches7(event, starts)) {
          if (touch.target !== owner) throw new Error('The recorded start belongs to another target.');
          const lifetime = contactLifetime(event, touch, 'active');
          if (!lifetime?.starting || lifetimes.has(touch.identifier)) throw new Error('The recorded start is unproven.');
          const sample = point(touch, true);
          cohort.start(touch.identifier, port.style(), sample);
          lifetimes.set(touch.identifier, lifetime.startedAt);
          sound.start(touch.identifier, sample, touch.timestamp);
        }
        if (cohort.hasActive()) publish();
      });
    },
    move(event: GestureResponderEvent) {
      guarded(() => {
        reconcile(event);
        let accepted = false;
        for (const touch of changedRecordedTouches7(event, moves)) {
          const lifetime = contactLifetime(event, touch, 'active');
          if (!lifetime || lifetime.startedAt !== lifetimes.get(touch.identifier)) throw new Error('The recorded contact lifetime changed.');
          // RN exposes this delivered sample; no coalesced history is synthesized from active touches.
          if (touch.target !== target) throw new Error('The recorded move belongs to another target.');
          const sample = point(touch, false);
          cohort.move(touch.identifier, [sample]);
          sound.sample(touch.identifier, sample, touch.timestamp);
          accepted = true;
        }
        if (accepted) frameDrain();
      });
    },
    end(event: GestureResponderEvent) {
      guarded(() => {
        reconcile(event, true);
        for (const touch of changedRecordedTouches7(event, ends)) {
          if (touch.target !== target) throw new Error('The recorded end belongs to another target.');
          if (event.nativeEvent.touches.some((active) => active.identifier === touch.identifier)) throw new Error('The recorded end is still active.');
          const lifetime = contactLifetime(event, touch, 'ended');
          if (!lifetime || lifetime.startedAt !== lifetimes.get(touch.identifier)) throw new Error('The recorded end is unproven.');
          const completed = cohort.end(touch.identifier);
          lifetimes.delete(touch.identifier);
          sound.end(touch.identifier);
          if (completed) {
            closed = true;stopFrame();port.complete(completed);
          } else publish();
        }
      });
    },
    cancel,
    allocationCursor: cohort.allocationCursor,
    hasActive: () => !closed && cohort.hasActive(),
    snapshot: (): LiveCohort7 | null => !closed && cohort.hasActive() ? cohort.snapshot() : null,
  };
}
