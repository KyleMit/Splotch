export const INPUT_INTERRUPTED_MESSAGE = 'That touch was interrupted. Lift and try again.';
export type InputTool = 'touch' | 'pen' | 'mouse' | 'unknown';
export type InputSample = Readonly<{ pageX: number; pageY: number; timestamp: number }>;
export type InputContact = Readonly<{
  identifier: string;
  startedAt: number;
  tool: InputTool;
  samples: readonly InputSample[];
}>;
export type PaperInput = Readonly<{
  sequence: number;
  phase: 'start' | 'move' | 'end' | 'cancel';
  changed: readonly string[];
  contacts: readonly InputContact[];
  viewport: InputViewport;
}>;
export type InputViewport = Readonly<{ width: number; height: number; bottomInset: number }>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readSample(value: unknown): InputSample | null {
  if (
    !record(value) ||
    !finite(value.pageX) ||
    !finite(value.pageY) ||
    !finite(value.timestamp) ||
    value.timestamp < 0
  )
    return null;
  return { pageX: value.pageX, pageY: value.pageY, timestamp: value.timestamp };
}

function readContact(value: unknown): InputContact | null {
  if (
    !record(value) ||
    typeof value.identifier !== 'string' ||
    !value.identifier ||
    !finite(value.startedAt) ||
    value.startedAt < 0 ||
    !Array.isArray(value.samples) ||
    value.samples.length === 0
  )
    return null;
  const samples: InputSample[] = [];
  let previous = value.startedAt;
  for (const item of value.samples) {
    const sample = readSample(item);
    if (!sample || sample.timestamp < previous) return null;
    samples.push(sample);
    previous = sample.timestamp;
  }
  const tool = value.tool;
  if (tool !== 'touch' && tool !== 'pen' && tool !== 'mouse' && tool !== 'unknown') return null;
  return { identifier: value.identifier, startedAt: value.startedAt, tool, samples };
}

export function readPaperInput(value: unknown): PaperInput | null {
  if (
    !record(value) ||
    !finite(value.sequence) ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 0 ||
    !Array.isArray(value.contacts) ||
    !Array.isArray(value.changed)
  )
    return null;
  const viewport = value.viewport;
  if (
    !record(viewport) ||
    !finite(viewport.width) ||
    viewport.width <= 0 ||
    !finite(viewport.height) ||
    viewport.height <= 0 ||
    !finite(viewport.bottomInset) ||
    viewport.bottomInset < 0
  )
    return null;
  const phase = value.phase;
  if (phase !== 'start' && phase !== 'move' && phase !== 'end' && phase !== 'cancel') return null;
  const contacts: InputContact[] = [];
  const identifiers = new Set<string>();
  for (const item of value.contacts) {
    const contact = readContact(item);
    if (!contact || identifiers.has(contact.identifier)) return null;
    identifiers.add(contact.identifier);
    contacts.push(contact);
  }
  const changed: string[] = [];
  for (const identifier of value.changed) {
    if (
      typeof identifier !== 'string' ||
      !identifiers.has(identifier) ||
      changed.includes(identifier)
    )
      return null;
    changed.push(identifier);
  }
  if (changed.length === 0 && phase !== 'cancel') return null;
  return {
    sequence: value.sequence,
    phase,
    contacts,
    changed,
    viewport: { width: viewport.width, height: viewport.height, bottomInset: viewport.bottomInset },
  };
}
