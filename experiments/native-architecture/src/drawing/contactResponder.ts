import type { GestureResponderEvent, NativeTouchEvent } from 'react-native';
import { createContactCohort } from './contactCohort';
import { paperPoint, type Drawing, type Stroke } from './model';
import type { Brush } from './brushes';
import type { PaletteLabel } from './palette';
import { contactLifetime, readStartBatch, responderTarget } from './touchBoundary';
import { paperLocation, type PaperFrame } from './paperGeometry';

export type ContactDrawingProps = {
  currentDrawing: () => Drawing;
  color: PaletteLabel;
  brush: Brush;
  disabled: boolean;
  onCohort: (strokes: readonly Stroke[]) => void;
  onDrawingChange: (drawing: boolean) => void;
  onError: (error: unknown) => void;
};

type Contact = { startedAt: number | null; state: 'accepted' | 'awaiting-start' | 'ignored' };
type ContactSample = Pick<NativeTouchEvent, 'identifier' | 'pageX' | 'pageY'>;
const INTERRUPTED_TOUCH_MESSAGE = 'That touch was interrupted. Lift and try again.';

function insidePaper(touch: NativeTouchEvent, frame: PaperFrame | null): boolean {
  const point = paperLocation(touch, frame);
  return (
    frame !== null &&
    point !== null &&
    point.x >= 0 &&
    point.x <= frame.width &&
    point.y >= 0 &&
    point.y <= frame.height
  );
}

class ContactResponder {
  private readonly input = createContactCohort();
  private readonly contacts = new Map<string, Contact>();
  private paperTarget: unknown = null;
  private lastStartEvent: GestureResponderEvent['nativeEvent'] | null = null;
  private startBatch: {
    fingerprint: string;
    remaining: Set<string>;
    delivered: Set<string>;
  } | null = null;
  private pendingGrant: {
    event: GestureResponderEvent['nativeEvent'];
    contacts: ReadonlySet<Contact>;
    samples: readonly { contact: Contact; touch: ContactSample; proven: boolean }[];
  } | null = null;

  constructor(
    private readonly current: () => ContactDrawingProps,
    private readonly frame: () => PaperFrame | null,
    private readonly showDrafts: (drafts: readonly Stroke[]) => void
  ) {}

  private publish(completed: readonly Stroke[] | null = null) {
    if (completed) this.current().onCohort(completed);
    this.showDrafts(this.input.drafts());
    this.current().onDrawingChange(this.input.hasActive());
  }

  hasActive() {
    return this.input.hasActive();
  }

  ready() {
    return !this.current().disabled && this.frame() !== null;
  }

  private reconcile(event: GestureResponderEvent) {
    const present = new Map(event.nativeEvent.touches.map((touch) => [touch.identifier, touch]));
    for (const [identifier, contact] of this.contacts) {
      const touch = present.get(identifier);
      const startedAt = touch ? (contactLifetime(event, touch, 'active')?.startedAt ?? null) : null;
      if (!touch || (contact.startedAt !== null && startedAt !== contact.startedAt)) {
        this.contacts.delete(identifier);
        this.publish(this.input.finish(identifier));
        if (touch && startedAt === null) {
          this.contacts.set(identifier, { startedAt: null, state: 'ignored' });
          this.current().onError(new Error(INTERRUPTED_TOUCH_MESSAGE));
        }
      }
    }
    if (this.contacts.size === 0) this.paperTarget = null;
  }

  private sample(touch: ContactSample, endpoint = false) {
    if (this.contacts.get(touch.identifier)?.state !== 'accepted') return;
    try {
      const frame = this.frame();
      const point = paperLocation(touch, frame);
      if (!frame || !point) throw new Error(INTERRUPTED_TOUCH_MESSAGE);
      this.input.sample(
        touch.identifier,
        paperPoint(point.x, point.y, frame.width, frame.height),
        endpoint
      );
    } catch (error) {
      this.current().onError(error);
    }
  }

