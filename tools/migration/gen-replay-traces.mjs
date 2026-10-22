// Writes the touch traces the React Native probe build replays open loop into the paper
// (src/drawing/perfReplay.ts). The generated traces come from a
// fixed seed, so a run reproduces the committed files byte for byte; the finger sessions are
// converted from the owner's web input recordings, which stay out of the repository, so they are
// rewritten only when --recordings names the folder holding them.
//
//   npm run gen:native-replay-traces -- [--recordings=<dir with session1.json and session2.json>]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argFlag, isMain, rejectUnknownFlags, runMain } from '../lib/proc.mjs';
import { REPLAY_TRACE_VERSION, readReplayTrace } from '../../src/drawing/replayTrace.ts';

export const REPLAY_TRACE_DIR = join(import.meta.dirname, '../../perf/replay');
export const REPLAY_SEED = 2978;
export const RECORDED_SESSIONS = {
  'finger-session-1': 'session1.json',
  'finger-session-2': 'session2.json',
};

const FRAME_MS = 1000 / 120;
const DIGITIZER_MS = 1000 / 240;
// Positions keep a ten-thousandth of the paper (a tenth of a pixel on a 1000-point paper) and
// times a microsecond, so the files stay small and every value round-trips through JSON.
const POSITION_DECIMALS = 4;
const TIME_DECIMALS = 3;
// A delivered packet trails the frame its newest sample belongs to by this much plus up to
// DELIVERY_JITTER_MS more.
const DELIVERY_MS = 1.2;
const DELIVERY_JITTER_MS = 0.8;

const LONG_NO_LIFT_MS = 20_000;

const BURSTY_STROKES = 5;
const BURSTY_STROKE_FRAMES = 288;
const BURSTY_LIFT_FRAMES = 42;
// How often a normal frame's window is missing one of its two digitizer samples.
const BURSTY_SHORT_WINDOW_ODDS = 0.15;
// Every this many frames the main thread stalls through one frame, so the next packet arrives
// late carrying both frames' samples.
const BURSTY_STALL_EVERY_FRAMES = 60;
const BURSTY_STALL_DELAY_MS = 3;

const TWO_CONTACT_SECOND_START_FRAME = 30;
const TWO_CONTACT_FIRST_END_FRAME = 630;
const TWO_CONTACT_SECOND_END_FRAME = 690;

const roundTo = (decimals) => (value) => {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale + 0;
};
const position = roundTo(POSITION_DECIMALS);
const time = roundTo(TIME_DECIMALS);

// mulberry32: a small seeded generator with a uniform [0, 1) output.
export function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// A smooth wandering path inside an ellipse: per axis, a weighted sum of three sines whose
// frequencies and phases come from the seed.
function createPath(random, { cx, cy, rx, ry }) {
  const waves = () => {
    const raw = [0, 1, 2].map((index) => ({
      hz: 0.4 + 0.28 * index + 0.12 * random(),
      phase: 2 * Math.PI * random(),
      weight: 0.5 + random(),
    }));
    const total = raw.reduce((sum, { weight }) => sum + weight, 0);
    return raw.map((wave) => ({ ...wave, weight: wave.weight / total }));
  };
  const xs = waves();
  const ys = waves();
  const sum = (set, seconds) =>
    set.reduce(
      (value, { hz, phase, weight }) =>
        value + weight * Math.sin(2 * Math.PI * hz * seconds + phase),
      0
    );
  return (ms) => ({
    x: position(cx + rx * sum(xs, ms / 1000)),
    y: position(cy + ry * sum(ys, ms / 1000)),
  });
}

const sampleAt = (path, at) => ({ at, ...path(at) });

// Builds packets with absolute sample times; every held contact is listed in every packet, the
// ones `changes` names at their new samples and the rest at their last one, as the native views
// list a contact that did not move.
function createContacts() {
  const held = new Map();
  return (t, phase, changes) => {
    for (const [id, samples] of Object.entries(changes)) held.set(id, samples.at(-1));
    const contacts = [...held].map(([id, last]) => ({ id, samples: changes[id] ?? [last] }));
    if (phase === 'end' || phase === 'cancel')
      for (const id of Object.keys(changes)) held.delete(id);
    return { t, phase, changed: Object.keys(changes), contacts };
  };
}

// Times from the first packet, rounded, and each sample as its offset from its packet: offsets
// between rounded times, so a sample listed again in a later packet lands on the same time.
function relativeTimes(packets) {
  const origin = packets[0].t;
  return packets.map(({ t, phase, changed, contacts }) => {
    const packetT = time(t - origin);
    const offset = ({ at, x, y }) => ({ dt: time(time(at - origin) - packetT), x, y });
    return {
      t: packetT,
      phase,
      changed,
      contacts: contacts.map(({ id, samples }) => ({ id, samples: samples.map(offset) })),
    };
  });
}

