import { describe, expect, it, vi } from 'vitest';
import {
  BROWSER_BACK_STATE_KEY,
  createBrowserBack,
} from '../../experiments/native-architecture/src/product/browserBack.ts';

function browser() {
  const entries = [
    { url: 'https://beta.invalid/previous', state: { previous: true } },
    { url: 'https://beta.invalid/', state: { foreign: { retained: true } } },
  ];
  let index = 1;
  let queued = 0;
  const listeners = new Set();
  const port = {
    state: () => entries[index].state,
    url: () => entries[index].url,
    push(state) {
      entries.splice(index + 1, entries.length, { url: port.url(), state });
      index += 1;
    },
    replace(state) {
      entries[index].state = state;
    },
    back: vi.fn(() => {
      queued += 1;
    }),
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    port,
    entries,
    layers: () => port.state()[BROWSER_BACK_STATE_KEY]?.layers ?? [],
    index: () => index,
    listenerCount: () => listeners.size,
    flush() {
      const MAX_TRAVERSALS = 100;
      let traversals = 0;
      while (queued > 0) {
        if (++traversals > MAX_TRAVERSALS) throw new Error('Unbounded history traversal');
        queued -= 1;
        index = Math.max(0, index - 1);
        for (const listener of [...listeners]) listener();
      }
    },
    back() {
      port.back();
      this.flush();
    },
    stalePop() {
      for (const listener of [...listeners]) listener();
    },
    navigate(url) {
      entries.splice(index + 1, entries.length, { url, state: { foreignRoute: true } });
      index += 1;
    },
    reload() {
      listeners.clear();
    },
  };
}

function owner(history, overrides = {}) {
  const back = createBrowserBack(history.port, {
    owner: 'fixture-owner',
    runtime: 'fixture-runtime',
    guardEligible: true,
    ...overrides,
  });
  back.start();
  return back;
}

