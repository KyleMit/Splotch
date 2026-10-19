import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  convertWebRecording,
  GENERATED_TRACES,
  generateTrace,
  RECORDED_SESSIONS,
  REPLAY_SEED,
  REPLAY_TRACE_DIR,
  serializeTrace,
  traceFile,
} from '../migration/gen-replay-traces.mjs';
import {
  readReplayTrace,
  REPLAY_TRACE_NAMES,
  sampleTimeMs,
} from '../../experiments/native-architecture/src/drawing/replayTrace.ts';

const FRAME_MS = 1000 / 120;
const DIGITIZER_MS = 1000 / 240;
// Times are written to the microsecond, so a 120 Hz or 240 Hz interval reads within this of exact.
const ROUNDING_MS = 0.002;

const committedText = (name) => readFileSync(traceFile(name), 'utf8');
const committed = (name) => readReplayTrace(JSON.parse(committedText(name)));
const changedSamples = (packet) =>
  packet.contacts.filter(({ id }) => packet.changed.includes(id)).flatMap((c) => c.samples);
const intervals = (values) => values.slice(1).map((value, index) => value - values[index]);

function heldThrough(packets) {
  let most = 0;
  let together = 0;
  let since = null;
  for (const packet of packets) {
    most = Math.max(most, packet.contacts.length);
    if (packet.contacts.length > 1) since ??= packet.t;
    else if (since !== null) {
      together = Math.max(together, packet.t - since);
      since = null;
    }
  }
  return { most, together };
}

describe('the committed replay traces', () => {
  it('are exactly the named traces, each a valid trace under its own name', () => {
    expect(readdirSync(REPLAY_TRACE_DIR).sort()).toEqual(
      REPLAY_TRACE_NAMES.map((name) => `${name}.json`).sort()
    );
    expect(Object.keys(RECORDED_SESSIONS).sort()).toEqual(
      REPLAY_TRACE_NAMES.filter((name) => !GENERATED_TRACES.includes(name)).sort()
    );
    for (const name of REPLAY_TRACE_NAMES) expect(committed(name).name).toBe(name);
  });

  // Negative control: a different seed, or any generator edit, changes the bytes.
  it.each(GENERATED_TRACES)('regenerates %s byte for byte from the seed', (name) => {
    expect(serializeTrace(generateTrace(name))).toBe(committedText(name));
    expect(serializeTrace(generateTrace(name, REPLAY_SEED + 1))).not.toBe(committedText(name));
  });

  it('labels the finger sessions as web handler arrivals, one sample per packet', () => {
    for (const name of Object.keys(RECORDED_SESSIONS)) {
      const trace = committed(name);
      expect(trace.timing).toBe('web-handler-arrival');
      expect(trace.description).toMatch(/handler arrival.*not by the digitizer/);
      for (const packet of trace.packets) expect(changedSamples(packet)).toHaveLength(1);
    }
  });

  it('holds one finger down for at least 20 s at 120 Hz in long-no-lift', () => {
    const { packets } = committed('long-no-lift');
    expect(packets.map(({ phase }) => phase)).toEqual([
      'start',
      ...Array(packets.length - 2).fill('move'),
      'end',
    ]);
    expect(packets.at(-1).t).toBeGreaterThanOrEqual(20_000);
    for (const gap of intervals(packets.map(({ t }) => t)))
      expect(Math.abs(gap - FRAME_MS)).toBeLessThan(ROUNDING_MS);
    for (const packet of packets) expect(changedSamples(packet)).toHaveLength(1);
  });

  it('delivers bursty-120-240 at 120 Hz with 240 Hz samples and late three- or four-sample bursts', () => {
    const { packets } = committed('bursty-120-240');
    const moves = packets.filter(({ phase }) => phase === 'move');
    const counts = moves.map((packet) => changedSamples(packet).length);
    const late = moves.filter((_, index) => counts[index] > 2);
    expect(new Set(counts)).toEqual(new Set([1, 2, 3, 4]));
    expect(late.length).toBeGreaterThanOrEqual(20);
    expect(counts.filter((count) => count <= 2).length).toBeGreaterThan(late.length * 40);
    for (const packet of moves)
      for (const gap of intervals(changedSamples(packet).map(({ dt }) => dt)))
        expect(gap / DIGITIZER_MS).toBeCloseTo(Math.round(gap / DIGITIZER_MS), 2);
    // A late packet carries the stalled frame too, so its oldest sample is more than a frame old.
    for (const packet of late) expect(changedSamples(packet)[0].dt).toBeLessThan(-FRAME_MS);
    expect(heldThrough(packets).most).toBe(1);
  });

  it('holds two fingers down together for at least 5 s in two-contact', () => {
    const { packets } = committed('two-contact');
    expect(new Set(packets.flatMap(({ contacts }) => contacts.map(({ id }) => id)))).toEqual(
      new Set(['0', '1'])
    );
    const { most, together } = heldThrough(packets);
    expect(most).toBe(2);
    expect(together).toBeGreaterThanOrEqual(5000);
  });
});

