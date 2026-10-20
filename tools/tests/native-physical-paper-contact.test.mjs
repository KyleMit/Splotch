import { paperInputPacket } from './native-paper-fixtures.mjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPaperInput } from '../../experiments/native-architecture/src/drawing/paperInput.ts';
import { COLOR_CHANGE_DEBOUNCE_MS } from '../../web/src/lib/drawing/strokeMath.ts';
import { createContactResponder } from '../../experiments/native-architecture/src/drawing/contactResponder.ts';
import { createLiveInkFeed } from '../../experiments/native-architecture/src/drawing/liveInk.ts';
import {
  addStrokes,
  createHistory,
  emptyDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { semanticWidth } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import {
  createSecondTouchPress,
  createSecondTouchRoutes,
  nativePressFrame,
} from '../../experiments/native-architecture/src/rsdDrawing/secondTouchPress.ts';
vi.mock('react-native', () => ({ findNodeHandle: (target) => target }));
const TARGET = {};
function touch(identifier, x, y, timestamp) {
  return { identifier, pageX: x, pageY: y, timestamp, target: TARGET };
}
function event(touches, changedTouches = touches, starts = {}) {
  const touchBank = [];
  for (const item of [...touches, ...changedTouches])
    touchBank[item.identifier] = {
      touchActive: touches.some(({ identifier }) => identifier === item.identifier),
      startTimeStamp: starts[item.identifier] ?? item.timestamp,
    };
  return {
    persist() {},
    currentTarget: TARGET,
    nativeEvent: { touches, changedTouches, target: TARGET },
    touchHistory: {
      touchBank,
      mostRecentTimeStamp: Math.max(0, ...[...touches, ...changedTouches].map((t) => t.timestamp)),
    },
  };
}
function fixture(overrides = {}) {
  let history = createHistory();
  let frame = { width: 342, height: 256.5, pageX: 0, pageY: 0 };
  let ratio = 3;
  const pixelRatio = vi.fn(() => ratio);
  const drafts = vi.fn();
  const live = createLiveInkFeed();
  const failure = vi.fn();
  const commit = vi.fn((strokes, paper) => {
    history = addStrokes(history, strokes, paper);
  });
  const input = createContactResponder(
    () => ({
      currentDrawing: () => history.drawing,
      color: 'Red',
      brush: 'crayon',
      strokeWidth: 'extraThick',
      eraserWidth: 'extraThick',
      disabled: false,
      onCohort: commit,
      onDrawingChange: vi.fn(),
      onError: failure,
      ...overrides,
    }),
    () => frame,
    (paper, halos) => drafts(live.drafts(), paper, halos),
    pixelRatio,
    live
  );
  // The surface attaches its responder before any packet arrives; attaching connects the feed.
  input.attach();
  let sequence = 0;
  function send(phase, next) {
    const packet = paperInputPacket(phase, next, sequence++, {
      width: 342,
      height: 704,
      bottomInset: 34,
    });
    if (packet) input.receiveInput(packet);
  }
  function start(item) {
    send('start', event([item]));
  }
  return {
    input,
    drafts,
    failure,
    commit,
    pixelRatio,
    start,
    send,
    history: () => history,
    resize: () => {
      frame = { ...frame, width: 760, height: 570 };
      ratio = 1;
    },
  };
}

describe('normal contact adoption owner', () => {
  it('rejects nonfinite and disconnected native chrome bounds before paper admission', () => {
    expect(nativePressFrame(null)).toBeNull();
    for (const frame of [
      { x: 0, y: 0, width: Infinity, height: 20 },
      { x: NaN, y: 0, width: 20, height: 20 },
      { x: 0, y: 0, width: 0, height: 20 },
    ])
      expect(nativePressFrame({ getBoundingClientRect: () => frame })).toBeNull();
    const frame = { x: 10, y: 20, width: 30, height: 40 };
    expect(nativePressFrame({ getBoundingClientRect: () => frame })).toEqual(frame);
  });

  it('routes a secondary chrome contact outside paper admission even when Android targets the paper', () => {
    const routes = createSecondTouchRoutes();
    const press = vi.fn();
    const frame = { x: 40, y: 40, width: 20, height: 20 };
    const secondary = createSecondTouchPress({
      enabled: () => true,
      measure: (done) => done(frame),
      pressIn() {},
      pressOut() {},
      press,
    });
    routes.register({ ...secondary, bounds: () => frame, priority: 'control' });
    const f = fixture({ isChromeTouch: routes.containsPoint });
    const first = touch('paper', 10, 20, 100);
    f.start(first);
    const chrome = touch('chrome', 50, 50, 200);
    const down = event([first, chrome], [chrome], { paper: 100, chrome: 200 });
    routes.start(down);
    f.send('start', down);
    expect(f.drafts.mock.calls.at(-1)[0]).toHaveLength(1);
    expect(f.input.hasActive()).toBe(true);
    const lift = event([first], [touch('chrome', 50, 50, 300)], { paper: 100, chrome: 200 });
    f.send('end', lift);
    routes.end(lift);
    expect(press).toHaveBeenCalledTimes(1);
    f.send('end', event([], [touch('paper', 12, 22, 400)], { paper: 100 }));
    expect(f.history().drawing.strokes).toHaveLength(1);
    expect(f.commit).toHaveBeenCalledTimes(1);
  });

  it('admits a paper contact whose independent native identifier matches a held chrome contact', () => {
    const routes = createSecondTouchRoutes();
    const press = vi.fn();
    const frame = { x: 40, y: 40, width: 20, height: 20 };
    routes.register({
      ...createSecondTouchPress({
        enabled: () => true,
        measure: (done) => done(frame),
        pressIn() {},
        pressOut() {},
        press,
      }),
      bounds: () => frame,
      priority: 'control',
    });
    const f = fixture({ isChromeTouch: routes.containsPoint });
    const first = touch('0', 100, 100, 100);
    f.start(first);
    const chrome = touch('1', 50, 50, 200);
    routes.start(event([first, chrome], [chrome]));
    const paper = touch('1', 200, 100, 300);
    f.send('start', event([first, paper], [paper], { 0: 100, 1: 300 }));
    expect(f.drafts.mock.calls.at(-1)[0]).toHaveLength(2);
    f.send(
      'end',
      event([], [touch('0', 120, 100, 400), touch('1', 220, 100, 400)], { 0: 100, 1: 300 })
    );
    routes.end(event([first], [touch('1', 50, 50, 400)]));
    expect(f.history().drawing.strokes).toHaveLength(2);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(press).toHaveBeenCalledTimes(1);
  });

  it('adopts measured content and capped actual PixelRatio before live ink and commits them atomically', () => {
    const f = fixture();
    f.start(touch('a', 171, 128.25, 1));
    const [strokes, paper] = f.drafts.mock.calls.at(-1);
    expect(strokes[0].points).toEqual([{ x: 512, y: 384 }]);
    expect(paper).toEqual({ kind: 'adopted', cssWidth: 342, cssHeight: 256.5, backingScale: 2 });
    expect((semanticWidth(strokes[0].width, paper) * 342) / 1024).toBeCloseTo(22, 12);
    expect(f.history().drawing).toEqual(emptyDrawing());
    f.send('end', event([], [touch('a', 200, 128.25, 2)], { a: 1 }));
    expect(f.history().drawing.paper).toBe(paper);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.pixelRatio).toHaveBeenCalledTimes(1);
    expect(f.failure).not.toHaveBeenCalled();
  });

  it('retains live adoption through reflow and later locked-picture contacts', () => {
    const f = fixture();
    f.start(touch('a', 171, 128.25, 1));
    const paper = f.drafts.mock.calls.at(-1)[1];
    f.resize();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.history().drawing).toEqual(emptyDrawing());
    expect(f.drafts.mock.calls.at(-1)[1]).toBe(paper);
    f.send('end', event([], [touch('a', 380, 285, 2)], { a: 1 }));
    expect(f.history().drawing.paper).toBe(paper);
    f.start(touch('b', 380, 285, 3));
    expect(f.drafts.mock.calls.at(-1)[1]).toBe(paper);
    f.send('end', event([], [touch('b', 400, 285, 4)], { b: 3 }));
    expect(f.pixelRatio).toHaveBeenCalledTimes(1);
    expect(f.history().drawing.strokes).toHaveLength(2);
    expect(f.history().undo).toHaveLength(2);
  });

  it('ignores a touch outside the actual content owner without adopting or committing', () => {
    const f = fixture();
    f.start(touch('outside', 343, 128, 1));
    f.input.interrupt();
    expect(f.pixelRatio).not.toHaveBeenCalled();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.history().drawing.paper).toEqual({ kind: 'unadopted' });
  });
});

