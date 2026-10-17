import { caller, records, root, host } from './rsd-native-selection-host.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement, useSyncExternalStore } from 'react';
import { clearLadderFrequency } from '../../../web/src/lib/audio/clearSoundNotes.ts';
import { afterEach, expect, it, vi } from 'vitest';

// The web export loads the clear underlay from its own chunk (clearSurfaces.web.ts). This gate
// stands in for that chunk: held, the underlay is absent; released, it mounts as a late chunk would.
const underlayChunk = vi.hoisted(() => {
  const listeners = new Set();
  const chunk = {
    loaded: true,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(loaded) {
      chunk.loaded = loaded;
      for (const listener of listeners) listener();
    },
  };
  return chunk;
});
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/clearSurfaces.ts',
  async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      RsdClearUnderlay(props) {
        const loaded = useSyncExternalStore(underlayChunk.subscribe, () => underlayChunk.loaded);
        return loaded ? createElement(actual.RsdClearUnderlay, props) : null;
      },
    };
  }
);
import { fittedPaper } from '../../../experiments/native-architecture/src/drawing/paperGeometry.ts';
import { drawingPaper } from '../../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import {
  clearSheetOrigin,
  CLEAR_SHEET_DURATION_MS,
  COACHMARK_AUTO_DISMISS_MS,
  HOLD_DURATION_MS,
  MOVEMENT_THRESHOLD_PX,
} from '../../../experiments/native-architecture/src/clear/dragToClear.ts';
import { Animated } from '../../../experiments/native-architecture/src/platform/animated.ts';
import { NATIVE_ICONS } from '../../../experiments/native-architecture/src/rsdDrawing/icons.generated.ts';
import {
  HOME,
  CLEAR_FINGER,
  PAPER_FINGER,
  clearIcon,
  clearProps,
  clearScreen,
  commitClear,
  drag,
  everRendered,
  inkedDrawing,
  layout,
  lift,
  mountClear,
  offset,
  press,
  processNativeTransformOrigin,
  preprocessWebStyle,
  radius,
  rendered,
  responderEvent,
  settle,
  touch,
} from './rsd-native-clear-fixture.mjs';

