import {
  adoptPaper,
  containsPaperPoint,
  drawingPaper,
  paperContactPoint,
  presentedPaperSize,
  textureScale,
  type AdoptedPaper,
  type PaperReference,
  type PaperSize,
} from './paperSpace';
import { createPaperInputOwner } from './paperInputOwner';
import { INPUT_INTERRUPTED_MESSAGE, type InputSample, type InputTool } from './paperInput';
import type { GuardEdge } from '../../../../web/src/lib/drawing/strokeMath';
import type { ContactSound, SoundContact } from '../audio/contactSound';
import { createContactCohort } from './contactCohort';
import { paperPoint, type Drawing, type Stroke } from './model';
import type { Brush } from './brushes';
import type { PaintColor } from './palette';
import { paperLocation, type PaperFrame } from './paperGeometry';
import { strokeWidthPx, type StrokeWidth } from './strokeWidth';
import { haloKind, haloSize, type Halo } from './haloModel';

export type ContactDrawingProps = {
  currentDrawing: () => Drawing;
  color: PaintColor;
  brush: Brush;
  strokeWidth: StrokeWidth;
  eraserWidth: StrokeWidth;
  disabled: boolean;
  isChromeTouch?: (touch: ContactSample) => boolean;
  onCohort: (strokes: readonly Stroke[], paper: PaperReference) => void;
  onDrawingChange: (drawing: boolean) => void;
  onError: (error: unknown) => void;
  sound?: ContactSound | null;
};

type ContactHalo = { id: number; brush: Brush; width: number; x: number; y: number };
export type ContactStyle = Pick<
  ContactDrawingProps,
  'color' | 'brush' | 'strokeWidth' | 'eraserWidth'
>;
export type OwnedContact = {
  startedAt: number;
  style: ContactStyle;
  admission:
    | { kind: 'accepted'; halo: ContactHalo }
    | { kind: 'guarded'; edge: GuardEdge; first: ContactSample; pending: InputSample[] }
    | { kind: 'ignored' };
  input: { tool: InputTool; last: InputSample };
  sound: SoundContact | null;
};
export type ContactSample = InputSample & { identifier: string };

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

  observeInputStyle() {
    this.packetInput.observeStyle();
  }

  constructor(
    private readonly current: () => ContactDrawingProps,
    private readonly frame: () => PaperFrame | null,
    private readonly showDrafts: (
      drafts: readonly Stroke[],
      paper: PaperReference | null,
      halos: readonly Halo[]
    ) => void,
    private readonly pixelRatio: () => number
  ) {}

  private publish(completed: readonly Stroke[] | null = null) {
    if (completed) this.current().onCohort(completed, this.input.paper());
    this.showDrafts(
      this.input.drafts(),
      this.input.hasActive() ? this.input.paper() : null,
      this.halos()
    );
    this.current().onDrawingChange(this.input.hasActive());
  }

  private halos(): readonly Halo[] {
    const frame = this.frame();
    if (!frame || !this.input.hasActive()) return [];
    const paper = this.input.paper();
    return [...this.contacts.values()].flatMap(({ admission }) =>
      admission.kind === 'accepted'
        ? [
            {
              id: admission.halo.id,
              kind: haloKind(admission.halo.brush),
              x: admission.halo.x,
              y: admission.halo.y,
              size: haloSize(admission.halo.width, paper, frame),
            },
          ]
        : []
    );
  }

  private finish(identifier: string) {
    const contact = this.contacts.get(identifier);
    contact?.sound?.end();
    if (contact) contact.admission = { kind: 'ignored' };
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

  // The paper a new contact draws on: the live cohort's, or the picture's own. A blank picture
  // has none yet; it takes the shape of the measured ink plane.
  private contactPaper(): PaperReference {
    return this.input.hasActive()
      ? this.input.paper()
      : drawingPaper(this.current().currentDrawing());
  }

  private contactSize(): PaperSize | null {
    const frame = this.frame();
    const paper = this.contactPaper();
    return !frame || paper.kind === 'legacy' ? null : presentedPaperSize(paper, frame);
  }

  private adoption(frame: PaperFrame): AdoptedPaper | null {
    if (this.input.hasActive()) return null;
    return drawingPaper(this.current().currentDrawing()).kind === 'unadopted'
      ? adoptPaper(frame.width, frame.height, this.pixelRatio())
      : null;
  }

  private paperSample(point: { x: number; y: number }, frame: PaperFrame, paper: PaperReference) {
    return paper.kind === 'legacy'
      ? paperPoint(point.x, point.y, frame.width, frame.height)
      : paperContactPoint(
          point.x,
          point.y,
          frame.width,
          frame.height,
          presentedPaperSize(paper, frame)
        );
  }

  private sample(touch: ContactSample, audible: boolean) {
    if (this.contacts.get(touch.identifier)?.admission.kind !== 'accepted') return;
    try {
      const frame = this.frame();
      const point = paperLocation(touch, frame);
      if (!frame || !point) throw new Error(INPUT_INTERRUPTED_MESSAGE);
      const paper = this.input.paper();
      const sample = this.paperSample(point, frame, paper);
      this.input.sample(touch.identifier, sample, true);
      const contact = this.contacts.get(touch.identifier);
      if (audible) {
        const texel = textureScale(paper);
        contact?.sound?.sample({ x: sample.x / texel, y: sample.y / texel }, touch.timestamp);
      }
      if (contact?.admission.kind === 'accepted') Object.assign(contact.admission.halo, point);
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
      contact.admission = {
        kind: 'accepted',
        halo: {
          id: this.nextHalo++,
          brush: style.brush,
          width: strokeWidthPx(style.brush, width),
          ...point,
        },
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
    this.publish(this.input.interrupt());
  }

  attach() {
    this.packetInput.attach();
  }

  detach() {
    this.packetInput.detach();
    this.silence();
    this.contacts.clear();
    const completed = this.input.interrupt();
    if (completed) this.current().onCohort(completed, this.input.paper());
    this.current().onDrawingChange(false);
  }

  finishInput() {
    this.silence();
    for (const contact of this.contacts.values()) {
      contact.admission = { kind: 'ignored' };
    }
    this.publish(this.input.interrupt());
  }
}

export function createContactResponder(
  current: () => ContactDrawingProps,
  frame: () => PaperFrame | null,
  showDrafts: (
    drafts: readonly Stroke[],
    paper: PaperReference | null,
    halos: readonly Halo[]
  ) => void,
  pixelRatio: () => number
) {
  return new ContactResponder(current, frame, showDrafts, pixelRatio);
}
