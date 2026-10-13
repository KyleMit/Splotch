// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScreen, files } from './native-drawing-screen-harness.mjs';
let screen;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.settingsRead.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  files.settingsWrite.mockReset().mockResolvedValue(undefined);
  files.lock.mockReturnValue(() => {});
  files.platform = 'android';
  files.retainClosingModal = false;
  screen = createScreen();
  await act(async () => screen.mount());
});
afterEach(() => {
  screen.close();
  vi.clearAllMocks();
});
it('drives ungated RN Settings to hide coloring, clear the page and clamp actual Undo', async () => {
  await screen.menuClick('Coloring pages');
  await screen.click('Sunshine');
  await screen.click('Draw fixture stroke');
  const original = JSON.parse(screen.paper());
  expect(original.pageId).toBe('sunshine');
  await screen.menuClick('Settings');
  await screen.click('Coloring book');
  expect(screen.container.textContent).not.toContain('Grown-ups only');
  expect(JSON.parse(files.settingsWrite.mock.calls.at(-1)[0])).toMatchObject({
    version: 11,
    coloringBookEnabled: false,
    aiEnabled: false,
  });
  expect(JSON.parse(screen.paper())).toMatchObject({
    pageId: 'blank',
    strokes: original.strokes,
    rainbow: original.rainbow,
  });
  await screen.click('Close Settings');
  await screen.click('Undo');
  expect(JSON.parse(screen.paper()).pageId).toBe('blank');
  const opener = [...screen.container.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === 'Drawing tools'
  );
  expect(opener).toBeDefined();
  await screen.click(opener.getAttribute('aria-label'));
  expect(screen.button('Coloring pages')).toBeUndefined();
  expect(screen.button('Pictures')).toBeUndefined();
  await screen.click('Keep drawing');
  expect(original.pageId).toBe('sunshine');
  await screen.menuClick('Settings');
  await screen.click('Coloring book');
  await screen.click('Close Settings');
  await screen.menuClick('Coloring pages');
  expect(screen.button('Sunshine')).toBeDefined();
  expect(files.aiSend).not.toHaveBeenCalled();
  expect(files.aiVaultWrite).not.toHaveBeenCalled();
});