afterEach(() => {
  underlayChunk.loaded = true;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('forwards distance beyond the ring to the available bubble player without clipping the wash', async () => {
  caller.clearSound.notes = 'available';
  await mountClear();
  await press();
  await drag(offset(radius()));
  await drag(offset(radius() * 2.6));
  expect(caller.clearSound.note.mock.calls).toEqual([
    [clearLadderFrequency(9), 1],
    [clearLadderFrequency(18), 1],
  ]);
  await lift(offset(radius() * 2.6));
  expect(caller.screen.clear).toHaveBeenCalledOnce();
});

it('leaves the drawing alone when a drag is released short of the accept ring', async () => {
  await mountClear();
  await press();
  expect(rendered('rsd-clear-accept-ring')).toBe(true);
  expect(clearIcon()).toContain(NATIVE_ICONS['trash-open'].light.slice(0, 80));
  await drag(offset(radius() - 1));
  await lift(offset(radius() - 1));
  expect(caller.screen.clear).not.toHaveBeenCalled();
  expect(caller.haptic).not.toHaveBeenCalled();
  expect(caller.clearSound.play).not.toHaveBeenCalled();
  expect(everRendered('rsd-clear-sheet')).toBe(false);
  expect(clearIcon()).toContain(NATIVE_ICONS['trash-closed'].light.slice(0, 80));
});

it('clears once past the accept ring with one threshold haptic and the page-turn sound', async () => {
  await mountClear();
  await press();
  expect(caller.clearSound.load).toHaveBeenCalledOnce();
  await drag(offset(radius() + 10));
  await drag(offset(radius() + 40));
  expect(caller.haptic).toHaveBeenCalledOnce();
  await drag(offset(radius() - 20));
  await drag(offset(radius() + 20));
  expect(caller.haptic).toHaveBeenCalledTimes(2);
  await lift(offset(radius() + 20));
  await act(async () => {});
  expect(caller.screen.clear).toHaveBeenCalledOnce();
  expect(caller.clearSound.play).toHaveBeenCalledExactlyOnceWith(1);
  expect(everRendered('rsd-clear-sheet')).toBe(true);
  await press();
  expect(caller.screen.clear).toHaveBeenCalledOnce();
});

it.each([
  ['loud', true, 2],
  ['silent', false, null],
])("plays the committed page turn at the parent's %s sound level", async (level, sound, volume) => {
  await mountClear({ sound, level: sound ? level : undefined });
  await commitClear();
  expect(caller.screen.clear).toHaveBeenCalledOnce();
  expect(caller.clearSound.play.mock.calls).toEqual(volume === null ? [] : [[volume]]);
  expect(caller.clearSound.load).toHaveBeenCalledTimes(volume === null ? 0 : 1);
});

it('turns a plain tap into nothing, a run of three taps or a held press into the coachmark', async () => {
  await mountClear();
  vi.useFakeTimers();
  await press();
  await lift(HOME);
  expect(rendered('rsd-clear-coachmark')).toBe(false);
  expect(caller.screen.clear).not.toHaveBeenCalled();
  await press();
  await lift(HOME);
  await press();
  expect(rendered('rsd-clear-coachmark')).toBe(true);
  expect(caller.screen.clear).not.toHaveBeenCalled();
  await settle(COACHMARK_AUTO_DISMISS_MS);
  expect(rendered('rsd-clear-coachmark')).toBe(false);
  await settle(1000);
  await press();
  await settle(HOLD_DURATION_MS - 1);
  expect(rendered('rsd-clear-coachmark')).toBe(false);
  await settle(1);
  const coachmark = host.querySelector('[data-testid="rsd-clear-coachmark"]');
  expect(coachmark).not.toBeNull();
  expect(coachmark.textContent).toBe('');
  const props = records.props.findLast((props) => props.testID === 'rsd-clear-coachmark');
  expect(props.accessibilityElementsHidden).toBe(true);
  expect(props.importantForAccessibility).toBe('no-hide-descendants');
  await drag({ x: HOME.x - MOVEMENT_THRESHOLD_PX - 1, y: HOME.y });
  expect(rendered('rsd-clear-coachmark')).toBe(false);
  await lift({ x: HOME.x - MOVEMENT_THRESHOLD_PX - 1, y: HOME.y });
  expect(caller.screen.clear).not.toHaveBeenCalled();
});

it('shows the coachmark again on a later hold, as the shipping app keeps no dismissal', async () => {
  await mountClear();
  vi.useFakeTimers();
  for (let round = 0; round < 2; round++) {
    await press();
    await settle(HOLD_DURATION_MS);
    expect(rendered('rsd-clear-coachmark'), `${round}`).toBe(true);
    await lift(HOME);
    await settle(COACHMARK_AUTO_DISMISS_MS);
    expect(rendered('rsd-clear-coachmark'), `${round}`).toBe(false);
  }
});

it('clears through an assistive activation and ignores presses while the page departs', async () => {
  await mountClear();
  vi.useFakeTimers();
  await act(async () =>
    clearProps().onAccessibilityAction({ nativeEvent: { actionName: 'activate' } })
  );
  expect(caller.screen.clear).toHaveBeenCalledOnce();
  expect(clearProps().onStartShouldSetResponder()).toBe(false);
  expect(clearProps().pointerEvents).toBe('none');
  await settle(CLEAR_SHEET_DURATION_MS);
  expect(clearProps().onStartShouldSetResponder()).toBe(true);
  await act(async () =>
    clearProps().onAccessibilityAction({ nativeEvent: { actionName: 'magicTap' } })
  );
  expect(caller.screen.clear).toHaveBeenCalledOnce();
});

it('refuses the gesture and the activation while the screen is disabled', async () => {
  await mountClear({ disabled: true });
  expect(clearProps().accessibilityState.disabled).toBe(true);
  expect(clearProps().onStartShouldSetResponder()).toBe(false);
  await act(async () =>
    clearProps().onAccessibilityAction({ nativeEvent: { actionName: 'activate' } })
  );
  expect(caller.screen.clear).not.toHaveBeenCalled();
});

it('skips the departing page and keeps every cue under reduced motion', async () => {
  await mountClear({ reduceMotion: true });
  vi.useFakeTimers();
  await press();
  expect(rendered('rsd-clear-accept-ring')).toBe(true);
  await drag(offset(radius() + 10));
  expect(caller.haptic).toHaveBeenCalledOnce();
  await lift(offset(radius() + 10));
  await act(async () => {});
  expect(caller.screen.clear).toHaveBeenCalledOnce();
  expect(caller.clearSound.play).toHaveBeenCalledOnce();
  expect(everRendered('rsd-clear-sheet')).toBe(false);
  await settle(CLEAR_SHEET_DURATION_MS);
  await press();
  await settle(HOLD_DURATION_MS);
  const ghost = records.props.findLast((props) => props.testID === 'rsd-clear-coachmark-ghost');
  expect(ghost.style[1].opacity).toBe(0.95);
  expect(ghost.style[1].transform[0].translateX).toBeCloseTo(-(radius() * 1.18) / Math.SQRT2);
});

it('grains the cover and departing art, uncovering the next drawing before the flight ends', async () => {
  expect(readFileSync(join(import.meta.dirname, '../../../web/src/app.css'), 'utf8')).toContain(
    'background: var(--paper) var(--paper-texture) repeat;'
  );
  vi.spyOn(Animated, 'timing').mockReturnValue({ start: vi.fn(), stop: vi.fn() });
  let finish;
  const drawing = { ...inkedDrawing(), pageId: 'sunshine' };
  await mountClear({ drawing, clear: vi.fn(() => new Promise((resolve) => (finish = resolve))) });
  await layout('rsd-canvas-area', { x: 0, y: 0, width: 402, height: 760 });
  vi.useFakeTimers();
  await commitClear();
  const cover = host.querySelector('[data-testid="rsd-clear-cover"]');
  await act(async () => finish());
  expect(rendered('rsd-clear-cover')).toBe(false);
  const sheet = host.querySelector('[data-testid="rsd-clear-sheet"]');
  for (const paper of [cover, sheet]) {
    expect(paper.children).toHaveLength(2);
    expect(paper.firstElementChild.dataset.testid).toBe('paper-texture');
    expect(paper.querySelector('[data-testid="paper-grain"]')).not.toBeNull();
  }
  // The SVG host preserves each primitive: an opaque Rect adds a child before the outline.
  expect(cover.lastElementChild.childElementCount).toBe(1);
  expect(sheet.querySelectorAll('path').length).toBe(cover.querySelectorAll('path').length + 1);
  await settle(CLEAR_SHEET_DURATION_MS - 1);
  expect(rendered('rsd-clear-sheet')).toBe(true);
  await settle(1);
  expect(rendered('rsd-clear-sheet')).toBe(false);
});

it('does not fly an empty page', async () => {
  await mountClear({ drawing: emptyDrawing() });
  await commitClear();
  expect(caller.screen.clear).toHaveBeenCalledOnce();
  expect(everRendered('rsd-clear-sheet')).toBe(false);
});

// The PR 2849 review repro: the web underlay chunk arrives after a clear and the next stroke.
it('never flies or covers an already cleared page when the underlay arrives late', async () => {
  underlayChunk.loaded = false;
  await mountClear();
  vi.useFakeTimers();
  expect(rendered('rsd-clear-underlay')).toBe(false);
  await commitClear();
  expect(caller.screen.clear).toHaveBeenCalledOnce();
  await settle(800);
  const nextStroke = inkedDrawing();
  caller.screen = clearScreen({ drawing: nextStroke });
  await act(async () => root.render(createElement(RsdDrawingScreen)));
  const before = records.props.length;
  await act(async () => underlayChunk.set(true));
  await settle(CLEAR_SHEET_DURATION_MS);
  const since = records.props.slice(before);
  expect(since.some((props) => props.testID === 'rsd-clear-underlay')).toBe(true);
  expect(since.some((props) => props.testID === 'rsd-clear-sheet')).toBe(false);
  expect(since.some((props) => props.testID === 'rsd-clear-cover')).toBe(false);
  expect(caller.screen.history.drawing).toBe(nextStroke);
});

it('leaves fresh ink uncovered when the underlay arrives during the departing page flight', async () => {
  underlayChunk.loaded = false;
  await mountClear();
  vi.useFakeTimers();
  await commitClear();
  await settle(CLEAR_SHEET_DURATION_MS / 2);
  const before = records.props.length;
  await act(async () => underlayChunk.set(true));
  expect(rendered('rsd-clear-underlay')).toBe(true);
  expect(records.props.slice(before).some((props) => props.testID === 'rsd-clear-sheet')).toBe(
    false
  );
  expect(rendered('rsd-clear-cover')).toBe(false);
  await settle(CLEAR_SHEET_DURATION_MS / 2);
  expect(rendered('rsd-clear-cover')).toBe(false);
});

it('follows only the finger that pressed Clear while another finger draws', async () => {
  await mountClear();
  await press();
  const resting = touch(CLEAR_FINGER, HOME);
  const far = offset(radius() + 200);
  for (const step of [offset(radius() + 100), far]) {
    const paper = touch(PAPER_FINGER, step);
    await act(async () => clearProps().onResponderMove(responderEvent([paper], [resting, paper])));
  }
  expect(caller.haptic).not.toHaveBeenCalled();
  expect(clearProps().style.transform[0].translateX.value).toBe(0);
  await act(async () =>
    clearProps().onResponderRelease(responderEvent([touch(PAPER_FINGER, far), resting], []))
  );
  await act(async () => {});
  expect(caller.haptic).not.toHaveBeenCalled();
  expect(caller.screen.clear).not.toHaveBeenCalled();
  await press();
  const moved = offset(radius() + 10);
  await act(async () =>
    clearProps().onResponderMove(
      responderEvent(
        [touch(CLEAR_FINGER, moved)],
        [touch(CLEAR_FINGER, moved), touch(PAPER_FINGER, HOME)]
      )
    )
  );
  expect(caller.haptic).toHaveBeenCalledOnce();
  await act(async () =>
    clearProps().onResponderRelease(
      responderEvent([touch(PAPER_FINGER, HOME), touch(CLEAR_FINGER, moved)], [])
    )
  );
  await act(async () => {});
  expect(caller.screen.clear).toHaveBeenCalledOnce();
});

it("keeps a new drag's accept ring when the last drag's ring hide comes due", async () => {
  await mountClear();
  vi.useFakeTimers();
  await press();
  await lift(HOME);
  await settle(100);
  await press();
  await drag(offset(radius() / 2));
  await settle(150);
  expect(rendered('rsd-clear-accept-ring')).toBe(true);
  await settle(1000);
  expect(rendered('rsd-clear-accept-ring')).toBe(true);
  await lift(offset(radius() / 2));
  await settle(1000);
  expect(rendered('rsd-clear-accept-ring')).toBe(false);
});

it("clears through VoiceOver's default activation once, however many paths report it", async () => {
  await mountClear();
  vi.useFakeTimers();
  await act(async () => clearProps().onAccessibilityTap());
  expect(caller.screen.clear).toHaveBeenCalledOnce();
  await act(async () =>
    clearProps().onAccessibilityAction({ nativeEvent: { actionName: 'activate' } })
  );
  expect(caller.screen.clear).toHaveBeenCalledOnce();
  await settle(CLEAR_SHEET_DURATION_MS);
  await act(async () => clearProps().onAccessibilityTap());
  expect(caller.screen.clear).toHaveBeenCalledTimes(2);
});

// rsd-native-save-to-photos.test.mjs pins capture before Clear on the live screen.
// This suite checks that drag and activation reach that same Auto-Save command.
it.each([true, false])(
  'commits a drag-clear through the Auto-Save on Delete clear path when the setting is %s',
  async (saveOnDelete) => {
    await mountClear({ saveOnDelete });
    vi.useFakeTimers();
    await commitClear();
    expect(caller.screen.clear).toHaveBeenCalledExactlyOnceWith(saveOnDelete);
    await settle(CLEAR_SHEET_DURATION_MS);
    await act(async () => clearProps().onAccessibilityTap());
    expect(caller.screen.clear.mock.calls).toEqual([[saveOnDelete], [saveOnDelete]]);
  }
);

// The shipping dock (ClearButton.svelte) at rest: a red half-disc tab whose square edge runs 10px
// off the right screen edge, 90px down and 60px tall in portrait, 48px down and 70px tall in
// landscape, unless a taller safe-area top pushes it to 20px below that inset.
const SHIPPING_REST_GRADIENT = /--clear-gradient-rest: ([^;]+);/.exec(
  readFileSync(join(import.meta.dirname, '../../../web/src/tokens.css'), 'utf8')
)[1];
const byTestID = (testID) => flat(records.props.findLast((props) => props.testID === testID).style);
const face = () => byTestID('rsd-clear-face');
const lid = () => byTestID('rsd-clear-lid');
const clearIconSize = () =>
  Number(host.querySelector('[aria-label="Clear drawing"] svg[data-xml]').getAttribute('width'));

function flat(style) {
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style;
}

const corners = (style) =>
  ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(
    (corner) => style[`border${corner}Radius`]
  );

it.each([
  ['portrait', { width: 402, height: 874 }, 0, { top: 90, size: 60, icon: 38 }],
  ['portrait under a notch', { width: 402, height: 874 }, 47, { top: 90, size: 60, icon: 38 }],
  ['landscape', { width: 874, height: 402 }, 0, { top: 48, size: 70, icon: 40 }],
  [
    'landscape under a status bar',
    { width: 1180, height: 820 },
    24,
    { top: 24, size: 70, icon: 40 },
  ],
  [
    'landscape under a tall inset',
    { width: 874, height: 402 },
    40,
    { top: 20, size: 70, icon: 40 },
  ],
])('docks the red tab against the right screen edge in %s', async (_name, window, top, dock) => {
  records.dimensions = { ...window, scale: 1, fontScale: 1 };
  records.insets = { top, right: 0, bottom: 0, left: 0 };
  await mountClear();
  const overlay = host.querySelector('[data-testid="rsd-clear-overlay"]');
  expect(overlay.querySelector('[aria-label="Clear drawing"]')).not.toBeNull();
  expect(
    host.querySelector('[data-testid="rsd-canvas-area"] [aria-label="Clear drawing"]')
  ).toBeNull();
  expect(byTestID('rsd-clear-dock')).toEqual({ position: 'absolute', top: dock.top, right: -10 });
  expect(clearProps().style).toMatchObject({ width: dock.size, height: dock.size });
  expect(face()).toMatchObject({
    width: dock.size,
    height: dock.size,
    experimental_backgroundImage: SHIPPING_REST_GRADIENT,
    boxShadow: '-4px 4px 20px rgba(0, 0, 0, 0.3)',
  });
  expect(corners(face())).toEqual([dock.size / 2, 0, 0, dock.size / 2]);
  expect(lid().marginRight).toBe(10);
  expect(clearIcon()).toContain(NATIVE_ICONS['trash-closed'].light.slice(0, 80));
  expect(clearIconSize()).toBe(dock.icon);
});

it('lifts into a round puck, turns alarm red past the ring and docks again on release', async () => {
  await mountClear();
  await press();
  expect(corners(face())).toEqual([30, 30, 30, 30]);
  expect(face()).toMatchObject({
    experimental_backgroundImage: SHIPPING_REST_GRADIENT,
    boxShadow: '-6px 6px 30px rgba(0, 0, 0, 0.4)',
  });
  expect(lid().marginRight).toBe(0);
  expect(clearIcon()).toContain(NATIVE_ICONS['trash-open'].light.slice(0, 80));
  await drag(offset(radius() + 10));
  expect(face()).toMatchObject({
    experimental_backgroundImage: 'linear-gradient(135deg, rgb(255, 56, 56), #d63031)',
    boxShadow: '0 6px 40px rgba(255, 56, 56, 0.6)',
  });
  expect(corners(face())).toEqual([30, 30, 30, 30]);
  await drag(offset(radius() - 10));
  expect(face().boxShadow).toBe('-6px 6px 30px rgba(0, 0, 0, 0.4)');
  await lift(offset(radius() - 10));
  expect(corners(face())).toEqual([30, 0, 0, 30]);
  expect(face().boxShadow).toBe('-4px 4px 20px rgba(0, 0, 0, 0.3)');
  expect(lid().marginRight).toBe(10);
});

it('centres the accept ring on the docked tab and spreads its wash to the box corner', async () => {
  await mountClear();
  await press();
  expect(byTestID('rsd-clear-accept-ring')).toMatchObject({
    position: 'absolute',
    top: 90 + 30 - radius(),
    right: -10 + 30 - radius(),
    width: radius() * 2,
    height: radius() * 2,
  });
  // CSS radial-gradient(circle, …) reaches 100% at the farthest corner of the ring's square box.
  const wash = host.querySelector('[data-gradient="rsd-clear-accept"]');
  expect(Number.parseFloat(wash.dataset.r)).toBeCloseTo(50 * Math.SQRT2);
  const stops = [...wash.querySelectorAll('[data-offset]')].map((stop) => [
    Number(stop.dataset.offset),
    Number(stop.dataset.stopOpacity),
  ]);
  expect(stops).toEqual([
    [0.55, 0],
    [1, 0.06],
  ]);
});

it('flies the departing page into the docked tab from the paper area it sits in', async () => {
  await mountClear();
  const area = { width: 402, height: 760 };
  await layout('rsd-drawing-layout', { x: 0, y: 0, width: 402, height: 874 });
  await layout('rsd-canvas-column', { x: 0, y: 68, width: 402, height: 806 });
  await layout('rsd-canvas-area', { x: 0, y: 0, ...area });
  await layout('rsd-clear-underlay', { x: 0, y: 0, ...area });
  const frame = fittedPaper(area, drawingPaper(inkedDrawing()));
  await press();
  await drag(offset(radius() / 2));
  expect(byTestID('rsd-clear-wash')).toMatchObject({ top: -68 });
  expect(byTestID('rsd-clear-wash').right + 0).toBe(0);
  await drag(offset(radius() + 10));
  await lift(offset(radius() + 10));
  await act(async () => {});
  // The tab's centre sits 20px in from the screen edge and 120px down: 52px into the paper area
  // below the 68px palette bar.
  const origin = clearSheetOrigin({ x: 402 - 20, y: 120 - 68 }, area);
  expect(byTestID('rsd-clear-sheet')).toMatchObject(frame);
  const expected = [origin.x - frame.left, origin.y - frame.top, 0];
  expect(expected.slice(0, 2).map(Number.isInteger)).toEqual([false, false]);
  expect(expected[1]).toBeLessThan(0);
  const transformOrigin = byTestID('rsd-clear-sheet').transformOrigin;
  expect(processNativeTransformOrigin(transformOrigin)).toEqual(expected);
  expect(preprocessWebStyle({ transformOrigin }).transformOrigin).toBe(
    `${expected[0]}px ${expected[1]}px 0px`
  );
});

it("reveals Clear's opacity and scale on shipping's separate clocks", async () => {
  const timing = vi.spyOn(Animated, 'timing');
  await mountClear();
  timing.mockClear();
  await press();
  const reveal = timing.mock.calls
    .map(([, config]) => config)
    .filter((config) => config.toValue === 1 && config.useNativeDriver);
  expect(reveal.map((config) => config.duration)).toEqual([200, 300, 90, 90]);
  expect(reveal.slice(-2).map((config) => config.delay ?? 0)).toEqual([0, 90]);
  timing.mockRestore();
});
