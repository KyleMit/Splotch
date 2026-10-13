import { mount, records, root } from './rsd-native-selection-host.mjs';
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
import { STORAGE_KEYS } from '../../../web/src/lib/storageKeys.ts';

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

async function show(strokes, hidden = false) {
  const element = createElement(RsdInstallBanner, { strokes, hidden });
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
