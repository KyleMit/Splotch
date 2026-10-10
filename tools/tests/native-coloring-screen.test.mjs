// @vitest-environment happy-dom
import { createScreen, files, pictures } from './native-drawing-screen-harness.mjs';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
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
  screen = createScreen();
  await act(async () => screen.mount());
});

afterEach(() => {
  screen.close();
  vi.clearAllMocks();
});

describe('coloring-page controls through the real drawing screen', () => {
  it('disables the underlying toolbar and paper while the real picker is open', async () => {
    await screen.click('Draw fixture stroke');
    const original = screen.paper();
    await screen.click('Coloring pages');
    const choices = [...screen.dialog().querySelectorAll('[role="radio"]')];
    expect(choices.map((choice) => choice.getAttribute('aria-label'))).toEqual([
      'Blank paper',
      'Sunshine',
      'Garden flower',
      'Little turtle',
    ]);
    expect(choices.map((choice) => choice.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(screen.container.querySelector('[data-fixture-cohort-drivers]')).toBeNull();
    const underlying = [...screen.container.querySelectorAll('button')].filter(
      (button) => !screen.dialog().contains(button)
    );
    expect(underlying.length).toBeGreaterThan(10);
    expect(underlying.every((button) => button.disabled)).toBe(true);
    await act(async () => screen.button('Clear').click());
    expect(screen.paper()).toBe(original);
    await screen.click('Keep drawing');
    expect(screen.dialog()).toBeNull();
    expect(screen.paper()).toBe(original);
    expect(screen.button('Save picture').disabled).toBe(false);
    await screen.click('Undo');
    expect(JSON.parse(screen.paper())).toEqual(emptyDrawing());
    expect(screen.button('Undo').disabled).toBe(true);
  });

  it('changes page and paint in one history entry and keeps same-page paint intact', async () => {
    await screen.click('Draw fixture stroke');
    const original = screen.paper();
    await screen.click('Coloring pages');
    await screen.click('Garden flower');
    expect(screen.dialog()).toBeNull();
    expect(JSON.parse(screen.paper())).toEqual(emptyDrawing(0, 'flower'));
    expect(screen.container.textContent).toContain(
      'Garden flower ready. Undo brings your picture back.'
    );
    await screen.click('Draw fixture stroke');
    const painted = screen.paper();
    await screen.click('Coloring pages');
    expect(screen.button('Garden flower').getAttribute('aria-checked')).toBe('true');
    await screen.click('Garden flower');
    expect(screen.dialog()).toBeNull();
    expect(screen.paper()).toBe(painted);
    await screen.click('Undo');
    expect(JSON.parse(screen.paper())).toEqual(emptyDrawing(0, 'flower'));
    await screen.click('Undo');
    expect(screen.paper()).toBe(original);
  });

  it('preserves the selected page through Clear and restores blank selection atomically with Undo', async () => {
    await screen.click('Coloring pages');
    await screen.click('Little turtle');
    await screen.click('Draw fixture stroke');
    const painted = screen.paper();
    files.ink.mockResolvedValueOnce(rgbaPng(1024, 768, 255).toString('base64'));
    await screen.click('Clear');
    await vi.waitFor(
      async () => {
        await act(async () => {});
        expect(JSON.parse(screen.paper()).strokes).toEqual([]);
      },
      { timeout: PNG_TIMEOUT_MS }
    );
    expect(JSON.parse(screen.paper())).toEqual(emptyDrawing(1, 'turtle'));
    expect(screen.button('Clear').disabled).toBe(false);
    await screen.click('Undo');
    expect(screen.paper()).toBe(painted);
    await screen.click('Coloring pages');
    await screen.click('Blank paper');
    expect(JSON.parse(screen.paper())).toEqual(emptyDrawing());
    await screen.click('Undo');
    expect(screen.paper()).toBe(painted);
  });
});