describe('beta browser Back history owner', () => {
  it('dismisses only the top dialog through its existing close callback', () => {
    const history = browser();
    const back = owner(history);
    const parentClose = vi.fn();
    const removeParent = back.registerDialog(parentClose);
    const childClose = vi.fn(() => removeChild());
    const removeChild = back.registerDialog(childClose);
    history.back();
    expect(childClose).toHaveBeenCalledOnce();
    expect(parentClose).not.toHaveBeenCalled();
    expect(history.layers()).toHaveLength(1);
    removeParent();
    history.flush();
    expect(history.index()).toBe(1);
    expect(history.port.state().foreign).toEqual({ retained: true });
  });

  it('keeps refused and delayed closes protected without accumulating entries', () => {
    const history = browser();
    const back = owner(history);
    const close = vi.fn();
    const remove = back.registerDialog(close);
    for (let attempt = 0; attempt < 8; attempt += 1) history.back();
    expect(close).toHaveBeenCalledTimes(8);
    expect(history.entries).toHaveLength(3);
    expect(history.layers()).toHaveLength(1);
    remove();
    history.flush();
    expect(history.index()).toBe(1);
    history.back();
    expect(history.port.url()).toBe('https://beta.invalid/previous');
  });

  it('unwinds repeated control closes and a closing-to-opening handoff', () => {
    const history = browser();
    const back = owner(history);
    for (let cycle = 0; cycle < 8; cycle += 1) {
      const remove = back.registerDialog(vi.fn());
      remove();
      const removeNext = back.registerDialog(vi.fn());
      history.flush();
      expect(history.layers()).toHaveLength(1);
      removeNext();
      history.flush();
      expect(history.index()).toBe(1);
      expect(history.entries).toHaveLength(3);
    }
  });

  it('removes a hidden parent layer while retaining its visible child', () => {
    const history = browser();
    const back = owner(history);
    const removeParent = back.registerDialog(vi.fn());
    const closeChild = vi.fn();
    back.registerDialog(closeChild);
    removeParent();
    history.flush();
    expect(history.layers()).toHaveLength(1);
    history.back();
    expect(closeChild).toHaveBeenCalledOnce();
    expect(history.entries).toHaveLength(3);
  });

  it('consumes one drawing guard and never traps subsequent ink', () => {
    const history = browser();
    const back = owner(history);
    back.setDrawingInk(true);
    expect(history.layers()).toEqual(['guard']);
    history.back();
    expect(history.layers()).toEqual([]);
    back.setDrawingInk(false);
    back.setDrawingInk(true);
    expect(history.layers()).toEqual([]);
    history.back();
    expect(history.port.url()).toBe('https://beta.invalid/previous');
  });

  it('can arm again after a clear removes an unconsumed guard', () => {
    const history = browser();
    const back = owner(history);
    back.setDrawingInk(true);
    back.setDrawingInk(false);
    history.flush();
    expect(history.layers()).toEqual([]);
    back.setDrawingInk(true);
    expect(history.layers()).toEqual(['guard']);
    expect(history.entries).toHaveLength(3);
  });

  it('keeps dialog dismissal ahead of consuming the drawing guard', () => {
    const history = browser();
    const back = owner(history);
    back.setDrawingInk(true);
    const remove = back.registerDialog(() => remove());
    history.back();
    expect(history.layers()).toEqual(['guard']);
    history.back();
    expect(history.layers()).toEqual([]);
  });

  it('gives fine-pointer tabs dialog layers without drawing protection', () => {
    const history = browser();
    const back = owner(history, { guardEligible: false });
    back.setDrawingInk(true);
    expect(history.layers()).toEqual([]);
    const remove = back.registerDialog(vi.fn());
    expect(history.layers()).toHaveLength(1);
    remove();
    history.flush();
    history.back();
    expect(history.port.url()).toBe('https://beta.invalid/previous');
  });

  it('recovers refreshed layers before arming and never grows repeated reload history', () => {
    const history = browser();
    for (let reload = 0; reload < 5; reload += 1) {
      const back = owner(history, { owner: `owner-${reload}`, runtime: `runtime-${reload}` });
      back.setDrawingInk(true);
      back.registerDialog(vi.fn());
      history.flush();
      expect(history.layers()).toHaveLength(2);
      expect(history.entries).toHaveLength(4);
      history.reload();
    }
  });

  it('retains a consumed guard across same-runtime owner replacement', () => {
    const history = browser();
    const first = owner(history);
    first.setDrawingInk(true);
    history.back();
    first.stop();
    const next = owner(history, { owner: 'replacement' });
    next.setDrawingInk(true);
    expect(history.layers()).toEqual([]);
  });

  it('cleans unmount layers and tolerates immediate same-owner restart', () => {
    const history = browser();
    const back = owner(history);
    back.setDrawingInk(true);
    back.stop();
    back.start();
    history.flush();
    expect(history.layers()).toEqual(['guard']);
    expect(history.listenerCount()).toBe(1);
    back.stop();
    history.flush();
    expect(history.index()).toBe(1);
    expect(history.listenerCount()).toBe(0);
  });

  it('resumes its retained Settings layer without truncating an internal page from Forward history', () => {
    const history = browser();
    const back = owner(history);
    const close = vi.fn();
    back.registerDialog(close);
    history.navigate('https://beta.invalid/privacy');
    back.stop();
    history.back();
    const traversals = history.port.back.mock.calls.length;
    back.start();
    history.flush();
    expect(history.port.back).toHaveBeenCalledTimes(traversals);
    expect(close).not.toHaveBeenCalled();
    expect(history.layers()).toHaveLength(1);
    expect(history.entries.at(-1).url).toBe('https://beta.invalid/privacy');
  });

  it('ignores stale pop events and never undoes an unrelated route on cleanup', () => {
    const history = browser();
    const back = owner(history);
    const close = vi.fn();
    const remove = back.registerDialog(close);
    history.stalePop();
    expect(close).not.toHaveBeenCalled();
    const before = history.port.back.mock.calls.length;
    history.navigate('https://beta.invalid/privacy');
    remove();
    back.stop();
    expect(history.port.back).toHaveBeenCalledTimes(before);
    expect(history.port.url()).toBe('https://beta.invalid/privacy');
  });

  it('lets a replacement owner inherit an in-flight unmount unwind without double Back', () => {
    const history = browser();
    const first = owner(history);
    first.setDrawingInk(true);
    first.registerDialog(vi.fn());
    first.stop();
    const replacement = owner(history, { owner: 'replacement' });
    replacement.setDrawingInk(true);
    history.stalePop();
    history.flush();
    expect(history.port.url()).toBe('https://beta.invalid/');
    expect(history.layers()).toEqual(['guard']);
    expect(history.listenerCount()).toBe(1);
  });

  it('rejects malformed or other-URL markers without traversing foreign history', () => {
    const history = browser();
    history.port.replace({
      foreign: 'retained',
      [BROWSER_BACK_STATE_KEY]: {
        version: 1,
        owner: 'old',
        runtime: 'old',
        url: 'https://beta.invalid/other',
        spent: false,
        layers: ['guard', 'dialog:1'],
      },
    });
    owner(history);
    expect(history.port.back).not.toHaveBeenCalled();
    expect(history.port.state().foreign).toBe('retained');
    expect(history.layers()).toEqual([]);
  });

  // An update applied at the hidden edge reloads a blank page (Refs #3027, WEB-1
  // sw-update-lifecycle). The reloaded document claims the base entry with one in-place write;
  // anything more would be a real extra navigation rather than a history-state stamp.
  it('claims a reloaded blank page with one in-place write and no added or traversed entry', () => {
    const history = browser();
    owner(history, { owner: 'before-reload', runtime: 'first-document' });
    history.reload();
    const replace = vi.spyOn(history.port, 'replace');
    const push = vi.spyOn(history.port, 'push');
    owner(history, { owner: 'after-reload', runtime: 'reloaded-document' });
    expect(replace).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
    expect(history.port.back).not.toHaveBeenCalled();
    expect(history.entries).toHaveLength(2);
    expect(history.index()).toBe(1);
    expect(history.port.state()[BROWSER_BACK_STATE_KEY]).toMatchObject({
      owner: 'after-reload',
      layers: [],
    });
  });
});