// One finger lands, a second lands and both move, the first lifts, and the second lifts; a hover
// move and two UI actions surround them.
function recording() {
  const pointer = (t, type, id, x, y) => ({ t, kind: 'pointer', type, id, pt: 'touch', x, y });
  return {
    meta: { canvas: { w: 200, h: 100 } },
    events: [
      { t: 90, kind: 'action', name: 'color', value: '#EC534E' },
      pointer(100.5, 'pointermove', 7, 10, 10),
      pointer(110.5, 'pointerdown', 7, 20, 10),
      pointer(125, 'pointermove', 7, 40, 20),
      pointer(126.3, 'pointerdown', 9, 100, 50),
      { t: 127, kind: 'action', name: 'undo' },
      pointer(140, 'pointermove', 9, 120, 60),
      pointer(150, 'pointerup', 7, 50, 30),
      pointer(160, 'pointerup', 9, 130, 70),
    ],
  };
}

describe('convertWebRecording', () => {
  // Negative control: timing from the first pointer event, the hover move, starts the trace at 10 ms.
  it('turns each held pointer event into one packet, in order, at its recorded time', () => {
    const trace = convertWebRecording(recording(), { name: 'finger-session-1', source: 'x.json' });
    expect(trace.timing).toBe('web-handler-arrival');
    expect(trace.packets).toEqual([
      {
        t: 0,
        phase: 'start',
        changed: ['0'],
        contacts: [{ id: '0', samples: [{ dt: 0, x: 0.1, y: 0.1 }] }],
      },
      {
        t: 14.5,
        phase: 'move',
        changed: ['0'],
        contacts: [{ id: '0', samples: [{ dt: 0, x: 0.2, y: 0.2 }] }],
      },
      {
        t: 15.8,
        phase: 'start',
        changed: ['1'],
        contacts: [
          { id: '0', samples: [{ dt: -1.3, x: 0.2, y: 0.2 }] },
          { id: '1', samples: [{ dt: 0, x: 0.5, y: 0.5 }] },
        ],
      },
      {
        t: 29.5,
        phase: 'move',
        changed: ['1'],
        contacts: [
          { id: '0', samples: [{ dt: -15, x: 0.2, y: 0.2 }] },
          { id: '1', samples: [{ dt: 0, x: 0.6, y: 0.6 }] },
        ],
      },
      {
        t: 39.5,
        phase: 'end',
        changed: ['0'],
        contacts: [
          { id: '0', samples: [{ dt: 0, x: 0.25, y: 0.3 }] },
          { id: '1', samples: [{ dt: -10, x: 0.6, y: 0.6 }] },
        ],
      },
      {
        t: 49.5,
        phase: 'end',
        changed: ['1'],
        contacts: [{ id: '1', samples: [{ dt: 0, x: 0.65, y: 0.7 }] }],
      },
    ]);
  });

  it('gives a pointer id that lands again a new contact', () => {
    const { events, meta } = recording();
    const again = { ...events[2], t: 170 };
    const lifted = { ...events.at(-2), t: 171 };
    const trace = convertWebRecording(
      { meta, events: [...events, again, lifted] },
      { name: 'finger-session-1', source: 'x.json' }
    );
    expect(trace.packets.at(-2).changed).toEqual(['2']);
  });

  it.each([
    ['a pen event', (r) => r.events.push({ ...r.events[2], pt: 'pen', t: 200 })],
    ['a finger still down at the end', (r) => r.events.pop()],
    ['a canvas without a size', (r) => delete r.meta.canvas],
    ['a position off the canvas', (r) => (r.events[3].x = 260)],
  ])('refuses a recording with %s', (_case, spoil) => {
    const broken = recording();
    spoil(broken);
    expect(() =>
      convertWebRecording(broken, { name: 'finger-session-1', source: 'x.json' })
    ).toThrow();
  });
});

