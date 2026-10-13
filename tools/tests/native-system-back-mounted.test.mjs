// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScreen, files } from './native-drawing-screen-harness.mjs';
import { LEAVE_CONFIRM_COPY } from '../../experiments/native-architecture/src/product/systemBack.ts';

const SVELTE_LEAVE_CONFIRM = join(
  import.meta.dirname,
  '../../web/src/lib/components/LeaveConfirm.svelte'
);

let screen;
async function pressBack() {
  expect(files.backListeners.size).toBe(1);
  const [listener] = files.backListeners;
  let handled;
  await act(async () => {
    handled = listener();
  });
  return handled;
}
async function mount(platform) {
  files.platform = platform;
  screen = createScreen();
  await act(async () => screen.mount());
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.list.mockReturnValue([]);
  files.lock.mockReturnValue(() => {});
  files.settingsRead.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  files.settingsWrite.mockReset().mockResolvedValue(undefined);
  files.brushRead.mockReset().mockResolvedValue(null);
  files.brushWrite.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  screen?.close();
  screen = null;
  files.platform = 'android';
  vi.clearAllMocks();
});

it('closes the open sheet on Back instead of leaving', async () => {
  await mount('android');
  await screen.click('Draw fixture stroke');
  await screen.click('Drawing tools');
  expect(screen.dialog().getAttribute('aria-label')).toBe('Drawing tools');
  expect(await pressBack()).toBe(true);
  expect(screen.dialog()).toBeNull();
  await screen.menuClick('Settings');
  expect(screen.container.textContent).toContain('Appearance');
  expect(await pressBack()).toBe(true);
  expect(screen.dialog()).toBeNull();
  expect(files.exitApp).not.toHaveBeenCalled();
});

it('asks before Back leaves a drawing, and Keep drawing or Back again stays', async () => {
  await mount('android');
  await screen.click('Draw fixture stroke');
  const drawing = screen.paper();
  expect(await pressBack()).toBe(true);
  expect(screen.dialog().getAttribute('aria-label')).toBe('Leave Splotch?');
  expect(screen.dialog().textContent).toContain(LEAVE_CONFIRM_COPY.body);
  const choices = [...screen.dialog().querySelectorAll('button')].map((b) => b.textContent);
  expect(choices).toEqual(['Keep drawing', 'Leave']);
  await screen.click('Keep drawing');
  expect(screen.dialog()).toBeNull();
  expect(await pressBack()).toBe(true);
  expect(await pressBack()).toBe(true);
  expect(screen.dialog()).toBeNull();
  expect(files.exitApp).not.toHaveBeenCalled();
  expect(screen.paper()).toBe(drawing);
});

it('leaves through exitApp only from the Leave choice', async () => {
  await mount('android');
  await screen.click('Draw fixture stroke');
  await pressBack();
  expect(files.exitApp).not.toHaveBeenCalled();
  await screen.click('Leave');
  expect(files.exitApp).toHaveBeenCalledTimes(1);
  expect(screen.dialog()).toBeNull();
});

it('leaves an empty canvas at once', async () => {
  await mount('android');
  expect(await pressBack()).toBe(true);
  expect(screen.dialog()).toBeNull();
  expect(files.exitApp).toHaveBeenCalledTimes(1);
});

it('registers no Back listener on iOS', async () => {
  await mount('ios');
  expect(files.backListeners.size).toBe(0);
});

it('matches the shipping Leave Splotch copy', () => {
  const svelte = readFileSync(SVELTE_LEAVE_CONFIRM, 'utf8')
    .replace(/\s+/g, ' ')
    .replace(/> | </g, (edge) => edge.trim());
  for (const copy of Object.values(LEAVE_CONFIRM_COPY)) expect(svelte).toContain(`>${copy}<`);
});
