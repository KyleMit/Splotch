import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caller, records, host, mount } from './rsd-native-selection-host.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { FAILURE_REANNOUNCE_GAP_MS } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingStatus.tsx';
import {
  POLAROID_FADE_KEYFRAMES,
  POLAROID_SHOW_KEYFRAMES,
} from '../../../experiments/native-architecture/src/rsdDrawing/polaroidFlight.ts';
import {
  BANNER_ENTER_MS,
  BANNER_EXIT_MS,
  BANNER_FLY_PX,
} from '../../../web/src/lib/components/bannerMotion.ts';
import { saveFailureCopy } from '../../../web/src/lib/drawing/saveFailureCopy.ts';
import { PARENT_GATE_SUCCESS_HOLD_MS } from '../../../experiments/native-architecture/src/parentCenter/parentGate.ts';

// The photo library's answer to each save, in order, and the PNGs it was handed. A pending answer
// holds that save until the test settles it.
const library = vi.hoisted(() => ({ outcomes: [], saves: [], pending: null }));
vi.mock('../../../experiments/native-architecture/src/platform/photoLibrary.ts', () => ({
  photoLibrary: {
    save: async (png) => {
      library.saves.push(png);
      if (library.pending) return library.pending;
      return library.outcomes.shift() ?? 'photos';
    },
  },
}));

// The store whose rules bound the Parent Center policies, switched per test.
const storePlatform = vi.hoisted(() => ({ os: 'ios' }));
vi.mock('../../../experiments/native-architecture/src/platform/parentPlatform.ts', () => ({
  get PARENT_PLATFORM() {
    return storePlatform.os;
  },
}));

const REPOSITORY = join(import.meta.dirname, '../../..');
const read = (path) => readFileSync(join(REPOSITORY, path), 'utf8');
const SCREEN = { left: 0, top: 0, width: 402, height: 874 };
const CAMERA = { left: 20, top: 700, width: 60, height: 60 };
// Generous beside the component's gap between emptying the region and rewriting it.
const REANNOUNCE_WAIT_MS = 2000;
// A solved check's Unlocked! hold, then generous room for the dialog's exit on real timers.
const DIALOG_EXIT_WAIT_MS = PARENT_GATE_SUCCESS_HOLD_MS + 2000;

let interpolations;
let timings;
let animated;
let captures;

beforeEach(async () => {
  storePlatform.os = 'ios';
  // The selection host's synchronous Animated, which every component here reads.
  const { Animated } = await import('react-native');
  animated = Animated;
  library.outcomes = [];
  library.saves = [];
  library.pending = null;
  captures = 0;
  caller.exportPng = () => {
    captures += 1;
    return `png-${captures}`;
  };
  caller.realScreen = true;
  caller.settingsStorage = {
    read: vi.fn(async () => '{"version":1,"soundEnabled":false}'),
    write: vi.fn(async () => {}),
  };
  interpolations = [];
  timings = [];
  const interpolate = Animated.Value.prototype.interpolate;
  vi.spyOn(Animated.Value.prototype, 'interpolate').mockImplementation(function record(config) {
    interpolations.push(config);
    return interpolate.call(this, config);
  });
  const timing = Animated.timing;
  vi.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    timings.push(config);
    return timing(value, config);
  });
});

afterEach(() => vi.restoreAllMocks());

const click = (selector) => act(async () => host.querySelector(selector).click());

async function drawAndSave() {
  await mount(createElement(RsdDrawingScreen));
  await click('[aria-label="Draw RSD fixture stroke"]');
  await click('[aria-label="Expand controls"]');
  await click('[aria-label="Save screenshot"]');
}

function overlay() {
  return host.querySelector('[data-testid="rsd-polaroid-flight"]');
}

// Each banner is one card in the dock the banner stack pins over the paper.
function banners() {
  return [...(host.querySelector('[data-testid="rsd-failure-banners"]')?.children ?? [])].map(
    (node) => node.textContent
  );
}

function button(label) {
  return [...host.querySelectorAll('[role="button"]')].find(
    (node) => node.textContent === label || node.getAttribute('aria-label') === label
  );
}

