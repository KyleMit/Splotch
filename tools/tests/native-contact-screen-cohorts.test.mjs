// @vitest-environment happy-dom
import { createScreen, files, pictures } from './native-drawing-screen-harness.mjs';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rgbaPng } from './native-png-fixtures.mjs';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';

let screen;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.list.mockReturnValue(pictures);
  files.open.mockReset();
  files.capture.mockReset();
  files.ink.mockReset();
  files.export.mockReset();
  files.lock.mockReset().mockReturnValue(() => {});
  files.settingsRead.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  files.settingsWrite.mockReset().mockResolvedValue(undefined);
  screen = createScreen({ cohortDrivers: true });
  await act(async () => screen.mount());
});
afterEach(() => {
  screen.close();
  vi.clearAllMocks();
});

describe('contact cohort history through the current drawing screen', () => {
  it('keeps commands disabled until every contact ends and commits one Undo group', async () => {
    await screen.click('Draw two-contact cohort');
    await screen.click('Begin cohort');
    await screen.click('Lift one contact');
    const commands = ['Undo', 'Clear', 'Save picture', 'Pictures', 'Export PNG'];
    expect(commands.map((label) => screen.button(label).disabled)).toEqual(
      commands.map(() => true)
    );
    await screen.click('Finish cohort');
    expect(commands.map((label) => screen.button(label).disabled)).toEqual(
      commands.map(() => false)
    );
    expect(JSON.parse(screen.paper()).strokes).toHaveLength(4);
    await screen.click('Undo');
    expect(JSON.parse(screen.paper()).strokes).toHaveLength(2);
  });

  it('removes both strokes with one Undo and keeps observed Clear independently reversible', async () => {
    await screen.click('Draw two-contact cohort');
    const first = screen.paper();
    expect(JSON.parse(first).strokes).toHaveLength(2);
    files.ink.mockResolvedValueOnce(rgbaPng(1024, 768, 255).toString('base64'));
    await screen.click('Clear');
    await vi.waitFor(
      async () => {
        await act(async () => {});
        expect(JSON.parse(screen.paper()).strokes).toEqual([]);
      },
      { timeout: PNG_TIMEOUT_MS }
    );
    await screen.click('Undo');
    expect(screen.paper()).toBe(first);
    await screen.click('Undo');
    expect(JSON.parse(screen.paper()).strokes).toEqual([]);
  });
});
