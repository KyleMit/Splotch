import { findNodeHandle, type GestureResponderEvent, type NativeTouchEvent } from 'react-native';

type TouchIdentity = Pick<NativeTouchEvent, 'identifier' | 'timestamp'>;
export type ContactLifetime = { startedAt: number; starting: boolean };
export type StartBatch = {
  fingerprint: string;
  changed: readonly string[];
  emitter: readonly string[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function contactLifetime(
  event: GestureResponderEvent,
  touch: TouchIdentity,
  phase: 'active' | 'ended'
): ContactLifetime | null {
  // Responder plugins add touchHistory outside RN's legacy event declaration.
  const boundary: unknown = event;
  if (
    !record(boundary) ||
    !record(boundary.touchHistory) ||
    !record(boundary.touchHistory.touchBank)
  )
    return null;
  const contact = boundary.touchHistory.touchBank[touch.identifier];
  if (!record(contact) || contact.touchActive !== (phase === 'active')) return null;
  const startedAt = contact.startTimeStamp;
  const eventTime = boundary.touchHistory.mostRecentTimeStamp;
  if (
    !finite(startedAt) ||
    startedAt < 0 ||
    !finite(eventTime) ||
    eventTime < 0 ||
    !finite(touch.timestamp) ||
    touch.timestamp < startedAt
  )
    return null;
  return { startedAt, starting: touch.timestamp === startedAt };
}

export function responderTarget(event: GestureResponderEvent): unknown {
  const boundary: unknown = event;
  if (!record(boundary) || !record(boundary.nativeEvent)) return null;
  if (typeof boundary.nativeEvent.target === 'number') {
    try {
      const owner = boundary.currentTarget;
      if (!record(owner) && !(finite(owner) && owner > 0)) return null;
      // The native implementation accepts public host instances omitted from its legacy declaration.
      const target: unknown = Reflect.apply(findNodeHandle, undefined, [owner]);
      return finite(target) && target > 0 ? target : null;
    } catch {
      return null;
    }
  }
  return record(boundary.currentTarget) ? boundary.currentTarget : null;
}

function touchFingerprint(event: GestureResponderEvent, touch: unknown): string | null {
  const boundary: unknown = event;
  if (
    !record(touch) ||
    !finite(touch.identifier) ||
    touch.identifier < 0 ||
    !Number.isInteger(touch.identifier) ||
    !finite(touch.target) ||
    touch.target <= 0
  )
    return null;
  const fields = ['locationX', 'locationY', 'pageX', 'pageY', 'timestamp'];
  if (!fields.every((field) => finite(touch[field]))) return null;
  if (
    !record(boundary) ||
    !record(boundary.touchHistory) ||
    !record(boundary.touchHistory.touchBank)
  )
    return null;
  const history = boundary.touchHistory.touchBank[touch.identifier];
  const historyFields = [
    'startTimeStamp',
    'startPageX',
    'startPageY',
    'currentTimeStamp',
    'currentPageX',
    'currentPageY',
    'previousTimeStamp',
    'previousPageX',
    'previousPageY',
  ];
  if (
    !record(history) ||
    history.touchActive !== true ||
    !historyFields.every((field) => finite(history[field]))
  )
    return null;
  if (
    !finite(history.startTimeStamp) ||
    !finite(touch.timestamp) ||
    touch.timestamp < history.startTimeStamp ||
    history.startTimeStamp < 0
  )
    return null;
  return JSON.stringify([
    touch.identifier,
    touch.target,
    ...fields.map((field) => touch[field]),
    true,
    ...historyFields.map((field) => history[field]),
  ]);
}

export function readStartBatch(event: GestureResponderEvent): StartBatch | 'absent' | 'invalid' {
  const boundary: unknown = event;
  if (!record(boundary) || !record(boundary.nativeEvent)) return 'invalid';
  const payload = boundary.nativeEvent;
  if (!('targetTouches' in payload)) return 'absent';
  if (
    !Array.isArray(payload.targetTouches) ||
    !Array.isArray(payload.touches) ||
    !Array.isArray(payload.changedTouches) ||
    !record(boundary.touchHistory) ||
    !finite(boundary.touchHistory.mostRecentTimeStamp)
  )
    return 'invalid';
  const current = new Map<string, string>();
  const targets = new Map<string, unknown>();
  for (const touch of payload.touches) {
    const fingerprint = touchFingerprint(event, touch);
    if (!fingerprint || !record(touch)) return 'invalid';
    const id = String(touch.identifier);
    if (current.has(id)) return 'invalid';
    current.set(id, fingerprint);
    targets.set(id, touch.target);
  }
  function subset(touches: unknown[]): string[] | null {
    const ids: string[] = [];
    for (const touch of touches) {
      const fingerprint = touchFingerprint(event, touch);
      if (!fingerprint || !record(touch)) return null;
      const id = String(touch.identifier);
      if (ids.includes(id) || current.get(id) !== fingerprint) return null;
      ids.push(id);
    }
    return ids.sort();
  }
  const changed = subset(payload.changedTouches);
  const emitter = subset(payload.targetTouches);
  if (!changed?.length || !emitter?.length || !changed.some((id) => emitter.includes(id)))
    return 'invalid';
  const target = targets.get(emitter[0]);
  // The candidate's box-only View and raw-text paragraphs each have one emitter per target.
  if (
    emitter.some((id) => targets.get(id) !== target) ||
    [...targets].some(([id, value]) => value === target && !emitter.includes(id))
  )
    return 'invalid';
  return {
    fingerprint: JSON.stringify([[...current].sort(([a], [b]) => a.localeCompare(b)), changed]),
    changed,
    emitter,
  };
}
