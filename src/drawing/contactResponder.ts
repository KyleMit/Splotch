import {
  adoptPaper,
  containsPaperPoint,
  drawingPaper,
  paperContactPoint,
  paperBounds,
  paperProjection,
  paperProjectionView,
  paperSize,
  type PaperProjection,
  presentedPaperSize,
  textureScale,
  type AdoptedPaper,
  type PaperReference,
  type PaperSize,
} from './paperSpace';
import { createPaperInputOwner } from './paperInputOwner';
import { INPUT_INTERRUPTED_MESSAGE, type InputSample, type InputTool } from './paperInput';
import { pointerWasResumed, type GuardEdge } from '../lib/drawing/strokeMath';
import type { ContactSound, SoundContact } from '../audio/contactSound';
import { createContactCohort } from './contactCohort';
import { paperPoint, type Drawing, type Point, type Stroke } from './model';
import type { LiveInkFeed } from './liveInk';
import type { Brush } from './brushes';
import type { PaintColor } from './palette';
import { paperLocation, type PaperFrame } from './paperGeometry';
import { strokeWidthPx, type StrokeWidth } from './strokeWidth';
import { haloKind, haloSize, type Halo } from './haloModel';
import { PERF_PROBE, perfSampleTime, perfStroke } from './perfProbe';

export type ContactDrawingProps = {
  currentDrawing: () => Drawing;
  projection?: PaperProjection;
  color: PaintColor;
  brush: Brush;
  strokeWidth: StrokeWidth;
  eraserWidth: StrokeWidth;
  disabled: boolean;
  isChromeTouch?: (touch: ContactSample) => boolean;
  onCohort: (strokes: readonly Stroke[], paper: PaperReference) => void;
  onDrawingChange: (drawing: boolean, paper: PaperReference | null) => void;
  onError: (error: unknown) => void;
  sound?: ContactSound | null;
};

type ContactHalo = { id: number; brush: Brush; width: number; x: number; y: number };
// The paper point and time of an accepted contact's latest sample.
type ContactTrail = { at: number; point: Point };
type HoverHalo = Readonly<{ id: number; x: number; y: number }>;
export type ContactStyle = Pick<
  ContactDrawingProps,
  'color' | 'brush' | 'strokeWidth' | 'eraserWidth'
>;
export type OwnedContact = {
  startedAt: number;
  style: ContactStyle;
  admission:
    | { kind: 'accepted'; halo: ContactHalo; trail: ContactTrail }
    | { kind: 'guarded'; edge: GuardEdge; first: ContactSample; pending: InputSample[] }
    | { kind: 'ignored' };
  input: { tool: InputTool; last: InputSample };
  sound: SoundContact | null;
};
export type ContactSample = InputSample & { identifier: string };

// Shipping's dropped-pointer recovery (engine.ts restartStrokeIfResumed): a sample after an idle gap
// and too far away for continuous contact means the pointer lifted and came down again without the
// stream reporting it, so its stroke must not bridge the two places. Both distances are paper
// units, so the jump threshold scales with the paper as shipping's does.
function resumedAfterLift(trail: ContactTrail, point: Point, at: number, paper: PaperReference) {
  const { width, height } = paperSize(paper);
  const jump = Math.hypot(point.x - trail.point.x, point.y - trail.point.y);
  return pointerWasResumed(at - trail.at, jump, Math.min(width, height));
}

function insidePaper(
  touch: ContactSample,
  frame: PaperFrame | null,
  size: PaperSize | null
): boolean {
  const point = paperLocation(touch, frame);
  return (
    frame !== null &&
    point !== null &&
    (size === null
      ? point.x >= 0 && point.x <= frame.width && point.y >= 0 && point.y <= frame.height
      : containsPaperPoint(point.x, point.y, frame.width, frame.height, size))
  );
}

class ContactResponder {
  private readonly input = createContactCohort();
  private readonly contacts = new Map<string, OwnedContact>();
  private nextHalo = 1;
  private hovering: HoverHalo | null = null;
  private readonly packetInput = createPaperInputOwner({
    contacts: this.contacts,
    currentStyle: () => {
      const { color, brush, strokeWidth, eraserWidth } = this.current();
      return { color, brush, strokeWidth, eraserWidth };
    },
    canStart: (touch) => this.canStart(touch),
    accept: (touch, contact) => this.accept(touch, contact),
    sample: (touch, audible) => this.sample(touch, audible),
    finish: (identifier) => this.finish(identifier),
    publish: () => this.publish(),
    interrupt: () => this.interrupt(),
    error: (error) => this.current().onError(error),
  });

  receiveInput(value: unknown) {
    this.packetInput.receive(value);
  }

  notePaintChoice(color: PaintColor) {
    this.packetInput.notePaintChoice(color);
  }

  observeInputStyle() {
    if (this.hovering) this.showHover(this.current().brush === 'eraser' ? this.hovering : null);
  }