// React Native lays the overlay out and the flight measures both boxes in the window.
async function layOut() {
  const box =
    ({ left, top, width, height }) =>
    (done) =>
      done(left, top, width, height);
  overlay().measureInWindow = box(SCREEN);
  const tile = host
    .querySelector('[aria-label="Save screenshot"]')
    .closest('[data-testid="rsd-drawer-tool"]');
  tile.measureInWindow = box(CAMERA);
  const props = records.props.findLast((candidate) => candidate.testID === 'rsd-polaroid-flight');
  await act(async () => props.onLayout());
}

function ranges(keyframes) {
  return keyframes.map((keyframe) => keyframe.at);
}

describe('the save polaroid', () => {
  it('flies the captured picture out of the Save screenshot button and says nothing about it', async () => {
    await drawAndSave();
    await vi.waitFor(() => expect(overlay()).not.toBeNull());
    expect(overlay().getAttribute('data-testid')).toBe('rsd-polaroid-flight');
    const image = records.props.findLast((props) => props.src?.startsWith('data:'));
    expect(image).toMatchObject({ src: 'data:image/png;base64,png-1', alt: '' });
    const flight = records.props.findLast((props) => props.testID === 'rsd-polaroid-flight');
    expect(flight).toMatchObject({ 'aria-hidden': true, pointerEvents: 'none' });
    expect(library.saves).toEqual(['png-1']);

    interpolations.length = 0;
    await layOut();
    const fromX = CAMERA.left + CAMERA.width / 2 - SCREEN.width / 2;
    const fromY = CAMERA.top + CAMERA.height / 2 - SCREEN.height / 2;
    const show = interpolations.filter(
      (config) => config.inputRange.join() === ranges(POLAROID_SHOW_KEYFRAMES).join()
    );
    const outputs = show.map((config) => config.outputRange.join());
    expect(outputs).toContain(POLAROID_SHOW_KEYFRAMES.map((key) => key.from * fromX).join());
    expect(outputs).toContain(POLAROID_SHOW_KEYFRAMES.map((key) => key.from * fromY).join());
    expect(outputs).toContain(POLAROID_SHOW_KEYFRAMES.map((key) => `${key.rotate}deg`).join());
    // The synchronous Animated lands the flight at once, which takes the overlay down.
    expect(overlay()).toBeNull();
    expect(banners()).toEqual([]);
    expect(records.announcements.join(' ')).not.toMatch(/saved|downloaded/i);
    expect(host.textContent).not.toMatch(/saved|downloaded/i);
  });

  it('fades in place, without the flash, under Reduce Motion', async () => {
    records.reduceMotion = true;
    await drawAndSave();
    await vi.waitFor(() => expect(overlay()).not.toBeNull());
    expect(records.props.some((props) => props.style?.[0]?.backgroundColor === 'white')).toBe(
      false
    );
    const fade = interpolations.filter(
      (config) => config.inputRange.join() === ranges(POLAROID_FADE_KEYFRAMES).join()
    );
    expect(fade.map((config) => config.outputRange.join())).toContain(
      POLAROID_FADE_KEYFRAMES.map((key) => `${key.rotate}deg`).join()
    );
    expect(
      interpolations.some(
        (config) => config.inputRange.join() === ranges(POLAROID_SHOW_KEYFRAMES).join()
      )
    ).toBe(false);
  });

  it('takes the polaroid back when the save does not land', async () => {
    library.outcomes = ['failed'];
    await drawAndSave();
    await vi.waitFor(() => expect(banners()).toHaveLength(1));
    expect(overlay()).not.toBeNull();
    expect(timings).toContainEqual(expect.objectContaining({ toValue: 0, duration: 200 }));
  });
});