const trace = (name, description, packets, timing = 'generated') => ({
  version: REPLAY_TRACE_VERSION,
  name,
  timing,
  description,
  packets: relativeTimes(packets),
});

function longNoLift(random) {
  const path = createPath(random, { cx: 0.5, cy: 0.5, rx: 0.36, ry: 0.36 });
  const packet = createContacts();
  const last = Math.round(LONG_NO_LIFT_MS / FRAME_MS);
  const packets = [];
  for (let frame = 0; frame <= last; frame++) {
    const t = frame * FRAME_MS;
    const phase = frame === 0 ? 'start' : frame === last ? 'end' : 'move';
    packets.push(packet(t, phase, { 0: [sampleAt(path, t)] }));
  }
  return trace(
    'long-no-lift',
    `One finger held down for ${LONG_NO_LIFT_MS / 1000} s, one sample per packet at 120 Hz, along a smooth path across the paper.`,
    packets
  );
}

// The digitizer times a frame's window holds: its two 240 Hz ticks, or one when a sample is missing.
function windowSamples(frameAt, short) {
  return short ? [frameAt] : [frameAt - DIGITIZER_MS, frameAt];
}

function burstyStroke(random, id, firstFrame) {
  const packet = createContacts();
  const path = createPath(random, { cx: 0.5, cy: 0.5, rx: 0.34, ry: 0.34 });
  const stallOffset = Math.floor(random() * BURSTY_STALL_EVERY_FRAMES);
  const delivery = () => DELIVERY_MS + DELIVERY_JITTER_MS * random();
  const packets = [];
  const startAt = firstFrame * FRAME_MS;
  const startT = startAt + delivery();
  packets.push(packet(startT, 'start', { [id]: [sampleAt(path, startAt)] }));
  let carried = [];
  for (let frame = 1; frame <= BURSTY_STROKE_FRAMES; frame++) {
    const frameAt = (firstFrame + frame) * FRAME_MS;
    const stalled =
      frame < BURSTY_STROKE_FRAMES && (frame + stallOffset) % BURSTY_STALL_EVERY_FRAMES === 0;
    const late = carried.length > 0;
    // A stalled frame's window and the late packet's own window are kept whole but for at most
    // one missing sample between them, so a late packet carries three or four samples.
    const short = late
      ? carried.length === 2 && random() < 0.5
      : !stalled && random() < BURSTY_SHORT_WINDOW_ODDS;
    const times = [...carried, ...windowSamples(frameAt, short)];
    if (stalled) {
      carried = times;
      continue;
    }
    carried = [];
    const t = frameAt + delivery() + (late ? BURSTY_STALL_DELAY_MS * random() : 0);
    packets.push(packet(t, 'move', { [id]: times.map((at) => sampleAt(path, at)) }));
  }
  const endAt = (firstFrame + BURSTY_STROKE_FRAMES + 1) * FRAME_MS;
  const endT = endAt + delivery();
  packets.push(packet(endT, 'end', { [id]: [sampleAt(path, endAt)] }));
  return packets;
}

function bursty(random) {
  const packets = [];
  for (let stroke = 0; stroke < BURSTY_STROKES; stroke++) {
    const firstFrame = stroke * (BURSTY_STROKE_FRAMES + BURSTY_LIFT_FRAMES);
    packets.push(...burstyStroke(random, String(stroke), firstFrame));
  }
  return trace(
    'bursty-120-240',
    `${BURSTY_STROKES} one-finger strokes delivered like coalesced UIKit input: packets at 120 Hz carry one or two samples at 240 Hz spacing, and every ${BURSTY_STALL_EVERY_FRAMES} frames a stalled frame makes the next packet arrive late carrying three or four.`,
    packets
  );
}

