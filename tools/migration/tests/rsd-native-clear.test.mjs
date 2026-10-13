import { caller, records, host, mount } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import {
  emptyDrawing,
  strokeStyle,
} from '../../../experiments/native-architecture/src/drawing/model.ts';
import {
  acceptRadius,
  CLEAR_SHEET_DURATION_MS,
  COACHMARK_AUTO_DISMISS_MS,
  HOLD_DURATION_MS,
  MOVEMENT_THRESHOLD_PX,
} from '../../../experiments/native-architecture/src/clear/dragToClear.ts';
import { canonicalPaper } from '../../tests/native-paper-fixtures.mjs';
import { NATIVE_ICONS } from '../../../experiments/native-architecture/src/rsdDrawing/icons.generated.ts';

// The fixture window is 402 wide, so the shipping accept radius is 40% of that.
const HOME = { x: 360, y: 40 };
const radius = () => acceptRadius(records.dimensions.width, records.dimensions.height);

function inkedDrawing() {
  const drawing = emptyDrawing();
  const stroke = {
    ...strokeStyle('pen', 'Purple', drawing),
    points: [
      { x: 20, y: 20 },
      { x: 100, y: 100 },
    ],
  };
  return { ...drawing, paper: canonicalPaper(), strokes: [stroke] };
}

function clearScreen(overrides = {}) {
  const drawing = overrides.drawing ?? inkedDrawing();
  return {
    notice: '',
    drawing: false,
    disabled: false,
    brush: 'pen',
    brushControl: { kind: 'none' },
    availableBrushes: ['pen'],
    history: { undo: [], drawing },
    recovery: { failed: false },
    pictures: null,
    pagePickerOpen: false,
    settingsOpen: false,
    colorPickerOpen: false,
    undo: vi.fn(),
    clear: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
    setPagePickerOpen: vi.fn(),
    openSettings: vi.fn(),
    openColorPicker: vi.fn(),
    toggleBrush: vi.fn(),
    selectInkBrush: vi.fn(),
    ...overrides,
  };
}

async function mountClear({
  sound = true,
  level,
  saveOnDelete,
  reduceMotion = false,
  ...screen
} = {}) {
  records.reduceMotion = reduceMotion;
  caller.screen = clearScreen(screen);
  caller.menu = { open: false, visible: false, show: vi.fn() };
  caller.sound = {
    settings: {
      status: 'ready',
      soundEnabled: sound,
      appearance: 'light',
      selectedColor: 'Purple',
      customColors: [],
      strokeWidth: 'medium',
      eraserWidth: 'medium',
      aiEnabled: false,
    },
  };
  if (level || saveOnDelete !== undefined) {
    const stored = {
      version: 9,
      soundEnabled: sound,
      soundLevel: level ?? 'medium',
      coloringBookEnabled: true,
      undoButtonEnabled: true,
      strokeWidthControlEnabled: true,
      orientation: 'portrait',
      saveOnDeleteEnabled: saveOnDelete ?? false,
    };
    caller.settingsStorage = {
      read: async () => JSON.stringify({ ...JSON.parse(caller.initialSettings), ...stored }),
      write: async () => {},
    };
  }
  await mount(createElement(RsdDrawingScreen));
}

const clearProps = () => records.props.findLast((props) => props.accessibilityLabel === 'Clear');
// React Native responder events: the changed touch at the top level, every touch in the lists.
const CLEAR_FINGER = 1;
const PAPER_FINGER = 2;
const touch = (identifier, point) => ({ identifier, pageX: point.x, pageY: point.y });
function responderEvent(changed, touches) {
  const [first] = changed;
  return { nativeEvent: { ...first, changedTouches: changed, touches } };
}
const at = (point) => responderEvent([touch(CLEAR_FINGER, point)], [touch(CLEAR_FINGER, point)]);
const offset = (distance) => ({
  x: HOME.x - distance / Math.SQRT2,
  y: HOME.y + distance / Math.SQRT2,
});

async function press(point = HOME) {
  await act(async () => {
    if (clearProps().onStartShouldSetResponder()) clearProps().onResponderGrant(at(point));
  });
}
async function drag(point) {
  await act(async () => clearProps().onResponderMove(at(point)));
}
async function lift(point) {
  await act(async () => clearProps().onResponderRelease(at(point)));
}
async function settle(ms) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}

const rendered = (testID) => host.querySelector(`[data-testid="${testID}"]`) !== null;
const everRendered = (testID) => records.props.some((props) => props.testID === testID);
const clearIcon = () => host.querySelector('[aria-label="Clear"] svg[data-xml]').dataset.xml;

afterEach(() => {
  vi.useRealTimers();
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

it("plays the page turn at the parent's Loud sound level", async () => {
  await mountClear({ level: 'loud' });
  await press();
  await drag(offset(radius() + 10));
  await lift(offset(radius() + 10));
  await act(async () => {});
  expect(caller.clearSound.play).toHaveBeenCalledExactlyOnceWith(2);
});

it('keeps sound off silent through a committed clear', async () => {
  await mountClear({ sound: false });
  await press();
  await drag(offset(radius() + 10));
  await lift(offset(radius() + 10));
  await act(async () => {});
  expect(caller.screen.clear).toHaveBeenCalledOnce();
  expect(caller.clearSound.load).not.toHaveBeenCalled();
  expect(caller.clearSound.play).not.toHaveBeenCalled();
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

it('does not fly an empty page', async () => {
  await mountClear({ drawing: emptyDrawing() });
  await press();
  await drag(offset(radius() + 10));
  await lift(offset(radius() + 10));
  await act(async () => {});
  expect(caller.screen.clear).toHaveBeenCalledOnce();
  expect(everRendered('rsd-clear-sheet')).toBe(false);
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

// screen.clear(true) keeps the picture before it wipes the paper; native-save-to-photos-mounted
// pins that order on the real screen. Here the drag and the activation must take that path.
it.each([true, false])(
  'commits a drag-clear through the Auto-Save on Delete clear path when the setting is %s',
  async (saveOnDelete) => {
    await mountClear({ saveOnDelete });
    vi.useFakeTimers();
    await press();
    await drag(offset(radius() + 10));
    await lift(offset(radius() + 10));
    await act(async () => {});
    expect(caller.screen.clear).toHaveBeenCalledExactlyOnceWith(saveOnDelete);
    await settle(CLEAR_SHEET_DURATION_MS);
    await act(async () => clearProps().onAccessibilityTap());
    expect(caller.screen.clear.mock.calls).toEqual([[saveOnDelete], [saveOnDelete]]);
  }
);
