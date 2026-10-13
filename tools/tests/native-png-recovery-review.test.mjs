// @vitest-environment happy-dom
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { createPngRecovery } from '../../experiments/native-architecture/src/export/pngRecovery.ts';
import {
  heldPngFilename,
  serializeHeldPngs,
  serializeHeldPngStorage,
} from '../../experiments/native-architecture/src/export/heldPng.ts';
import { PngRecoveryNotice } from '../../experiments/native-architecture/src/export/PngRecoveryNotice.tsx';
import { rgbaPng } from './native-png-fixtures.mjs';

vi.mock('react-native', () => ({
  View: ({ children, accessibilityLiveRegion }) =>
    createElement('div', { 'aria-live': accessibilityLiveRegion }, children),
  Text: ({ children, accessibilityLiveRegion }) =>
    createElement('span', { 'aria-live': accessibilityLiveRegion }, children),
  Pressable: ({ children, disabled, onPress, accessibilityLabel }) =>
    createElement(
      'button',
      { disabled, onClick: onPress, 'aria-label': accessibilityLabel },
      children
    ),
  StyleSheet: { create: (styles) => styles },
}));
const png = (width) => rgbaPng(width, 2, 255).toString('base64');
const picture = (width) => ({
  id: `png-${width}-a`,
  filename: heldPngFilename(`png-${width}-a`),
  base64: png(width),
});
function setup(snapshot, readFailure = false) {
  let stored = snapshot,
    state;
  const changes = vi.fn();
  const storage = serializeHeldPngStorage({
    read: vi.fn(async () => {
      if (readFailure) throw new Error('Transient');
      return stored;
    }),
    write: vi.fn(async (value) => {
      stored = value;
    }),
  });
  const deliver = vi.fn().mockRejectedValue(new Error('Sharing unavailable'));
  const owner = createPngRecovery(storage, deliver, (next) => {
    state = next;
    changes(next);
  });
  return {
    owner,
    storage,
    deliver,
    changes,
    state: () => state,
    stored: () => stored,
    readable: () => {
      readFailure = false;
    },
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

describe('original PNG review regressions', () => {
  it('dismisses only the selected record while an unrelated capture validates', async () => {
    const a = picture(2);
    const held = setup(serializeHeldPngs([a]));
    await held.owner.restore();
    const submission = held.owner.submit(png(3));
    const dismissal = held.owner.dismiss(a.id);
    await expect(submission).resolves.toBeUndefined();
    await dismissal;
    expect(held.state().pictures).toHaveLength(1);
    expect(held.deliver).toHaveBeenCalledOnce();
    expect(JSON.parse(held.stored()).pictures[0].base64).toBe(png(3));
  });
  it('exposes validation as busy and never overlaps retry with new delivery', async () => {
    const held = setup(serializeHeldPngs([picture(2)]));
    await held.owner.restore();
    const gate = deferred(),
      entered = deferred();
    let active = 0,
      maximum = 0;
    held.deliver.mockImplementation(async () => {
      active++;
      maximum = Math.max(maximum, active);
      entered.resolve();
      await gate.promise;
      active--;
      return 'sharing-closed';
    });
    const submission = held.owner.submit(png(3));
    const busyDuringValidation = held.state().busy;
    const retry = held.owner.retry();
    await entered.promise;
    gate.resolve();
    await Promise.all([submission, retry]);
    expect(busyDuringValidation).toBe(true);
    expect(maximum).toBe(1);
  });
  it('serializes two direct concurrent submissions until the first delivery settles', async () => {
    const held = setup(null);
    await held.owner.restore();
    const gate = deferred(),
      entered = deferred(),
      queued = deferred();
    let active = 0,
      maximum = 0;
    held.changes.mockImplementation((state) => {
      if (state.pictures.length === 2) queued.resolve();
    });
    held.deliver.mockImplementation(async (record) => {
      active++;
      maximum = Math.max(maximum, active);
      if (record.base64 === png(2)) {
        entered.resolve();
        await gate.promise;
      }
      active--;
      return 'sharing-closed';
    });
    const first = held.owner.submit(png(2));
    await entered.promise;
    const second = held.owner.submit(png(3));
    await queued.promise;
    await new Promise(setImmediate);
    const callsBeforeRelease = held.deliver.mock.calls.length;
    gate.resolve();
    await Promise.all([first, second]);
    expect(callsBeforeRelease).toBe(1);
    expect(maximum).toBe(1);
    expect(held.deliver.mock.calls.map(([record]) => record.base64)).toEqual([png(2), png(3)]);
  });

  it('dismisses a queued record without delivering it or cancelling its active peer', async () => {
    const held = setup(null);
    await held.owner.restore();
    const gate = deferred(),
      entered = deferred(),
      queued = deferred();
    held.changes.mockImplementation((state) => {
      if (state.pictures.length === 2) queued.resolve();
    });
    held.deliver.mockImplementation(async () => {
      entered.resolve();
      await gate.promise;
      return 'sharing-closed';
    });
    const first = held.owner.submit(png(2));
    await entered.promise;
    const second = held.owner.submit(png(3));
    await queued.promise;
    const queuedId = held.state().pictures[1].id;
    await held.owner.dismiss(queuedId);
    gate.resolve();
    await Promise.all([first, second]);
    expect(held.deliver).toHaveBeenCalledOnce();
    expect(held.state().pictures.map(({ attempt }) => attempt)).toEqual([
      { status: 'sharing-closed' },
    ]);
    expect(JSON.parse(held.stored()).pictures.map((record) => record.base64)).toEqual([png(2)]);
  });

  it('drops queued delivery and late public state after owner disposal', async () => {
    const held = setup(null);
    await held.owner.restore();
    const gate = deferred(),
      entered = deferred(),
      queued = deferred();
    held.changes.mockImplementation((state) => {
      if (state.pictures.length === 2) queued.resolve();
    });
    held.deliver.mockImplementation(async () => {
      entered.resolve();
      await gate.promise;
      return 'sharing-closed';
    });
    const first = held.owner.submit(png(2));
    await entered.promise;
    const second = held.owner.submit(png(3));
    await queued.promise;
    held.owner.dispose();
    const changesAtDispose = held.changes.mock.calls.length;
    gate.resolve();
    await Promise.all([first, second]);
    expect(held.deliver).toHaveBeenCalledOnce();
    expect(held.changes).toHaveBeenCalledTimes(changesAtDispose);
    expect(JSON.parse(held.stored()).pictures.map((record) => record.base64)).toEqual([png(2)]);
  });

  it('keeps valid durable and volatile records on capacity overflow and frees room per dismissal', async () => {
    const saved = [picture(2), picture(3), picture(4)];
    const archive = serializeHeldPngs(saved);
    const held = setup(archive, true);
    await held.owner.submit(png(5));
    held.readable();
    await held.owner.retry();
    expect(held.state().status).toBe('ready');
    expect(held.state().notice).toContain('PNG recovery is full');
    expect(held.state().pictures).toHaveLength(4);
    expect(held.state().pictures.filter((p) => p.durable)).toHaveLength(3);
    expect(held.stored()).toBe(archive);
    await held.owner.dismiss(saved[0].id);
    expect(JSON.parse(held.stored()).pictures.map((p) => p.base64)).toEqual([
      saved[1].base64,
      saved[2].base64,
      png(5),
    ]);
    expect(held.state().pictures.every((p) => p.durable)).toBe(true);
  });
  it('announces one outcome without making filenames and Dismiss controls a live region', async () => {
    const held = setup(null);
    await held.owner.submit(png(2));
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          createElement(PngRecoveryNotice, {
            state: held.state(),
            drawing: false,
            blocked: false,
            retry: vi.fn(),
            dismiss: vi.fn(),
          })
        )
      );
      expect(container.textContent.match(/Sharing unavailable/g)).toHaveLength(1);
      expect(
        [...container.querySelectorAll('[aria-live]')].every((node) => node.tagName === 'SPAN')
      ).toBe(true);
      expect(container.querySelector('button').closest('[aria-live]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
    }
  });
});