function twoContact(random) {
  const paths = {
    0: createPath(random, { cx: 0.32, cy: 0.5, rx: 0.18, ry: 0.34 }),
    1: createPath(random, { cx: 0.68, cy: 0.5, rx: 0.18, ry: 0.34 }),
  };
  const packet = createContacts();
  const packets = [];
  const holding = (id, frame) =>
    id === '0' ? frame < TWO_CONTACT_FIRST_END_FRAME : frame > TWO_CONTACT_SECOND_START_FRAME;
  for (let frame = 0; frame <= TWO_CONTACT_SECOND_END_FRAME; frame++) {
    const at = frame * FRAME_MS;
    const t = at + (frame === 0 ? 0 : DELIVERY_MS + DELIVERY_JITTER_MS * random());
    const sample = (id) => [sampleAt(paths[id], at)];
    if (frame === 0) packets.push(packet(t, 'start', { 0: sample('0') }));
    else if (frame === TWO_CONTACT_SECOND_START_FRAME)
      packets.push(packet(t, 'start', { 1: sample('1') }));
    else if (frame === TWO_CONTACT_FIRST_END_FRAME)
      packets.push(packet(t, 'end', { 0: sample('0') }));
    else if (frame === TWO_CONTACT_SECOND_END_FRAME)
      packets.push(packet(t, 'end', { 1: sample('1') }));
    else {
      const moving = ['0', '1'].filter((id) => holding(id, frame));
      packets.push(packet(t, 'move', Object.fromEntries(moving.map((id) => [id, sample(id)]))));
    }
  }
  return trace(
    'two-contact',
    'Two fingers drawing at once: the second lands 250 ms after the first, both move together at 120 Hz, and the first lifts 500 ms before the second, so both strokes share one contact cohort.',
    packets
  );
}

const GENERATORS = {
  'long-no-lift': longNoLift,
  'bursty-120-240': bursty,
  'two-contact': twoContact,
};
export const GENERATED_TRACES = Object.keys(GENERATORS);

export function generateTrace(name, seed = REPLAY_SEED) {
  const generate = GENERATORS[name];
  if (!generate) throw new Error(`No generator for trace ${name}`);
  return readReplayTrace(generate(createRandom(seed)));
}

const PHASE_OF_EVENT = {
  pointerdown: 'start',
  pointermove: 'move',
  pointerup: 'end',
  pointercancel: 'cancel',
};

// One packet per pointer event of a tools/perf/probes/input-recorder.js recording, at its recorded
// time from the first finger landing, with x and y as fractions of the recorded canvas. A pointer
// event for a pointer not held down (hover) makes no packet; UI action events are dropped.
export function convertWebRecording(recording, { name, source }) {
  const canvas = recording?.meta?.canvas;
  if (!(canvas?.w > 0 && canvas?.h > 0)) throw new Error(`${source}: meta.canvas has no size`);
  if (!Array.isArray(recording.events)) throw new Error(`${source}: no events`);
  const pointers = recording.events.filter((event) => event.kind === 'pointer');
  if (pointers.length === 0) throw new Error(`${source}: no pointer events`);
  const ids = new Map();
  const packet = createContacts();
  const packets = [];
  let landed = 0;
  for (const event of pointers) {
    const phase = PHASE_OF_EVENT[event.type];
    if (!phase) throw new Error(`${source}: unknown pointer event ${event.type}`);
    if (event.pt !== 'touch') throw new Error(`${source}: a ${event.pt} event in a finger session`);
    if (phase === 'start') {
      if (ids.has(event.id)) throw new Error(`${source}: pointer ${event.id} lands twice`);
      ids.set(event.id, String(landed++));
    }
    const id = ids.get(event.id);
    if (id === undefined) continue;
    const sample = {
      at: event.t,
      x: position(event.x / canvas.w),
      y: position(event.y / canvas.h),
    };
    packets.push(packet(event.t, phase, { [id]: [sample] }));
    if (phase === 'end' || phase === 'cancel') ids.delete(event.id);
  }
  if (ids.size > 0) throw new Error(`${source}: the recording ends with a finger down`);
  return readReplayTrace(
    trace(
      name,
      `An iPad finger drawing session (${source}) as the web app's pointer handlers received it, recorded by tools/perf/probes/input-recorder.js. One sample per packet, timed by handler arrival (about 65 events/s), not by the digitizer; the recording's UI action events are dropped.`,
      packets,
      'web-handler-arrival'
    )
  );
}

// One packet per line, so a regenerated trace diffs packet by packet.
export function serializeTrace(value) {
  const { packets, ...head } = value;
  const lines = packets.map((packet) => JSON.stringify(packet)).join(',\n');
  return `${JSON.stringify(head).slice(0, -1)},"packets":[\n${lines}\n]}\n`;
}

export const traceFile = (name) => join(REPLAY_TRACE_DIR, `${name}.json`);

function write(value) {
  writeFileSync(traceFile(value.name), serializeTrace(value));
  console.log(`${value.name}: ${value.packets.length} packets`);
}

async function main() {
  rejectUnknownFlags(['recordings']);
  const recordings = argFlag('recordings');
  mkdirSync(REPLAY_TRACE_DIR, { recursive: true });
  for (const name of GENERATED_TRACES) write(generateTrace(name));
  if (!recordings) return;
  for (const [name, file] of Object.entries(RECORDED_SESSIONS)) {
    const recording = JSON.parse(readFileSync(join(recordings, file), 'utf8'));
    write(convertWebRecording(recording, { name, source: file }));
  }
}

if (isMain(import.meta.url)) runMain(main);
