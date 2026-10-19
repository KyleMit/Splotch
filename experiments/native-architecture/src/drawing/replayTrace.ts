// A recorded or generated touch stream the probe build replays open loop into SplotchPaperInput
// (perfReplay.ts, and SplotchPaperReplay on each platform). The committed traces in
// perf/replay/ are written by tools/migration/gen-replay-traces.mjs. This module imports nothing,
// so that Node script can load it directly.

export const REPLAY_TRACE_VERSION = 1;
export const REPLAY_TRACE_NAMES = [
  'finger-session-1',
  'finger-session-2',
  'long-no-lift',
  'bursty-120-240',
  'two-contact',
] as const;
export type ReplayTraceName = (typeof REPLAY_TRACE_NAMES)[number];

// Names the trace to replay: on iOS a launch argument (`-SplotchReplay <name>`) or environment
// variable, on Android an intent extra (`-e SplotchReplay <name>`). DEVELOPMENT.md has the commands.
export const REPLAY_LAUNCH_KEY = 'SplotchReplay';
export const REPLAY_MODULE = 'SplotchPaperReplay';
// From the paper input view's first non-empty layout to the first packet, so launch work that
// would otherwise land on the first packets has finished.
export const REPLAY_SETTLE_MS = 3000;

// generated: every sample's time is when a digitizer would have taken it. web-handler-arrival:
// each sample's time is when a web pointer handler received the event, one sample per packet.
type ReplayTiming = 'generated' | 'web-handler-arrival';
type ReplayPhase = 'start' | 'move' | 'end' | 'cancel';
// dt is the sample's offset from its packet's emission, never after it; x and y are fractions of
// the paper input view's width and height.
type ReplaySample = Readonly<{ dt: number; x: number; y: number }>;
type ReplayContact = Readonly<{ id: string; samples: readonly ReplaySample[] }>;
// t is the packet's emission time from the start of the replay. Every held contact is listed in
// every packet, as the native views send them; `changed` names the ones this packet is about.
type ReplayPacket = Readonly<{
  t: number;
  phase: ReplayPhase;
  changed: readonly string[];
  contacts: readonly ReplayContact[];
}>;
export type ReplayTrace = Readonly<{
  version: typeof REPLAY_TRACE_VERSION;
  name: ReplayTraceName;
  timing: ReplayTiming;
  description: string;
  packets: readonly ReplayPacket[];
}>;

const PHASES = ['start', 'move', 'end', 'cancel'] as const satisfies readonly ReplayPhase[];
const TIMINGS = ['generated', 'web-handler-arrival'] as const satisfies readonly ReplayTiming[];