  grant(event: GestureResponderEvent) {
    this.flushGrant(new Set(), true);
    this.reconcile(event);
    this.paperTarget ??= responderTarget(event);
    const samples = event.nativeEvent.touches.flatMap((touch) => {
      const contact = this.contacts.get(touch.identifier);
      return contact?.state === 'accepted'
        ? [
            {
              contact,
              proven: touch.timestamp > (contact.startedAt ?? Infinity),
              touch: {
                identifier: touch.identifier,
                pageX: touch.pageX,
                pageY: touch.pageY,
              },
            },
          ]
        : [];
    });
    this.pendingGrant = { event: event.nativeEvent, contacts: this.admit(event), samples };
    this.publish();
  }

  private flushGrant(excluded: ReadonlySet<string>, provenOnly = false) {
    const pending = this.pendingGrant;
    this.pendingGrant = null;
    for (const { contact, touch, proven } of pending?.samples ?? []) {
      if (
        (!provenOnly || proven) &&
        !excluded.has(touch.identifier) &&
        this.contacts.get(touch.identifier) === contact
      )
        this.sample(touch);
    }
  }

  private admit(event: GestureResponderEvent, starting = new Set<string>()): ReadonlySet<Contact> {
    const observed = new Set<Contact>();
    for (const touch of event.nativeEvent.touches) {
      if (this.contacts.has(touch.identifier)) continue;
      const lifetime = contactLifetime(event, touch, 'active');
      const contact: Contact = { startedAt: lifetime?.startedAt ?? null, state: 'ignored' };
      this.contacts.set(touch.identifier, contact);
      observed.add(contact);
      if (!lifetime) {
        this.current().onError(new Error(INTERRUPTED_TOUCH_MESSAGE));
        continue;
      }
      if (
        !this.ready() ||
        !lifetime.starting ||
        this.paperTarget === null ||
        touch.target !== this.paperTarget ||
        !insidePaper(touch, this.frame())
      )
        continue;
      if (!starting.has(touch.identifier)) {
        contact.state = 'awaiting-start';
        continue;
      }
      this.accept(touch, contact);
    }
    return observed;
  }

  private accept(touch: NativeTouchEvent, contact: Contact) {
    try {
      const current = this.current();
      const frame = this.frame();
      const point = paperLocation(touch, frame);
      if (!frame || !point) throw new Error(INTERRUPTED_TOUCH_MESSAGE);
      this.input.start(
        touch.identifier,
        current.color,
        current.brush,
        paperPoint(point.x, point.y, frame.width, frame.height),
        current.currentDrawing()
      );
      contact.state = 'accepted';
    } catch (error) {
      this.current().onError(error);
    }
  }

  private batchRepeat(event: GestureResponderEvent): boolean | null {
    const batch = readStartBatch(event);
    if (batch === 'absent') {
      this.startBatch = null;
      return false;
    }
    if (batch === 'invalid') {
      this.startBatch = null;
      return null;
    }
    const pending = this.startBatch;
    if (pending?.fingerprint === batch.fingerprint) {
      if (
        batch.emitter.some((id) => pending.delivered.has(id)) ||
        !batch.emitter.some((id) => pending.remaining.has(id))
      )
        return null;
      for (const id of batch.emitter) pending.delivered.add(id);
      for (const id of batch.emitter) pending.remaining.delete(id);
      if (pending.remaining.size === 0) this.startBatch = null;
      return true;
    }
    const remaining = new Set(batch.changed.filter((id) => !batch.emitter.includes(id)));
    this.startBatch = remaining.size
      ? { fingerprint: batch.fingerprint, remaining, delivered: new Set(batch.emitter) }
      : null;
    return false;
  }