afterEach(() => vi.restoreAllMocks());

function packetFixture(overrides = {}) {
  const f = fixture(overrides);
  const contacts = new Map();
  let sequence = 0;
  f.input.observeInputStyle();
  const viewport = { width: 342, height: 256.5, bottomInset: 34 };
  function send(phase, identifier, samples, tool = 'touch') {
    const previous = contacts.get(identifier);
    contacts.set(identifier, {
      identifier,
      startedAt: previous?.startedAt ?? samples[0].timestamp,
      tool,
      samples,
    });
    const packet = {
      phase,
      sequence: sequence++,
      changed: [identifier],
      contacts: [...contacts.values()],
      viewport,
    };
    f.input.receiveInput(packet);
    for (const [id, contact] of contacts)
      contacts.set(id, { ...contact, samples: [contact.samples.at(-1)] });
    if (phase === 'end' || phase === 'cancel') contacts.delete(identifier);
    return packet;
  }
  return { ...f, send, viewport };
}
const sample = (pageX, pageY, timestamp) => ({ pageX, pageY, timestamp });

describe('paper-scoped ordered input and shipping input hygiene', () => {
  it('keeps every intermediate zigzag sample in the existing contact cohort', () => {
    const f = packetFixture();
    f.send('start', 'a', [sample(50, 50, 100)]);
    f.send('move', 'a', [sample(100, 100, 110), sample(150, 50, 120), sample(200, 100, 130)]);
    f.send('end', 'a', [sample(250, 50, 140)]);
    expect(f.history().drawing.strokes[0].points).toEqual([
      { x: 149.71, y: 149.71 },
      { x: 299.42, y: 299.42 },
      { x: 449.12, y: 149.71 },
      { x: 598.83, y: 299.42 },
      { x: 748.54, y: 149.71 },
    ]);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.failure).not.toHaveBeenCalled();
  });

  it.each([
    ['touch', 0],
    ['mouse', 0],
    ['pen', 1],
  ])('applies shipping color-change debounce to %s', (tool, count) => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const style = { color: 'Red' };
    const f = packetFixture(style);
    f.input.notePaintChoice('Blue');
    style.color = 'Blue';
    f.input.observeInputStyle();
    clock.mockReturnValue(1000 + COLOR_CHANGE_DEBOUNCE_MS - 1);
    f.send('start', 'a', [sample(50, 50, 100)], tool);
    f.send('end', 'a', [sample(60, 60, 110)], tool);
    expect(f.history().drawing.strokes).toHaveLength(count);
  });

  it('admits a fresh finger contact at the shipping debounce boundary', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const style = { color: 'Red' };
    const f = packetFixture(style);
    f.input.notePaintChoice('Blue');
    style.color = 'Blue';
    f.input.observeInputStyle();
    clock.mockReturnValue(1000 + COLOR_CHANGE_DEBOUNCE_MS);
    f.send('start', 'a', [sample(50, 50, 100)]);
    f.send('end', 'a', [sample(60, 60, 110)]);
    expect(f.history().drawing.strokes).toHaveLength(1);
  });

  it('times the debounce from the pick, not from the render that delivers the paint', () => {
    // On the Galaxy the render after a swatch tap held the JS thread for up to 223 ms, and the
    // finger that landed meanwhile was read 5 ms after it committed (#3071).
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const style = { color: 'Red' };
    const f = packetFixture(style);
    f.input.notePaintChoice('Blue');
    clock.mockReturnValue(1000 + 223);
    style.color = 'Blue';
    f.input.observeInputStyle();
    clock.mockReturnValue(1000 + 228);
    f.send('start', 'a', [sample(50, 50, 100)]);
    f.send('end', 'a', [sample(60, 60, 110)]);
    expect(f.history().drawing.strokes).toHaveLength(1);
    expect(f.history().drawing.strokes[0].color).toBe('Blue');
  });

  it('arms the debounce only for a genuine paint change, as shipping setColor does', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const style = { color: 'Red', brush: 'pen' };
    const f = packetFixture(style);
    f.input.notePaintChoice('Red');
    style.brush = 'crayon';
    f.input.observeInputStyle();
    clock.mockReturnValue(1001);
    f.send('start', 'a', [sample(50, 50, 100)]);
    f.send('end', 'a', [sample(60, 60, 110)]);
    expect(f.history().drawing.strokes).toHaveLength(1);
  });

  it.each([
    ['touch', 0],
    ['pen', 1],
    ['mouse', 1],
  ])('discards an inward home-edge swipe only for %s', (tool, count) => {
    const f = packetFixture();
    f.send('start', 'a', [sample(150, 250, 100)], tool);
    f.send('move', 'a', [sample(150, 230, 110), sample(150, 200, 120)], tool);
    f.send('end', 'a', [sample(150, 180, 130)], tool);
    expect(f.history().drawing.strokes).toHaveLength(count);
    expect(f.history().undo).toHaveLength(count);
    expect(f.failure).not.toHaveBeenCalled();
  });

  it('commits an edge tap and an along-edge stroke with their buffered samples', () => {
    const f = packetFixture();
    f.send('start', 'tap', [sample(150, 250, 100)]);
    expect(f.input.hasActive()).toBe(false);
    f.send('end', 'tap', [sample(150, 250, 110)]);
    f.send('start', 'line', [sample(150, 250, 200)]);
    f.send('move', 'line', [sample(160, 250, 210), sample(180, 250, 220)]);
    f.send('end', 'line', [sample(200, 250, 230)]);
    expect(f.history().drawing.strokes.map((stroke) => stroke.points.length)).toEqual([1, 4]);
    expect(f.history().undo).toHaveLength(2);
  });

  it('cancels one contact without draining another contact in the same cohort', () => {
    const f = packetFixture();
    f.send('start', 'a', [sample(50, 50, 100)]);
    f.send('start', 'b', [sample(100, 100, 110)]);
    f.send('cancel', 'a', [sample(60, 60, 120)]);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.input.hasActive()).toBe(true);
    f.send('end', 'b', [sample(110, 110, 130)]);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.history().drawing.strokes).toHaveLength(2);
    expect(f.history().undo).toHaveLength(1);
  });

  it('ignores stale packets and detached callbacks without adopting a new lifetime', () => {
    const f = packetFixture();
    const start = f.send('start', 'a', [sample(50, 50, 100)]);
    f.send('end', 'a', [sample(60, 60, 110)]);
    f.input.receiveInput(start);
    f.input.detach();
    f.send('start', 'b', [sample(70, 70, 200)]);
    expect(f.history().drawing.strokes).toHaveLength(1);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.failure).not.toHaveBeenCalled();
  });

  it.each([
    { tool: 'pencil' },
    { startedAt: -1 },
    { samples: [sample(50, 50, 110), sample(60, 60, 100)] },
    { samples: [sample(Infinity, 50, 100)] },
  ])(
    'rejects invalid native tool, lifetime and sample metadata at the wire boundary',
    (invalid) => {
      const payload = {
        phase: 'start',
        sequence: 0,
        changed: ['a'],
        contacts: [
          {
            identifier: 'a',
            startedAt: 100,
            tool: 'touch',
            samples: [sample(50, 50, 100)],
            ...invalid,
          },
        ],
        viewport: { width: 342, height: 256.5, bottomInset: 34 },
      };
      expect(readPaperInput(payload)).toBeNull();
    }
  );
});