describe('the Save Failure Banner', () => {
  it('retries the exact picture that failed, though the paper has changed since', async () => {
    library.outcomes = ['failed'];
    await drawAndSave();
    await vi.waitFor(() => expect(banners()).toHaveLength(1));
    const copy = saveFailureCopy('failed', 1, 'ios');
    expect(banners()).toEqual([`${copy.heading}${copy.detail}Try again`]);
    await click('[aria-label="Draw RSD fixture stroke"]');
    let settle;
    library.pending = new Promise((resolve) => (settle = resolve));
    await act(async () => button('Try again').click());
    expect(button('Saving…')).toBeDefined();
    expect(records.props.findLast((props) => props.accessibilityState?.busy)).toBeDefined();
    expect(library.saves).toEqual(['png-1', 'png-1']);
    expect(captures).toBe(1);
    library.pending = null;
    await act(async () => settle('photos'));
    await vi.waitFor(() => expect(banners()).toEqual([]));
  });

  async function solveGate() {
    const gate = caller.product.owner.gate;
    const { x, y } = gate.getState();
    await act(async () => gate.input(String(x * y)));
    await act(async () => gate.answer());
  }

  // The chrome stays inert until a closing dialog has left, as a modal's scrim holds every touch
  // through its exit and a solved check's Unlocked! hold; a child's next press comes after that.
  async function dialogsGone() {
    await vi.waitFor(() => expect(host.querySelector('[data-native-modal]')).toBeNull(), {
      timeout: DIALOG_EXIT_WAIT_MS,
    });
  }

  async function leaveGate() {
    await solveGate();
    await dialogsGone();
  }

  // Parent Center's own route to a policy: solve its check, choose, and leave.
  async function choosePolicy(mode) {
    const owner = caller.product.owner;
    await act(async () => owner.openParentCenter());
    if (owner.gate.getState().open) await solveGate();
    await act(async () => owner.setPolicy('externalLinks', mode));
    await act(async () => owner.closeParentCenter());
    await dialogsGone();
  }

  async function refusedOnIos() {
    library.outcomes = ['denied'];
    await drawAndSave();
    await vi.waitFor(() => expect(banners()).toHaveLength(1));
  }

  it('offers Open Settings behind the external links check for a refused permission on iOS', async () => {
    await refusedOnIos();
    const copy = saveFailureCopy('denied', 1, 'ios');
    expect(banners()).toEqual([`${copy.heading}${copy.detail}Open SettingsTry again`]);
    await act(async () => button('Open Settings').click());
    expect(caller.product.owner.gate.getState()).toMatchObject({
      open: true,
      feature: 'externalLinks',
    });
    expect(records.settingsOpened).toBe(0);
    await leaveGate();
    expect(records.settingsOpened).toBe(1);
    await act(async () => button('Open Settings').click());
    expect(caller.product.owner.gate.getState().open).toBe(true);
    expect(records.settingsOpened).toBe(1);
  });

  it('asks once per session when Parent Center says Per session', async () => {
    await refusedOnIos();
    await choosePolicy('session');
    await act(async () => button('Open Settings').click());
    expect(caller.product.owner.gate.getState()).toMatchObject({
      open: true,
      feature: 'externalLinks',
    });
    await leaveGate();
    await act(async () => button('Open Settings').click());
    expect(caller.product.owner.gate.getState().open).toBe(false);
    expect(records.settingsOpened).toBe(2);
  });

  it('opens Settings without a check where Parent Center allows Never', async () => {
    records.os = 'android';
    storePlatform.os = 'android';
    library.outcomes = ['denied'];
    await drawAndSave();
    await vi.waitFor(() => expect(banners()).toHaveLength(1));
    await choosePolicy('never');
    expect(caller.product.state.settings.parentPolicies.externalLinks).toBe('never');
    await act(async () => button('Open Settings').click());
    expect(caller.product.owner.gate.getState().open).toBe(false);
    expect(records.settingsOpened).toBe(1);
  });

  it('keeps the check on iOS, where Parent Center never offers Never', async () => {
    await refusedOnIos();
    await choosePolicy('never');
    expect(caller.product.state.settings.parentPolicies.externalLinks).not.toBe('never');
    await act(async () => button('Open Settings').click());
    expect(caller.product.owner.gate.getState().open).toBe(true);
    expect(records.settingsOpened).toBe(0);
  });

  it('words a web download that failed without Settings to send a parent to', async () => {
    records.os = 'web';
    library.outcomes = ['denied'];
    await drawAndSave();
    await vi.waitFor(() => expect(banners()).toHaveLength(1));
    const copy = saveFailureCopy('denied', 1, 'web');
    expect(banners()).toEqual([`${copy.heading}${copy.detail}Try again`]);
  });

  // The banner's exit is held until the test lets it finish, as a real timing runs over frames.
  function holdBannerExit() {
    const entered = [];
    const exits = [];
    animated.timing.mockImplementation((value, config) => ({
      start(done) {
        if (config.toValue === 0 && config.duration === BANNER_EXIT_MS) {
          exits.push({ value, from: value.value, done });
          return;
        }
        if (config.toValue === 1 && config.duration === BANNER_ENTER_MS) entered.push(value);
        value.setValue(config.toValue);
        done?.({ finished: true });
      },
      stop() {},
    }));
    return { entered, exits };
  }

  it('plays the exit on the card that was shown, from where its entrance left it', async () => {
    const { entered, exits } = holdBannerExit();
    library.outcomes = ['failed'];
    await drawAndSave();
    await vi.waitFor(() => expect(banners()).toHaveLength(1));
    const card = host.querySelector('[data-testid="rsd-failure-banner"]');
    expect(entered).toHaveLength(1);
    await click('[aria-label="Dismiss"]');
    expect(host.querySelector('[data-testid="rsd-failure-banner"]')).toBe(card);
    expect(exits).toHaveLength(1);
    expect(exits[0].value).toBe(entered[0]);
    expect(exits[0].from).toBe(1);
    await act(async () => exits[0].done({ finished: true }));
    expect(banners()).toEqual([]);
  });

  it('keeps the pressed Try again control, and its focus, through the retry and its failure', async () => {
    library.outcomes = ['failed'];
    await drawAndSave();
    await vi.waitFor(() => expect(banners()).toHaveLength(1));
    const control = button('Try again');
    control.setAttribute('tabindex', '0');
    control.focus();
    expect(document.activeElement).toBe(control);
    let settle;
    library.pending = new Promise((resolve) => (settle = resolve));
    await act(async () => control.click());
    expect(button('Saving…')).toBe(control);
    expect(document.activeElement).toBe(control);
    library.pending = null;
    await act(async () => settle('failed'));
    await vi.waitFor(() => expect(button('Try again')).toBe(control));
    expect(document.activeElement).toBe(control);
  });

  it('flies in from above the paper and back up on Dismiss, under the shipping timing', async () => {
    library.outcomes = ['failed'];
    await drawAndSave();
    await vi.waitFor(() => expect(banners()).toHaveLength(1));
    expect(timings).toContainEqual(
      expect.objectContaining({ toValue: 1, duration: BANNER_ENTER_MS })
    );
    expect(interpolations).toContainEqual(
      expect.objectContaining({ inputRange: [0, 1], outputRange: [-BANNER_FLY_PX, 0] })
    );
    await click('[aria-label="Dismiss"]');
    expect(timings).toContainEqual(
      expect.objectContaining({ toValue: 0, duration: BANNER_EXIT_MS })
    );
    await vi.waitFor(() => expect(banners()).toEqual([]));
  });

  it('announces a Try again that fails again by emptying the region before rewriting the same words', async () => {
    library.outcomes = ['failed', 'failed'];
    await drawAndSave();
    await vi.waitFor(() => expect(banners()).toHaveLength(1));
    const copy = saveFailureCopy('failed', 1, 'ios');
    const words = `${copy.heading}. ${copy.detail}`;
    const spoken = () => records.announcements.filter((text) => text === words).length;
    expect(spoken()).toBe(1);
    await act(async () => button('Try again').click());
    await vi.waitFor(() => expect(spoken()).toBe(2), { timeout: REANNOUNCE_WAIT_MS });
    expect(read('web/src/lib/components/SaveFailureBanner.svelte')).toContain(
      `const REANNOUNCE_GAP_MS = ${FAILURE_REANNOUNCE_GAP_MS};`
    );
  });
});