  start(event: GestureResponderEvent) {
    if (this.lastStartEvent === event.nativeEvent) {
      this.update(event);
      return;
    }
    this.lastStartEvent = event.nativeEvent;
    const repeat = this.batchRepeat(event);
    this.reconcile(event);
    const pending = this.pendingGrant;
    const changed = new Set(event.nativeEvent.changedTouches.map(({ identifier }) => identifier));
    this.flushGrant(changed);
    if (repeat === null) {
      for (const identifier of changed) {
        this.publish(this.input.finish(identifier));
        this.contacts.set(identifier, { startedAt: null, state: 'ignored' });
      }
      this.current().onError(new Error(INTERRUPTED_TOUCH_MESSAGE));
      this.update(event);
      return;
    }
    if (!repeat)
      for (const touch of event.nativeEvent.changedTouches) {
        const contact = this.contacts.get(touch.identifier);
        const granted =
          pending?.event === event.nativeEvent &&
          contact !== undefined &&
          pending.contacts.has(contact);
        if (contact?.startedAt === null && readStartBatch(event) !== 'absent') continue;
        if (contact && !granted) {
          this.contacts.delete(touch.identifier);
          this.publish(this.input.finish(touch.identifier));
        }
        if (granted && contact.state === 'awaiting-start') this.accept(touch, contact);
      }
    this.paperTarget ??= responderTarget(event);
    if (!repeat) this.admit(event, changed);
    for (const contact of this.contacts.values())
      if (contact.state === 'awaiting-start') contact.state = 'ignored';
    this.update(event);
  }

  private update(event: GestureResponderEvent) {
    this.reconcile(event);
    this.flushGrant(new Set());
    for (const touch of event.nativeEvent.touches) this.sample(touch);
    this.publish();
  }

  move(event: GestureResponderEvent) {
    this.startBatch = null;
    this.lastStartEvent = null;
    for (const contact of this.contacts.values())
      if (contact.state === 'awaiting-start') contact.state = 'ignored';
    this.update(event);
  }

  end(event: GestureResponderEvent) {
    this.startBatch = null;
    this.lastStartEvent = null;
    const present = new Set(event.nativeEvent.touches.map(({ identifier }) => identifier));
    const ended = new Map(
      event.nativeEvent.changedTouches.map((touch) => [
        touch.identifier,
        contactLifetime(event, touch, 'ended')?.startedAt,
      ])
    );
    this.flushGrant(
      new Set(
        (this.pendingGrant?.samples ?? [])
          .filter(
            ({ touch }) =>
              !present.has(touch.identifier) &&
              ended.get(touch.identifier) !== this.contacts.get(touch.identifier)?.startedAt
          )
          .map(({ touch }) => touch.identifier)
      )
    );
    for (const touch of event.nativeEvent.changedTouches) {
      if (event.nativeEvent.touches.some(({ identifier }) => identifier === touch.identifier))
        continue;
      const lifetime = contactLifetime(event, touch, 'ended');
      if (lifetime?.startedAt === this.contacts.get(touch.identifier)?.startedAt)
        this.sample(touch, true);
      this.contacts.delete(touch.identifier);
      this.publish(this.input.finish(touch.identifier));
    }
    this.move(event);
  }

  interrupt() {
    this.flushGrant(new Set(), true);
    this.startBatch = null;
    this.lastStartEvent = null;
    this.contacts.clear();
    this.paperTarget = null;
    this.publish(this.input.interrupt());
  }

  detach() {
    this.flushGrant(new Set(), true);
    this.startBatch = null;
    this.lastStartEvent = null;
    this.contacts.clear();
    this.paperTarget = null;
    const completed = this.input.interrupt();
    if (completed) this.current().onCohort(completed);
    this.current().onDrawingChange(false);
  }

  resize() {
    this.flushGrant(new Set(), true);
    this.startBatch = null;
    this.lastStartEvent = null;
    for (const contact of this.contacts.values()) contact.state = 'ignored';
    this.publish(this.input.interrupt());
  }
}

export function createContactResponder(
  current: () => ContactDrawingProps,
  frame: () => PaperFrame | null,
  showDrafts: (drafts: readonly Stroke[]) => void
) {
  return new ContactResponder(current, frame, showDrafts);
}
