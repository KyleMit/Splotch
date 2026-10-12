// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUndoShortcut } from '../../experiments/native-architecture/src/platform/useUndoShortcut.web.ts';
import { createScreen, files, pictures } from './native-drawing-screen-harness.mjs';

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
    files.list.mockReturnValue(pictures);
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
  it('undoes committed ink and leaves the default alone when history becomes empty', async () => {
    await screen.click('Draw fixture stroke');
    expect(key().defaultPrevented).toBe(true);
    expect(JSON.parse(screen.paper()).strokes).toHaveLength(0);
    expect(key().defaultPrevented).toBe(false);
  });
  it.each([
    'Drawing tools',
    'More colors',
    'Pictures',
    'Coloring pages',
    'Settings',
    'Parent Center',
  ])('keeps history unchanged while %s is open', async (label) => {
    await screen.click('Draw fixture stroke');
    const drawing = screen.paper();
    if (['Pictures', 'Coloring pages', 'Settings'].includes(label)) await screen.menuClick(label);
    else await screen.click(label);
    expect(key().defaultPrevented).toBe(false);
    expect(screen.paper()).toBe(drawing);
  });
  it('does not undo through a live contact cohort', async () => {
    await screen.click('Draw fixture stroke');
    const drawing = screen.paper();
    await screen.click('Begin cohort');
    expect(key().defaultPrevented).toBe(false);
    expect(screen.paper()).toBe(drawing);
  });
  it('does not undo while the command owner is saving a picture', async () => {
    let finish;
    files.save.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    await screen.click('Draw fixture stroke');
    const drawing = screen.paper();
    await screen.menuClick('Save picture');
    expect(files.save).toHaveBeenCalled();
    expect(key().defaultPrevented).toBe(false);
    expect(screen.paper()).toBe(drawing);
    await act(async () => finish({ id: 'picture-1-shortcut' }));
  });
});