  // A mouse or pen over the web paper shows the eraser bubble before it presses and after it lifts,
  // as shipping's PointerHalos.svelte does; null when it leaves the paper. Touch never hovers.
  hover(sample: InputSample | null) {
    const point =
      sample && this.current().brush === 'eraser' ? paperLocation(sample, this.frame()) : null;
    this.showHover(point && { id: this.hovering?.id ?? this.nextHalo++, ...point });
  }

  private showHover(next: HoverHalo | null) {
    this.hovering = next;
    this.showLive(this.input.hasActive() ? this.input.paper() : null, this.halos());
  }

  constructor(
    private readonly current: () => ContactDrawingProps,
    private readonly frame: () => PaperFrame | null,
    private readonly showLive: (paper: PaperReference | null, halos: readonly Halo[]) => void,
    private readonly pixelRatio: () => number,
    private readonly live: LiveInkFeed
  ) {}

  private publish(completed: readonly Stroke[] | null = null) {
    if (completed) this.current().onCohort(completed, this.input.paper());
    this.live.publish();
    this.showLive(this.input.hasActive() ? this.input.paper() : null, this.halos());
    this.current().onDrawingChange(
      this.input.hasActive(),
      this.input.hasActive() ? this.input.paper() : null
    );
  }

  // Each contact's halo, and the hovering pointer's bubble unless that pointer is holding a stroke
  // of its own: a mouse keeps its bubble while a finger draws elsewhere, as shipping's does.
  private halos(): readonly Halo[] {
    const frame = this.frame();
    if (!frame) return [];
    const hover = this.hoverHalos(frame);
    if (!this.input.hasActive()) return hover;
    const contacts = this.contactHalos(frame);
    return this.ownStroke() ? contacts : [...contacts, ...hover];
  }

  // The stroke the hovering mouse or pen is holding, if any; touch never hovers.
  private ownStroke() {
    for (const contact of this.contacts.values())
      if (contact.admission.kind === 'accepted' && this.sharesHover(contact))
        return contact.admission;
    return null;
  }

  private contactHalos(frame: PaperFrame): readonly Halo[] {
    const paper = this.input.paper();
    return [...this.contacts.values()].flatMap(({ admission }) =>
      admission.kind === 'accepted'
        ? [
            {
              id: admission.halo.id,
              kind: haloKind(admission.halo.brush),
              x: admission.halo.x,
              y: admission.halo.y,
              size: haloSize(admission.halo.width, paper, frame, this.contactProjection(paper)),
            },
          ]
        : []
    );
  }

  private hoverHalos(frame: PaperFrame): readonly Halo[] {
    if (!this.hovering) return [];
    // Sized on the paper a press here would draw on, which a blank picture adopts on its first press.
    const paper = this.adoption(frame) ?? this.contactPaper();
    const width = strokeWidthPx('eraser', this.current().eraserWidth);
    return [
      {
        id: this.hovering.id,
        kind: 'eraser',
        x: this.hovering.x,
        y: this.hovering.y,
        size: haloSize(width, paper, frame, this.contactProjection(paper)),
      },
    ];
  }

  // A mouse or pen erasing shows one bubble from approach to departure: its press keeps the hover's
  // halo rather than growing a second one in, and the hover after its lift keeps the press's.
  private sharesHover(contact: OwnedContact) {
    return contact.input.tool !== 'touch' && contact.style.brush === 'eraser';
  }

  private haloId(contact: OwnedContact) {
    return (this.sharesHover(contact) ? this.hovering?.id : undefined) ?? this.nextHalo++;
  }

  // Shipping flushes every contact's queued samples when any contact lifts (stopDrawing), so the
  // lifting stroke's last samples land before its cohort can commit.
  private finish(identifier: string) {
    const contact = this.contacts.get(identifier);
    if (contact?.admission.kind === 'accepted' && this.hovering && this.sharesHover(contact))
      this.hovering = { ...this.hovering, id: contact.admission.halo.id };
    contact?.sound?.end();
    if (contact) contact.admission = { kind: 'ignored' };
    this.live.settle();
    this.publish(this.input.finish(identifier));
  }

  silence() {
    for (const contact of this.contacts.values()) {
      contact.sound?.end();
      contact.sound = null;
    }
  }

  hasActive() {
    return this.input.hasActive();
  }

  private ready() {
    return !this.current().disabled && this.frame() !== null;
  }

  // Whether a stroke started now would be admitted, so the web paper can hold the fingers the
  // prerendered shell saw land until it is (PaperInputView.web.tsx).
  isReady() {
    return this.ready();
  }

  // The paper a new contact draws on: the live cohort's, or the picture's own. A blank picture
  // has none yet; it takes the shape of the measured ink plane.
  private contactPaper(): PaperReference {
    return this.input.hasActive()
      ? this.input.paper()
      : drawingPaper(this.current().currentDrawing());
  }

  private contactProjection(paper: PaperReference) {
    const current = this.current().projection;
    return current?.paper === paper ? current : paperProjection(paper);
  }

