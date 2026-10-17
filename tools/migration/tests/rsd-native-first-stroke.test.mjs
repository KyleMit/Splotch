import { act, createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { caller, host, mount, records } from './rsd-native-selection-host.mjs';
import { storedSettings } from './rsd-native-settings-fixture.mjs';
import { paperInputPacket } from '../../tests/native-paper-fixtures.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import * as paperModule from '../../../experiments/native-architecture/src/rsdDrawing/NativePaper.tsx';
import * as geometryModule from '../../../experiments/native-architecture/src/drawing/measurePaper.ts';
import { Animated } from '../../../experiments/native-architecture/src/platform/animated.ts';
import { MODAL_EXIT_MS } from '../../../experiments/native-architecture/src/rsdDrawing/modalGeometry.ts';

const PAPER_FRAME = { width: 402, height: 806, pageX: 0, pageY: 68 };
const VIEWPORT = { width: 402, height: 874, bottomInset: 0 };
const CONTACT_TARGET = 101;
const CONTACT_START_MS = 1000;
const CONTACT_MOVE_OFFSET_MS = 100;
const CONTACT_END_OFFSET_MS = 200;
const CONTACT_GAP_MS = 1;
const FIRST_STROKE_POINTS = [
  [150, 300],
  [250, 400],
];
const SEED_STROKE_POINTS = [
  [80, 250],
  [130, 350],
];

// Node cannot execute Skia. The real surface, input packets, contact owner and history stay mounted;
// this boundary supplies a ready renderer and exposes its committed and live semantic strokes.
vi.mock('../../../experiments/native-architecture/src/drawing/InkLayer.tsx', async () => {
  const { createElement, forwardRef, useImperativeHandle, useLayoutEffect } = await import('react');
  return {
    InkLayer: forwardRef(function ReadyInk({ strokes, drafts = [], onBusy }, ref) {
      useImperativeHandle(ref, () => ({
        isReady: () => true,
        canStart: () => true,
        readyPlan() {
          throw new Error('Picture capture is outside this contact-admission fixture.');
        },
      }));
      useLayoutEffect(() => onBusy(false), []);
      return createElement('div', {
        'data-testid': 'first-stroke-ink',
        'data-strokes': JSON.stringify(strokes),
        'data-drafts': JSON.stringify(drafts),
      });
    }),
  };
});
vi.mock('../../../experiments/native-architecture/src/drawing/PointerHalos.tsx', () => ({
  PointerHalos: () => null,
}));

let sequence;
let nextContactStart;
beforeEach(async () => {
  caller.realScreen = true;
  storedSettings({ coloringBookEnabled: false, saveOnDeleteEnabled: false });
  sequence = 0;
  nextContactStart = CONTACT_START_MS;
  vi.spyOn(geometryModule, 'measurePaper').mockImplementation((_host, complete) =>
    complete(PAPER_FRAME)
  );
  const actual = await vi.importActual(
    '../../../experiments/native-architecture/src/rsdDrawing/NativePaper.tsx'
  );
  vi.spyOn(paperModule, 'NativePaper').mockImplementation(actual.NativePaper);
});
afterEach(() => vi.restoreAllMocks());

function contactEvent(x, y, timestamp, startedAt, ended = false) {
  const touch = { identifier: 0, pageX: x, pageY: y, timestamp, target: CONTACT_TARGET };
  return {
    currentTarget: CONTACT_TARGET,
    nativeEvent: { touches: ended ? [] : [touch], changedTouches: [touch] },
    touchHistory: { touchBank: [{ startTimeStamp: startedAt }] },
  };
}

async function sendContact(phase, x, y, timestamp, startedAt, ended = false) {
  const input = records.props.findLast((props) => props.testID === 'drawing-paper');
  expect(input.onPaperInput).toBeTypeOf('function');
  const packet = paperInputPacket(
    phase,
    contactEvent(x, y, timestamp, startedAt, ended),
    sequence++,
    VIEWPORT
  );
  await act(async () => input.onPaperInput({ nativeEvent: packet }));
}

async function startContact(x, y) {
  const startedAt = nextContactStart;
  nextContactStart += CONTACT_END_OFFSET_MS + CONTACT_GAP_MS;
  await sendContact('start', x, y, startedAt, startedAt);
  return startedAt;
}

const ink = (key) =>
  JSON.parse(host.querySelector('[data-testid="first-stroke-ink"]').dataset[key]);

async function firstStroke(points = FIRST_STROKE_POINTS) {
  const [[startX, startY], [endX, endY]] = points;
  const startedAt = await startContact(startX, startY);
  expect(caller.liveScreen.drawing).toBe(true);
  expect(ink('drafts')).toHaveLength(1);
  await sendContact('move', endX, endY, startedAt + CONTACT_MOVE_OFFSET_MS, startedAt);
  await sendContact('end', endX, endY, startedAt + CONTACT_END_OFFSET_MS, startedAt, true);
  expect(caller.liveScreen.drawing).toBe(false);
  expect(ink('drafts')).toHaveLength(0);
  expect(caller.liveScreen.history.drawing.strokes).toHaveLength(1);
  expect(ink('strokes')).toEqual(caller.liveScreen.history.drawing.strokes);
  expect(ink('strokes')[0].points.length).toBeGreaterThan(1);
}

async function press(label) {
  const button = host.querySelector(`[aria-label="${label}"]`);
  expect(button, label).not.toBeNull();
  await act(async () => button.click());
}

it.each(['ios', 'android'])(
  'admits the first packet cohort immediately after the Settings exit retires on %s',
  async (os) => {
    records.os = os;
    await mount(createElement(RsdDrawingScreen));
    await press('Settings');
    expect(host.querySelector('[data-native-modal="Settings"]')).not.toBeNull();
    let finishExit;
    const timing = vi.spyOn(Animated, 'timing');
    vi.spyOn(Animated, 'parallel').mockImplementationOnce((animations) => ({
      start(done) {
        animations.forEach((animation) => animation.start());
        finishExit = done;
      },
      stop() {},
    }));
    await press('Close');
    expect(host.querySelector('[data-native-modal="Settings"]')).not.toBeNull();
    expect(timing.mock.calls.map(([, options]) => options.duration)).toContain(MODAL_EXIT_MS);
    const refusedAt = await startContact(150, 300);
    await sendContact('end', 150, 300, refusedAt + CONTACT_END_OFFSET_MS, refusedAt, true);
    expect(caller.liveScreen.history.drawing.strokes).toHaveLength(0);
    expect(ink('drafts')).toHaveLength(0);
    expect(finishExit).toBeTypeOf('function');
    await act(async () => finishExit({ finished: true }));
    expect(host.querySelector('[data-native-modal="Settings"]')).toBeNull();
    await firstStroke();
    expect(caller.liveScreen.history.undo).toHaveLength(1);
  }
);

it.each(['ios', 'android'])(
  'admits the first packet cohort immediately after Clear removes its seed on %s',
  async (os) => {
    records.os = os;
    await mount(createElement(RsdDrawingScreen));
    await firstStroke(SEED_STROKE_POINTS);
    const seeded = caller.liveScreen.history.drawing;
    const clear = records.props.findLast((props) => props.accessibilityLabel === 'Clear drawing');
    await act(async () => clear.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
    expect(caller.liveScreen.history.drawing.strokes).toHaveLength(0);
    expect(ink('strokes')).toHaveLength(0);
    await firstStroke();
    expect(caller.liveScreen.history.drawing).not.toBe(seeded);
    expect(caller.liveScreen.history.drawing.strokes[0].points).not.toEqual(
      seeded.strokes[0].points
    );
    expect(caller.liveScreen.history.undo).toHaveLength(3);
  }
);
