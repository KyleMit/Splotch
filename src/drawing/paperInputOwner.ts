import {
  COLOR_CHANGE_DEBOUNCE_MS,
  guardedEdgeAt,
  edgeSwipeDirectionDecided,
  edgeSwipeIsOsGesture,
} from '../lib/drawing/strokeMath';
import {
  readPaperInput,
  INPUT_INTERRUPTED_MESSAGE,
  type InputContact,
  type InputSample,
  type InputViewport,
} from './paperInput';
import type { ContactSample, ContactStyle, OwnedContact } from './contactResponder';
import { PERF_PROBE, perfIdle, perfPacket } from './perfProbe';

type InputOwner = {
  contacts: Map<string, OwnedContact>;
  currentStyle: () => ContactStyle;
  canStart: (touch: ContactSample) => boolean;
  accept: (touch: ContactSample, contact: OwnedContact) => void;
  sample: (touch: ContactSample, audible: boolean) => void;
  finish: (identifier: string) => void;
  publish: () => void;
  interrupt: () => void;
  error: (error: unknown) => void;
};

const point = (contact: InputContact, sample: InputSample): ContactSample => ({
  ...sample,
  identifier: contact.identifier,
});

function start(
  owner: InputOwner,
  source: InputContact,
  viewport: InputViewport,
  changedAt: number
) {
  const first = source.samples[0];
  const contact: OwnedContact = {
    startedAt: source.startedAt,
    style: owner.currentStyle(),
    admission: { kind: 'ignored' },
    sound: null,
    input: { tool: source.tool, last: first },
  };
  owner.contacts.set(source.identifier, contact);
  const touch = point(source, first);
  if (
    first.timestamp !== source.startedAt ||
    !owner.canStart(touch) ||
    (source.tool !== 'pen' && Date.now() - changedAt < COLOR_CHANGE_DEBOUNCE_MS)
  )
    return contact;
  const edge =
    source.tool === 'touch'
      ? guardedEdgeAt(first.pageX, first.pageY, {
          ...viewport,
          renderScale: 1,
        })
      : null;
  if (edge) {
    contact.admission = { kind: 'guarded', edge, first: touch, pending: [] };
  } else owner.accept(touch, contact);
  return contact;
}

function samples(owner: InputOwner, source: InputContact, contact: OwnedContact, ending: boolean) {
  const previous = contact.input.last;
  const latest = source.samples[source.samples.length - 1];
  if (previous && latest.timestamp < previous.timestamp) return;
  const batch = source.samples.filter(
    (sample) =>
      !previous ||
      sample.timestamp > previous.timestamp ||
      (sample.timestamp === previous.timestamp &&
        (sample.pageX !== previous.pageX || sample.pageY !== previous.pageY))
  );
  contact.input.last = source.samples[source.samples.length - 1];
  const guard = contact.admission.kind === 'guarded' ? contact.admission : null;
  if (guard) {
    guard.pending.push(...batch);
    const last = guard.pending.at(-1) ?? guard.first;
    const dx = last.pageX - guard.first.pageX;
    const dy = last.pageY - guard.first.pageY;
    if (edgeSwipeDirectionDecided(Math.hypot(dx, dy), 1)) {
      if (edgeSwipeIsOsGesture(guard.edge, dx, dy)) {
        contact.admission = { kind: 'ignored' };
        return;
      }
    } else if (!ending) return;
    if (!owner.canStart(guard.first)) {
      contact.admission = { kind: 'ignored' };
      return;
    }
    owner.accept(guard.first, contact);
    for (const [index, sample] of guard.pending.entries())
      owner.sample(point(source, sample), index === guard.pending.length - 1);
    return;
  }
  for (const [index, sample] of batch.entries())
    owner.sample(point(source, sample), index === batch.length - 1);
}

export function createPaperInputOwner(owner: InputOwner) {
  let sequence = -1;
  let detached = false;
  let changedAt = -Infinity;
  function finish(identifier: string) {
    owner.finish(identifier);
    owner.contacts.delete(identifier);
  }
  return {
    // Shipping's setColor: only a genuine paint change arms the debounce, timed from the pick. The
    // render that delivers the new colour can hold the JS thread for 200 ms on Android, and a finger
    // that lands meanwhile is read only after it, so timing from the render dropped strokes (#3071).
    notePaintChoice(color: ContactStyle['color']) {
      if (color !== owner.currentStyle().color) changedAt = Date.now();
    },
    attach() {
      detached = false;
    },
    detach() {
      detached = true;
      if (PERF_PROBE) perfIdle();
    },
    receive(value: unknown) {
      if (detached) return;
      const packet = readPaperInput(value);
      if (!packet) {
        owner.interrupt();
        if (PERF_PROBE) perfIdle();
        owner.error(new Error(INPUT_INTERRUPTED_MESSAGE));
        return;
      }
      if (packet.sequence <= sequence) return;
      sequence = packet.sequence;
      if (PERF_PROBE) perfPacket(packet);
      if (packet.phase === 'cancel') {
        for (const identifier of packet.changed) finish(identifier);
        owner.publish();
        if (PERF_PROBE && owner.contacts.size === 0) perfIdle();
        return;
      }
      const present = new Set(packet.contacts.map(({ identifier }) => identifier));
      for (const identifier of owner.contacts.keys())
        if (!present.has(identifier)) finish(identifier);
      const changed = new Set(packet.changed);
      for (const source of packet.contacts) {
        const changing = changed.has(source.identifier);
        let contact = owner.contacts.get(source.identifier);
        if (
          contact &&
          (contact.startedAt !== source.startedAt || contact.input.tool !== source.tool)
        ) {
          finish(source.identifier);
          contact = undefined;
        }
        if (!contact) {
          if (packet.phase !== 'start' || !changing) continue;
          contact = start(owner, source, packet.viewport, changedAt);
        }
        samples(owner, source, contact, packet.phase === 'end' && changing);
        if (packet.phase === 'end' && changing) finish(source.identifier);
      }
      owner.publish();
      if (PERF_PROBE && owner.contacts.size === 0) perfIdle();
    },
  };
}
