// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUndoShortcut } from '../../experiments/native-architecture/src/platform/useUndoShortcut.web.ts';
import { createScreen, files } from './native-drawing-screen-harness.mjs';

vi.mock(
  '../../experiments/native-architecture/src/platform/useUndoShortcut.ts',
  () => import('../../experiments/native-architecture/src/platform/useUndoShortcut.web.ts')
);

function key(target = window, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key: 'z',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  act(() => target.dispatchEvent(event));
  return event;
}

describe('web Undo shortcut adapter', () => {
  let host, root, undo;
  function Consumer({ enabled = true, action = undo }) {
    useUndoShortcut(action, enabled);
    return null;
  }
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    undo = vi.fn();
    act(() => root.render(createElement(Consumer)));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });
  it.each([
    { ctrlKey: true, metaKey: false },
    { ctrlKey: false, metaKey: true, key: 'Z' },
  ])('uses the current Undo owner for modifier %j', (options) => {
    const event = key(window, options);
    expect(undo).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });
  it.each([
    { ctrlKey: false },
    { shiftKey: true },
    { altKey: true },
    { key: 'y' },
    { isComposing: true },
  ])('leaves other keyboard behavior alone for %j', (options) => {
    const event = key(window, options);
    expect(undo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
  it.each(['input', 'textarea', 'select', 'div'])('preserves editing inside %s', (tag) => {
    const field = document.createElement(tag);
    if (tag === 'div') field.setAttribute('contenteditable', 'true');
    host.append(field);
    const target = tag === 'div' ? field.appendChild(document.createElement('span')) : field;
    const event = key(target);
    expect(undo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
  it('does not consume an already handled event', () => {
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true });
    event.preventDefault();
    act(() => window.dispatchEvent(event));
    expect(undo).not.toHaveBeenCalled();
  });
  it('observes current admission and owner without retaining the initial callback', () => {
    const next = vi.fn();
    act(() => root.render(createElement(Consumer, { enabled: false, action: next })));
    expect(key().defaultPrevented).toBe(false);
    expect(next).not.toHaveBeenCalled();
    act(() => root.render(createElement(Consumer, { enabled: true, action: next })));
    expect(key().defaultPrevented).toBe(true);
    expect(next).toHaveBeenCalledOnce();
    expect(undo).not.toHaveBeenCalled();
  });
  it.each(['dialog', 'aria'])('respects an open %s dialog outside the drawing owner', (kind) => {
    const dialog = document.createElement(kind === 'dialog' ? 'dialog' : 'div');
    if (kind === 'dialog') dialog.setAttribute('open', '');
    else {
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
    }
    host.append(dialog);
    expect(key().defaultPrevented).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });
  it('removes the actual window listener when its owner unmounts', () => {
    act(() => root.render(null));
    expect(key().defaultPrevented).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });
});

describe('drawing screen web Undo admission', () => {
  let screen;
  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    files.retainClosingModal = false;
    files.platform = 'android';
    files.dismissModal = null;
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
  it('hides both controls through Settings while preserving widths, committed ink and keyboard Undo', async () => {
    await screen.menuClick('Drawing width: Thin');
    await screen.click('Keep drawing');
    await screen.click('Draw fixture stroke');
    const original = screen.paper();
    expect(JSON.parse(original).strokes[0].width).toBe(4);
    await screen.menuClick('Settings');
    await screen.click('Show Undo button');
    await screen.click('Show drawing width controls');
    expect(screen.paper()).toBe(original);
    expect(screen.button('Undo')).toBeUndefined();
    expect(JSON.parse(files.settingsWrite.mock.calls.at(-1)[0])).toMatchObject({
      undoButtonEnabled: false,
      strokeWidthControlEnabled: false,
      strokeWidth: 'thin',
      eraserWidth: 'medium',
    });
    await screen.click('Close Settings');
    await screen.click('Drawing tools');
    expect(screen.button('Drawing width: Thin')).toBeUndefined();
    await screen.click('Keep drawing');
    await screen.click('Draw fixture stroke');
    expect(JSON.parse(screen.paper()).strokes.map(({ width }) => width)).toEqual([4, 4]);
    expect(key().defaultPrevented).toBe(true);
    expect(screen.paper()).toBe(original);
    await screen.menuClick('Settings');
    await screen.click('Show Undo button');
    await screen.click('Show drawing width controls');
    await screen.click('Close Settings');
    expect(screen.button('Undo').disabled).toBe(false);
    await screen.click('Drawing tools');
    expect(screen.button('Drawing width: Thin').getAttribute('aria-pressed')).toBe('true');
    await screen.click('Keep drawing');
    await screen.click('Undo');
    expect(JSON.parse(screen.paper()).strokes).toHaveLength(0);
  });
  it('restores hidden controls and the selected width from a saved current snapshot', async () => {
    await screen.menuClick('Drawing width: Thick');
    await screen.click('Settings');
    await screen.click('Show Undo button');
    await screen.click('Show drawing width controls');
    const saved = files.settingsWrite.mock.calls.at(-1)[0];
    screen.close();
    files.settingsRead.mockResolvedValue(saved);
    screen = createScreen();
    await act(async () => screen.mount());
    expect(screen.button('Undo')).toBeUndefined();
    await screen.click('Draw fixture stroke');
    expect(JSON.parse(screen.paper()).strokes[0].width).toBe(14);
    await screen.click('Drawing tools');
    expect(screen.button('Drawing width: Thick')).toBeUndefined();
    await screen.click('Settings');
    expect(screen.button('Show Undo button').getAttribute('aria-checked')).toBe('false');
    expect(screen.button('Show drawing width controls').getAttribute('aria-checked')).toBe('false');
  });
  it('disables both Settings switches during a serialized save and a retained closing sheet', async () => {
    await screen.menuClick('Settings');
    let finish;
    files.settingsWrite.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    await screen.click('Show Undo button');
    expect(screen.button('Show Undo button').disabled).toBe(true);
    expect(screen.button('Show drawing width controls').disabled).toBe(true);
    expect(files.settingsWrite).toHaveBeenCalledOnce();
    await act(async () => finish());
    expect(screen.button('Show drawing width controls').disabled).toBe(false);
    files.retainClosingModal = true;
    files.platform = 'ios';
    await screen.click('Close Settings');
    expect(screen.button('Show Undo button').disabled).toBe(true);
    expect(screen.button('Show drawing width controls').disabled).toBe(true);
    await act(async () => files.dismissModal());
    files.retainClosingModal = false;
    files.platform = 'android';
  });
  it('undoes committed ink and leaves the default alone when history becomes empty', async () => {
    await screen.click('Draw fixture stroke');
    expect(key().defaultPrevented).toBe(true);
    expect(JSON.parse(screen.paper()).strokes).toHaveLength(0);
    expect(key().defaultPrevented).toBe(false);
  });
  it.each(['Drawing tools', 'More colors', 'Coloring pages', 'Settings', 'Parent Center'])(
    'keeps history unchanged while %s is open',
    async (label) => {
      await screen.click('Draw fixture stroke');
      const drawing = screen.paper();
      if (['Coloring pages', 'Settings'].includes(label)) await screen.menuClick(label);
      else await screen.click(label);
      expect(key().defaultPrevented).toBe(false);
      expect(screen.paper()).toBe(drawing);
    }
  );
  it('does not undo through a live contact cohort', async () => {
    await screen.click('Draw fixture stroke');
    const drawing = screen.paper();
    await screen.click('Begin cohort');
    expect(key().defaultPrevented).toBe(false);
    expect(screen.paper()).toBe(drawing);
  });
  it('does not undo while the command owner is saving a picture', async () => {
    let finish;
    files.capture.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    await screen.click('Draw fixture stroke');
    const drawing = screen.paper();
    await screen.menuClick('Save picture');
    expect(files.capture).toHaveBeenCalled();
    expect(key().defaultPrevented).toBe(false);
    expect(screen.paper()).toBe(drawing);
    await act(async () => finish(null));
  });
});
