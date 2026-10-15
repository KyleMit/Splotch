// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScreen, files } from './native-drawing-screen-harness.mjs';
import { RELEASE_NOTES } from '../../experiments/native-architecture/src/settings/whatsNew.ts';

let screen;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.lock.mockReturnValue(() => {});
  files.settingsRead.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  files.settingsWrite.mockReset().mockResolvedValue(undefined);
  files.brushRead.mockReset().mockResolvedValue(null);
  files.brushWrite.mockReset().mockResolvedValue(undefined);
  screen = createScreen();
  await act(async () => screen.mount());
});
afterEach(() => {
  screen.close();
  vi.clearAllMocks();
});

it('keeps the drawing and history while reading bundled information from Settings', async () => {
  await screen.click('Draw fixture stroke');
  const drawing = JSON.parse(screen.paper());
  await screen.menuClick('Settings');
  await screen.click('Help and about');
  expect(screen.dialog().textContent).toContain('Make a picture');
  await screen.click('Privacy');
  expect(screen.dialog().textContent).toContain('What stays on your device');
  expect(screen.dialog().textContent).toContain('A daily cleanup deletes the report after 30 days');
  expect(screen.dialog().textContent).toContain('There is no generated picture to include.');
  expect(screen.dialog().textContent).toContain(
    'Nothing is kept unless that final confirmation happens.'
  );
  await screen.click('Back to help and about');
  await screen.click('What’s new');
  expect(screen.dialog().textContent).toContain(RELEASE_NOTES[0].sections[0].blocks[0].text);
  expect(screen.dialog().textContent).not.toContain('In this beta');
  await screen.click('Back to Settings');
  expect(screen.button('Manage Parent Center')).toBeDefined();
  await screen.click('Help and about');
  await screen.click('Keep drawing');
  expect(JSON.parse(screen.paper())).toEqual(drawing);
  await screen.click('Undo');
  expect(JSON.parse(screen.paper()).strokes).toHaveLength(0);
  expect(files.settingsWrite).not.toHaveBeenCalled();
  expect(files.aiSend).not.toHaveBeenCalled();
  expect(files.feedbackSend).not.toHaveBeenCalled();
});