describe('readReplayTrace', () => {
  const valid = () => structuredClone(committed('two-contact'));
  const start = (packets) =>
    packets.findIndex(({ changed, phase }) => phase === 'start' && changed[0] === '1');

  it.each([
    ['an unknown name', (trace) => (trace.name = 'scribble')],
    ['a sample after its packet', (trace) => (trace.packets[1].contacts[0].samples[0].dt = 0.5)],
    ['a position off the paper', (trace) => (trace.packets[1].contacts[0].samples[0].x = 1.2)],
    ['time going backward', (trace) => (trace.packets[2].t = trace.packets[1].t - 1)],
    [
      'a held contact left out',
      (trace) => trace.packets[start(trace.packets) + 1].contacts.shift(),
    ],
    [
      'a contact that moves before it starts',
      (trace) => (trace.packets[start(trace.packets)].phase = 'move'),
    ],
    [
      'a contact that returns after it ends',
      (trace) => trace.packets.push({ ...trace.packets[1], t: 9e9 }),
    ],
    ['a contact still held at the end', (trace) => trace.packets.pop()],
    ['a first packet after zero', (trace) => (trace.packets[0].t = 1)],
  ])('refuses %s', (_case, spoil) => {
    const trace = valid();
    spoil(trace);
    expect(() => readReplayTrace(trace)).toThrow();
  });

  // Negative control: comparing unrounded t + dt refuses this trace, whose repeated sample sums
  // to a time a float's width earlier than it first had.
  it('reads a sample listed again at a differently summed time as the same time', () => {
    const t = 0.3;
    const dt = -0.1;
    expect(t + dt).not.toBe(0.2);
    expect(sampleTimeMs(t, dt)).toBe(0.2);
    expect(() =>
      readReplayTrace({
        ...valid(),
        packets: [
          {
            t: 0,
            phase: 'start',
            changed: ['0'],
            contacts: [{ id: '0', samples: [{ dt: 0, x: 0, y: 0 }] }],
          },
          {
            t: 0.2,
            phase: 'move',
            changed: ['0'],
            contacts: [{ id: '0', samples: [{ dt: 0, x: 1, y: 1 }] }],
          },
          {
            t,
            phase: 'start',
            changed: ['1'],
            contacts: [
              { id: '0', samples: [{ dt, x: 1, y: 1 }] },
              { id: '1', samples: [{ dt: 0, x: 0, y: 0 }] },
            ],
          },
          {
            t: 1,
            phase: 'cancel',
            changed: ['0', '1'],
            contacts: [
              { id: '0', samples: [{ dt: 0, x: 1, y: 1 }] },
              { id: '1', samples: [{ dt: 0, x: 0, y: 0 }] },
            ],
          },
        ],
      })
    ).not.toThrow();
  });
});
