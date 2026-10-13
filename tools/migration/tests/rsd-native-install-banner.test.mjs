import {
  caller,
  expandControls,
  host as screenHost,
  mount,
  records,
  root,
} from './rsd-native-selection-host.mjs';
import { mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { act, createElement } from 'react';
import { Animated } from 'react-native';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  INSTALL_PREVIEW_ICON_SRC,
  RsdInstallBanner,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdInstallBanner.tsx';
import { INSTALL_HINT_ID } from '../../../experiments/native-architecture/src/rsdDrawing/RsdInstallText.tsx';
import { createInstallPrompt } from '../../../experiments/native-architecture/src/install/installPolicy.ts';
import { PARTING_MESSAGE_MS } from '../../../experiments/native-architecture/src/install/useInstallBanner.ts';
import {
  INSTALL_BANNER_COPY,
  INSTALL_PROMPT_COPY,
  iosBannerSteps,
} from '../../../experiments/native-architecture/src/install/installCopy.ts';
import { EDGE_INSET_PX } from '../../../experiments/native-architecture/src/rsdDrawing/edgeLayout.ts';
import { TOUCH_TARGET } from '../../../experiments/native-architecture/src/drawing/theme.ts';
import { STORAGE_KEYS } from '../../../web/src/lib/storageKeys.ts';
import { BANNER_ENTER_MS, BANNER_EXIT_MS } from '../../../web/src/lib/components/bannerMotion.ts';
import { CALM_FADE_MS } from '../../../web/src/lib/motionDurations.ts';
import {
  BUTTON_SCALE_MAX,
  BUTTON_SCALE_MIN,
  controlSize,
} from '../../../experiments/native-architecture/src/settings/buttonSize.ts';

const install = vi.hoisted(() => ({ owner: null }));
vi.mock('../../../experiments/native-architecture/src/platform/installPrompt.ts', () => ({
  get installPrompt() {
    return install.owner;
  },
}));

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
// The shipping banner's literals, written out so a drifted port fails here as well as in
// native-web-install-drift.test.mjs: --space-2, --space-4 and the auto-clear shrink's duration.
const SPACE_2_PX = 8;
const SPACE_4_PX = 16;
const SHRINK_EXIT_MS = 550;
const PHONE = { width: 402, height: 874, scale: 1, fontScale: 1 };
const TABLET = { width: 1366, height: 1024, scale: 1, fontScale: 1 };
let stored;
let host;
let timing;

beforeEach(() => {
  stored = new Map();
  records.dimensions = PHONE;
  timing = vi.spyOn(Animated, 'timing');
  install.owner = createInstallPrompt({
    device: { userAgent: IPHONE_SAFARI, platform: 'iPhone', maxTouchPoints: 5, standalone: false },
    storage: {
      read: (key) => stored.get(key) ?? null,
      write: (key, value) => stored.set(key, value),
      remove: (key) => stored.delete(key),
    },
  });
});
afterEach(() => {
  timing.mockRestore();
  vi.useRealTimers();
});

async function show(strokes, hidden = false, size = TOUCH_TARGET) {
  const element = createElement(RsdInstallBanner, { strokes, hidden, controlSize: size });
  if (root) await act(async () => root.render(element));
  else host = await mount(element);
}

function button(name) {
  return [...host.querySelectorAll('button')].find(
    (node) => node.getAttribute('aria-label') === name || node.textContent === name
  );
}

async function click(name) {
  const node = button(name);
  expect(node, name).toBeDefined();
  await act(async () => node.click());
}

// The disclosure state the latest CTA render reported to assistive technology.
function expanded() {
  return records.props.findLast((props) => props.accessibilityState?.expanded !== undefined)
    ?.accessibilityState.expanded;
}

// Whether the steps the CTA controls have rendered at all in this test.
function hint() {
  return records.props.some((props) => props.nativeID === INSTALL_HINT_ID);
}

// The banner's moves, as the durations its Animated timings ran for, each with its target.
function moves() {
  return timing.mock.calls
    .filter(([, config]) => [0, 1].includes(config.toValue))
    .map(([, { toValue, duration }]) => ({ toValue, duration }));
}

function overlayInsets() {
  const overlay = records.props.findLast(
    (props) => Array.isArray(props.style) && props.style[1]?.paddingTop !== undefined
  );
  const { paddingTop, paddingLeft, paddingRight, paddingBottom } = overlay.style[1];
  return { paddingTop, paddingLeft, paddingRight, paddingBottom };
}

it('waits for settled-in drawing, then guides Safari to the Share sheet', async () => {
  await show(2);
  expect(host.textContent).not.toContain(INSTALL_PROMPT_COPY.initial.heading);
  await show(3);
  expect(host.textContent).toContain(INSTALL_PROMPT_COPY.initial.heading);
  expect(host.textContent).toContain(INSTALL_PROMPT_COPY.initial.detail);
  await click(INSTALL_BANNER_COPY.showHint);
  expect(records.dimensions.width).toBeLessThan(records.dimensions.height);
  const spoken = host.textContent.replace(/\s+/g, ' ');
  for (const step of iosBannerSteps('at the bottom of the screen')) expect(spoken).toContain(step);
  await click(INSTALL_BANNER_COPY.hideHint);
  expect(host.textContent).not.toContain('at the bottom of the screen');
});

it('wears the shipping card: the home-screen icon tile, the outlined close and the How? disclosure', async () => {
  await show(3);
  expect(records.props.some((props) => props.src === INSTALL_PREVIEW_ICON_SRC)).toBe(true);
  expect(host.textContent).toContain('Splotch');
  const close = button(INSTALL_BANNER_COPY.dismiss);
  expect(close.getAttribute('aria-label')).toBe(INSTALL_BANNER_COPY.dismiss);
  expect(close.textContent).toBe('');
  const how = button(INSTALL_BANNER_COPY.showHint);
  expect(how.getAttribute('aria-label')).toBeNull();
  expect(expanded()).toBe(false);
  expect(hint()).toBe(false);
  await click(INSTALL_BANNER_COPY.showHint);
  expect(expanded()).toBe(true);
  expect(hint()).toBe(true);
});

it.each([
  ['phone portrait', PHONE, [INSTALL_BANNER_COPY.dismiss, INSTALL_BANNER_COPY.showHint]],
  ['tablet', TABLET, [INSTALL_BANNER_COPY.showHint, INSTALL_BANNER_COPY.dismiss]],
])('lays out its %s row as shipping does', async (_name, dimensions, order) => {
  records.dimensions = dimensions;
  await show(3);
  const names = [...host.querySelectorAll('button')].map(
    (node) => node.getAttribute('aria-label') ?? node.textContent
  );
  expect(names).toEqual(order);
});

it('remembers a dismissal in the shipping storage key and flies back down', async () => {
  await show(2);
  await show(3);
  timing.mockClear();
  await click(INSTALL_BANNER_COPY.dismiss);
  expect(moves()).toEqual([{ toValue: 0, duration: BANNER_EXIT_MS }]);
  expect(host.textContent).not.toContain(INSTALL_PROMPT_COPY.initial.heading);
  expect(stored.get(STORAGE_KEYS.installDismissed)).toBe('true');
});

it('flies up from the dock as it appears', async () => {
  await show(2);
  timing.mockClear();
  await show(3);
  expect(moves()).toEqual([{ toValue: 1, duration: BANNER_ENTER_MS }]);
});

it('fades instead of travelling under Reduce Motion', async () => {
  records.reduceMotion = true;
  await show(2);
  timing.mockClear();
  await show(3);
  await click(INSTALL_BANNER_COPY.dismiss);
  expect(moves()).toEqual([
    { toValue: 1, duration: CALM_FADE_MS },
    { toValue: 0, duration: CALM_FADE_MS },
  ]);
});

it('hands off to Settings after five ignored strokes and shrinks into it', async () => {
  vi.useFakeTimers();
  await show(3);
  for (const strokes of [4, 5, 6, 7]) await show(strokes);
  expect(host.textContent).toContain(INSTALL_PROMPT_COPY.initial.heading);
  await show(8);
  expect(host.textContent).toContain(INSTALL_BANNER_COPY.parting);
  expect(stored.get(STORAGE_KEYS.installDismissed)).toBe('true');
  timing.mockClear();
  await act(async () => vi.advanceTimersByTime(PARTING_MESSAGE_MS));
  expect(moves()).toEqual([{ toValue: 0, duration: SHRINK_EXIT_MS }]);
  expect(host.textContent).not.toContain(INSTALL_BANNER_COPY.parting);
});

it('steps aside under other controls without motion and restarts its countdown when shown again', async () => {
  await show(3);
  timing.mockClear();
  await show(4, true);
  expect(host.textContent).not.toContain(INSTALL_PROMPT_COPY.initial.heading);
  await show(9, true);
  await show(9);
  expect(moves()).toEqual([]);
  expect(host.textContent).toContain(INSTALL_PROMPT_COPY.initial.heading);
  await show(13);
  expect(host.textContent).toContain(INSTALL_PROMPT_COPY.initial.heading);
});

it('opens the browser install dialog from the Install button', async () => {
  const prompt = vi.fn().mockResolvedValue(undefined);
  install.owner.capture({
    preventDefault() {},
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  await show(3);
  expect(expanded()).toBeUndefined();
  await click(INSTALL_BANNER_COPY.install);
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toContain(INSTALL_PROMPT_COPY.initial.heading);
  expect(stored.get(STORAGE_KEYS.installCompleted)).toBe('true');
});

it.each([
  ['the normal', TOUCH_TARGET, TOUCH_TARGET],
  ['the largest', controlSize(BUTTON_SCALE_MAX), controlSize(BUTTON_SCALE_MAX)],
  ['the smallest', controlSize(BUTTON_SCALE_MIN), TOUCH_TARGET],
])(
  'docks as shipping does, clear of its corner controls at %s Button Size',
  async (_n, size, corner) => {
    const reach = EDGE_INSET_PX + corner;
    await show(3, false, size);
    expect(overlayInsets()).toEqual({
      paddingTop: reach + SPACE_2_PX,
      paddingLeft: SPACE_4_PX,
      paddingRight: SPACE_4_PX,
      paddingBottom: reach + SPACE_2_PX,
    });
    records.dimensions = TABLET;
    await show(3, false, size);
    expect(overlayInsets()).toEqual({
      paddingTop: reach + SPACE_2_PX,
      paddingLeft: reach + SPACE_4_PX,
      paddingRight: reach + SPACE_4_PX,
      paddingBottom: SPACE_4_PX,
    });
    expect(host.textContent).toContain(INSTALL_PROMPT_COPY.initial.heading);
  }
);

it('steps aside while the landscape tool drawer is open and returns when it closes', async () => {
  records.dimensions = { width: 844, height: 390, scale: 1, fontScale: 1 };
  await mountToolbar(toolbarScreen({ committedStrokes: 3 }));
  const heading = INSTALL_PROMPT_COPY.initial.heading;
  const how = (name) =>
    [...screenHost.querySelectorAll('button')].find((node) => node.textContent === name);
  expect(screenHost.textContent).toContain(heading);
  await act(async () => how(INSTALL_BANNER_COPY.showHint).click());
  const paperRenders = caller.paperRender.mock.calls.length;
  await expandControls();
  expect(screenHost.querySelector('[aria-label="Parent Center"]')).not.toBeNull();
  expect(screenHost.textContent).not.toContain(heading);
  await act(async () => screenHost.querySelector('[aria-label="Collapse controls"]').click());
  expect(screenHost.textContent).toContain(heading);
  expect(caller.paperRender).toHaveBeenCalledTimes(paperRenders);
  expect(how(INSTALL_BANNER_COPY.hideHint)).toBeDefined();
});