// A sample's time from the start of the replay, rounded to the microsecond so a sample listed
// again in a later packet (t + dt summed differently) lands on exactly the same time; the native
// replay drivers round the same way.
export function sampleTimeMs(t: number, dt: number) {
  return Math.round((t + dt) * 1000) / 1000;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fraction(value: unknown): value is number {
  return finite(value) && value >= 0 && value <= 1;
}

export function isReplayTraceName(value: unknown): value is ReplayTraceName {
  return REPLAY_TRACE_NAMES.some((name) => name === value);
}

function isPhase(value: unknown): value is ReplayPhase {
  return PHASES.some((phase) => phase === value);
}

function isTiming(value: unknown): value is ReplayTiming {
  return TIMINGS.some((timing) => timing === value);
}

function readSample(value: unknown, at: string): ReplaySample {
  if (
    !record(value) ||
    !finite(value.dt) ||
    value.dt > 0 ||
    !fraction(value.x) ||
    !fraction(value.y)
  )
    throw new Error(`${at}: a sample is { dt <= 0, x and y in [0, 1] }`);
  return { dt: value.dt, x: value.x, y: value.y };
}

function readContact(value: unknown, at: string): ReplayContact {
  if (!record(value) || typeof value.id !== 'string' || !value.id)
    throw new Error(`${at}: a contact needs a non-empty string id`);
  const { id, samples } = value;
  if (!Array.isArray(samples) || samples.length === 0)
    throw new Error(`${at}: contact ${id} has no samples`);
  return {
    id,
    samples: samples.map((sample: unknown) => readSample(sample, `${at} contact ${id}`)),
  };
}

function readPacket(value: unknown, at: string): ReplayPacket {
  if (!record(value) || !finite(value.t) || value.t < 0)
    throw new Error(`${at}: a packet needs a time t >= 0`);
  const { t, phase } = value;
  if (!isPhase(phase)) throw new Error(`${at}: unknown phase ${String(phase)}`);
  if (!Array.isArray(value.contacts) || !Array.isArray(value.changed) || value.changed.length === 0)
    throw new Error(`${at}: a packet lists its contacts and the ones it changed`);
  const contacts = value.contacts.map((contact: unknown) => readContact(contact, at));
  const ids = contacts.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error(`${at}: a contact is listed twice`);
  const changed = value.changed.map((id: unknown) => {
    if (typeof id !== 'string' || !ids.includes(id))
      throw new Error(`${at}: changed names a contact the packet does not list`);
    return id;
  });
  if (new Set(changed).size !== changed.length) throw new Error(`${at}: changed repeats a contact`);
  return { t, phase, changed, contacts };
}

// What paperInputOwner needs of a packet stream: a contact begins in a start packet that changes
// it, appears in every packet until a packet that changes it ends or cancels it, never returns,
// and its sample times never go backward.
function checkLifecycle(packets: readonly ReplayPacket[]) {
  const lastSampleAt = new Map<string, number>();
  const ended = new Set<string>();
  let previous = 0;
  for (const [index, packet] of packets.entries()) {
    const at = `packet ${index}`;
    if (packet.t < previous) throw new Error(`${at}: t goes backward`);
    previous = packet.t;
    const changed = new Set(packet.changed);
    const listed = new Set(packet.contacts.map(({ id }) => id));
    for (const id of lastSampleAt.keys())
      if (!listed.has(id)) throw new Error(`${at}: held contact ${id} is missing`);
    for (const { id, samples } of packet.contacts) {
      if (ended.has(id)) throw new Error(`${at}: contact ${id} returns after it ended`);
      const begins = !lastSampleAt.has(id);
      if (begins !== (packet.phase === 'start' && changed.has(id)))
        throw new Error(
          `${at}: only a start packet begins a contact, and it begins each it changes`
        );
      let last = begins ? sampleTimeMs(packet.t, samples[0].dt) : (lastSampleAt.get(id) ?? 0);
      for (const { dt } of samples) {
        const sampledAt = sampleTimeMs(packet.t, dt);
        if (sampledAt < last) throw new Error(`${at}: contact ${id} goes back in time`);
        last = sampledAt;
      }
      lastSampleAt.set(id, last);
      if ((packet.phase === 'end' || packet.phase === 'cancel') && changed.has(id)) {
        lastSampleAt.delete(id);
        ended.add(id);
      }
    }
  }
  if (lastSampleAt.size > 0)
    throw new Error(`the trace ends with contacts ${[...lastSampleAt.keys()].join(', ')} held`);
}

// Throws, naming the first fault, unless `value` is a trace a replay can emit as written.
export function readReplayTrace(value: unknown): ReplayTrace {
  if (!record(value) || value.version !== REPLAY_TRACE_VERSION)
    throw new Error(`a replay trace is version ${REPLAY_TRACE_VERSION}`);
  const { name, timing, description } = value;
  if (!isReplayTraceName(name)) throw new Error(`unknown trace name ${String(name)}`);
  if (!isTiming(timing)) throw new Error(`unknown timing ${String(timing)}`);
  if (typeof description !== 'string' || !description) throw new Error('a trace describes itself');
  if (!Array.isArray(value.packets) || value.packets.length === 0)
    throw new Error('a trace has packets');
  const packets = value.packets.map((packet: unknown, index: number) =>
    readPacket(packet, `packet ${index}`)
  );
  if (packets[0].t !== 0) throw new Error('the first packet is at t = 0');
  checkLifecycle(packets);
  return { version: REPLAY_TRACE_VERSION, name, timing, description, packets };
}
