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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RsdInstallBanner } from '../../../experiments/native-architecture/src/rsdDrawing/RsdInstallBanner.tsx';
import { createInstallPrompt } from '../../../experiments/native-architecture/src/install/installPolicy.ts';
import { PARTING_MESSAGE_MS } from '../../../experiments/native-architecture/src/install/useInstallBanner.ts';
import {
  INSTALL_BANNER_COPY,
  INSTALL_PROMPT_COPY,
  iosBannerSteps,
} from '../../../experiments/native-architecture/src/install/installCopy.ts';
import { EDGE_INSET_PX } from '../../../experiments/native-architecture/src/rsdDrawing/edgeLayout.ts';
import {
  CONTROL_GAP,
  TOUCH_TARGET,
} from '../../../experiments/native-architecture/src/drawing/theme.ts';
import { STORAGE_KEYS } from '../../../web/src/lib/storageKeys.ts';
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
let stored;
let host;

beforeEach(() => {
  stored = new Map();
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
  vi.useRealTimers();
});

async function show(strokes, hidden = false, controlSize = TOUCH_TARGET) {
  const element = createElement(RsdInstallBanner, { strokes, hidden, controlSize });
  if (root) await act(async () => root.render(element));
  else host = await mount(element);
}

async function click(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  await act(async () => node.click());
}

it('waits for settled-in drawing, then guides Safari to the Share sheet', async () => {
  await show(2);
  expect(host.textContent).not.toContain(INSTALL_PROMPT_COPY.initial.heading);
  await show(3);
  expect(host.textContent).toContain(INSTALL_PROMPT_COPY.initial.heading);
  expect(host.textContent).toContain(INSTALL_PROMPT_COPY.initial.detail);
  await click(INSTALL_BANNER_COPY.showHint);
  expect(records.dimensions.width).toBeLessThan(records.dimensions.height);
  for (const step of iosBannerSteps('at the bottom of the screen'))
    expect(host.textContent).toContain(step);
  await click(INSTALL_BANNER_COPY.hideHint);
  expect(host.textContent).not.toContain(iosBannerSteps('at the bottom of the screen')[0]);
});

it('remembers a dismissal in the shipping storage key', async () => {
  await show(3);
  await click(INSTALL_BANNER_COPY.dismiss);
  expect(host.textContent).not.toContain(INSTALL_PROMPT_COPY.initial.heading);
  expect(stored.get(STORAGE_KEYS.installDismissed)).toBe('true');
});

it('hands off to Settings after five ignored strokes', async () => {
  vi.useFakeTimers();
  await show(3);
  for (const strokes of [4, 5, 6, 7]) await show(strokes);
  expect(host.textContent).toContain(INSTALL_PROMPT_COPY.initial.heading);
  await show(8);
  expect(host.textContent).toContain(INSTALL_BANNER_COPY.parting);
  expect(stored.get(STORAGE_KEYS.installDismissed)).toBe('true');
  await act(async () => vi.advanceTimersByTime(PARTING_MESSAGE_MS));
  expect(host.textContent).not.toContain(INSTALL_BANNER_COPY.parting);
});

it('steps aside under other controls and restarts its countdown when shown again', async () => {
  await show(3);
  await show(4, true);
  expect(host.textContent).not.toContain(INSTALL_PROMPT_COPY.initial.heading);
  await show(9, true);
  await show(9);
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
  'floats over the paper area clear of its corner controls at %s Button Size',
  async (_name, size, corner) => {
    await show(3, false, size);
    const reach = EDGE_INSET_PX + corner + CONTROL_GAP;
    const overlay = records.props.findLast((props) => props.style?.position === 'absolute');
    expect(overlay?.style).toMatchObject({
      position: 'absolute',
      top: reach,
      left: reach,
      right: reach,
      bottom: EDGE_INSET_PX,
    });
    expect(host.textContent).toContain(INSTALL_PROMPT_COPY.initial.heading);
  }
);

it('steps aside while the landscape tool drawer is open and returns when it closes', async () => {
  records.dimensions = { width: 844, height: 390, scale: 1, fontScale: 1 };
  await mountToolbar(toolbarScreen({ committedStrokes: 3 }));
  const heading = INSTALL_PROMPT_COPY.initial.heading;
  expect(screenHost.textContent).toContain(heading);
  await act(async () =>
    screenHost.querySelector(`[aria-label="${INSTALL_BANNER_COPY.showHint}"]`).click()
  );
  const paperRenders = caller.paperRender.mock.calls.length;
  await expandControls();
  expect(screenHost.querySelector('[aria-label="Parent Center"]')).not.toBeNull();
  expect(screenHost.textContent).not.toContain(heading);
  await act(async () => screenHost.querySelector('[aria-label="Collapse controls"]').click());
  expect(screenHost.textContent).toContain(heading);
  expect(caller.paperRender).toHaveBeenCalledTimes(paperRenders);
  expect(screenHost.querySelector(`[aria-label="${INSTALL_BANNER_COPY.hideHint}"]`)).not.toBeNull();
});