it('samples drawing sound once at the final point of a coalesced batch', () => {
  const sound = { sample: vi.fn(), end: vi.fn() };
  const f = packetFixture({ sound: { begin: vi.fn(() => sound) } });
  f.send('start', 'a', [sample(50, 50, 100)]);
  f.send('move', 'a', [sample(100, 100, 110), sample(150, 50, 120), sample(200, 100, 130)]);
  expect(sound.sample).toHaveBeenCalledTimes(1);
  expect(sound.sample.mock.calls[0][1]).toBe(130);
});

it('finishes a guarded contact before a chrome command so later samples cannot restart it', () => {
  const f = packetFixture();
  f.send('start', 'a', [sample(150, 250, 100)]);
  f.input.finishInput();
  f.send('move', 'a', [sample(180, 250, 120)]);
  f.send('end', 'a', [sample(200, 250, 140)]);
  expect(f.history().drawing.strokes).toHaveLength(0);
  expect(f.commit).not.toHaveBeenCalled();
});

it('preserves closely spaced historical samples instead of applying the legacy move-distance floor', () => {
  const f = packetFixture();
  f.send('start', 'a', [sample(50, 50, 100)]);
  f.send('move', 'a', [sample(50.1, 50, 110), sample(50.2, 50, 120), sample(50.3, 50, 130)]);
  f.send('end', 'a', [sample(50.3, 50, 140)]);
  expect(f.history().drawing.strokes[0].points).toHaveLength(4);
});

it('retains the selected paint of a buffered edge contact through a later settings change', () => {
  const settings = { color: 'Red' };
  const f = packetFixture(settings);
  f.send('start', 'a', [sample(150, 250, 100)]);
  settings.color = 'Blue';
  f.input.observeInputStyle();
  f.send('move', 'a', [sample(180, 250, 120)]);
  f.send('end', 'a', [sample(200, 250, 140)]);
  expect(f.history().drawing.strokes[0].color).toBe('Red');
});

it('refuses a buffered edge contact if a command takes the paper before its direction commits', () => {
  const settings = { disabled: false };
  const f = packetFixture(settings);
  f.send('start', 'a', [sample(150, 250, 100)]);
  settings.disabled = true;
  f.send('move', 'a', [sample(180, 250, 120)]);
  f.send('end', 'a', [sample(200, 250, 140)]);
  expect(f.history().drawing.strokes).toHaveLength(0);
  expect(f.commit).not.toHaveBeenCalled();
});