  private contactSize(): PaperSize | null {
    const frame = this.frame();
    const paper = this.contactPaper();
    return !frame || paper.kind === 'legacy'
      ? null
      : paper.kind === 'unadopted'
        ? presentedPaperSize(paper, frame)
        : paperBounds(this.contactProjection(paper));
  }

  private adoption(frame: PaperFrame): AdoptedPaper | null {
    if (this.input.hasActive()) return null;
    return drawingPaper(this.current().currentDrawing()).kind === 'unadopted'
      ? adoptPaper(frame.width, frame.height, this.pixelRatio())
      : null;
  }

  private paperSample(point: { x: number; y: number }, frame: PaperFrame, paper: PaperReference) {
    if (paper.kind === 'legacy') return paperPoint(point.x, point.y, frame.width, frame.height);
    if (paper.kind === 'unadopted')
      return paperContactPoint(
        point.x,
        point.y,
        frame.width,
        frame.height,
        presentedPaperSize(paper, frame)
      );
    const view = paperProjectionView(this.contactProjection(paper), frame);
    return {
      x: Math.round(((point.x - view.left) / view.scale) * 100) / 100,
      y: Math.round(((point.y - view.top) / view.scale) * 100) / 100,
    };
  }

  private sample(touch: ContactSample, audible: boolean) {
    const contact = this.contacts.get(touch.identifier);
    if (contact?.admission.kind !== 'accepted') return;
    const admission = contact.admission;
    try {
      const frame = this.frame();
      const point = paperLocation(touch, frame);
      if (!frame || !point) throw new Error(INPUT_INTERRUPTED_MESSAGE);
      const paper = this.input.paper();
      const sample = this.paperSample(point, frame, paper);
      if (PERF_PROBE) perfSampleTime(touch.timestamp);
      if (resumedAfterLift(admission.trail, sample, touch.timestamp, paper))
        this.input.resume(touch.identifier, sample);
      else this.input.sample(touch.identifier, sample);
      admission.trail = { at: touch.timestamp, point: sample };
      if (audible) {
        const texel = textureScale(paper);
        contact.sound?.sample({ x: sample.x / texel, y: sample.y / texel }, touch.timestamp);
      }
      Object.assign(admission.halo, point);
    } catch (error) {
      this.current().onError(error);
    }
  }

  private canStart(touch: ContactSample) {
    return (
      this.ready() &&
      !this.current().isChromeTouch?.(touch) &&
      insidePaper(touch, this.frame(), this.contactSize())
    );
  }

  private accept(touch: ContactSample, contact: OwnedContact) {
    try {
      const current = this.current();
      const style = contact.style;
      const frame = this.frame();
      const point = paperLocation(touch, frame);
      if (!frame || !point) throw new Error(INPUT_INTERRUPTED_MESSAGE);
      const adoption = this.adoption(frame);
      const paper = adoption ?? this.contactPaper();
      const sample = this.paperSample(point, frame, paper);
      const width = style.brush === 'eraser' ? style.eraserWidth : style.strokeWidth;
      this.input.start(
        touch.identifier,
        style.color,
        style.brush,
        sample,
        current.currentDrawing(),
        width,
        adoption ? () => adoption : undefined
      );
      if (PERF_PROBE) perfStroke(touch.timestamp);
      contact.admission = {
        kind: 'accepted',
        halo: {
          id: this.haloId(contact),
          brush: style.brush,
          width: strokeWidthPx(style.brush, width),
          ...point,
        },
        trail: { at: touch.timestamp, point: sample },
      };
      const texel = textureScale(paper);
      contact.sound =
        current.sound?.begin({ x: sample.x / texel, y: sample.y / texel }, touch.timestamp) ?? null;
    } catch (error) {
      if (contact.admission.kind === 'guarded') contact.admission = { kind: 'ignored' };
      this.current().onError(error);
    }
  }

  interrupt() {
    this.silence();
    this.contacts.clear();
    this.live.settle();
    this.publish(this.input.interrupt());
  }

  // Construction stays free of effects: StrictMode builds a surface's responder twice and keeps
  // one, so only the attached responder may own the live ink feed.
  attach() {
    this.live.connect(this.input);
    this.packetInput.attach();
  }

  detach() {
    this.hovering = null;
    this.packetInput.detach();
    this.silence();
    this.contacts.clear();
    this.live.settle();
    const completed = this.input.interrupt();
    if (completed) this.current().onCohort(completed, this.input.paper());
    this.current().onDrawingChange(false, null);
  }

  finishInput() {
    this.silence();
    for (const contact of this.contacts.values()) {
      contact.admission = { kind: 'ignored' };
    }
    this.live.settle();
    this.publish(this.input.interrupt());
  }
}

export function createContactResponder(
  current: () => ContactDrawingProps,
  frame: () => PaperFrame | null,
  showLive: (paper: PaperReference | null, halos: readonly Halo[]) => void,
  pixelRatio: () => number,
  live: LiveInkFeed
) {
  return new ContactResponder(current, frame, showLive, pixelRatio, live);
}
