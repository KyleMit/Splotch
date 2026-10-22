import { describe, expect, it, vi } from 'vitest';
import {
  createBrushPreferences,
  brushControl,
  availableBrushes,
  parseBrushPreferences,
} from '../../src/settings/brushPreferences.ts';

function brushFixture(stored = null) {
  let saved = stored;
  const states = [];
  const storage = {
    read: vi.fn(async () => saved),
    write: vi.fn(async (snapshot) => {
      saved = snapshot;
    }),
  };
  const owner = createBrushPreferences(storage, (state) => states.push(state));
  return { owner, storage, states, saved: () => saved };
}
describe('ADR-0067 brush preference owner', () => {
  it.each(Array.from({ length: 8 }, (_, mask) => mask))(
    'adapts the enabled optional set %s',
    (mask) => {
      const availability = { crayon: !!(mask & 1), magic: !!(mask & 2), eraser: !!(mask & 4) };
      const enabled = ['crayon', 'magic', 'eraser'].filter((brush) => availability[brush]);
      expect(availableBrushes(availability)).toEqual(['pen', ...enabled]);
      expect(brushControl(availability)).toEqual(
        enabled.length === 0
          ? { kind: 'none' }
          : enabled.length === 1
            ? { kind: 'toggle', brush: enabled[0] }
            : { kind: 'menu', brushes: ['pen', ...enabled] }
      );
    }
  );
  it('persists ink selection while Eraser leaves it intact and never restores as Eraser', async () => {
    const fixture = brushFixture();
    await fixture.owner.load();
    expect(fixture.owner.getState().brush).toBe('pen');
    fixture.owner.selectBrush('crayon');
    await fixture.owner.retrySave();
    const saved = fixture.saved();
    const calls = fixture.storage.write.mock.calls.length;
    fixture.owner.selectBrush('eraser');
    expect(fixture.owner.getState().brush).toBe('eraser');
    expect(fixture.storage.write).toHaveBeenCalledTimes(calls);
    const reopened = brushFixture(saved);
    await reopened.owner.load();
    expect(reopened.owner.getState().brush).toBe('crayon');
    expect(() =>
      parseBrushPreferences(saved.replace('"brush":"crayon"', '"brush":"eraser"'))
    ).toThrow();
  });
  it('resumes last ink on a color pick and Eraser Clear while Magic survives Clear', async () => {
    const { owner } = brushFixture();
    await owner.load();
    owner.selectBrush('crayon');
    owner.selectBrush('eraser');
    owner.selectInkBrush();
    expect(owner.getState().brush).toBe('crayon');
    owner.selectBrush('eraser');
    owner.resetAfterClear();
    expect(owner.getState().brush).toBe('crayon');
    owner.selectBrush('magic');
    owner.resetAfterClear();
    expect(owner.getState().brush).toBe('magic');
    owner.selectInkBrush();
    expect(owner.getState().brush).toBe('crayon');
  });
  it('resets hidden Crayon memory and immediately falls back from a disabled active optional', async () => {
    const { owner } = brushFixture();
    await owner.load();
    owner.selectBrush('crayon');
    owner.selectBrush('eraser');
    owner.setAvailable('crayon', false);
    owner.selectInkBrush();
    expect(owner.getState().brush).toBe('pen');
    owner.selectBrush('crayon');
    expect(owner.getState().brush).toBe('pen');
    owner.selectBrush('magic');
    owner.setAvailable('magic', false);
    expect(owner.getState().brush).toBe('pen');
    await owner.retrySave();
  });
  it('makes the single optional button a toggle while menu selection remains idempotent', async () => {
    const { owner } = brushFixture();
    await owner.load();
    owner.setAvailable('magic', false);
    owner.setAvailable('eraser', false);
    owner.toggleOptional();
    expect(owner.getState().brush).toBe('crayon');
    owner.toggleOptional();
    expect(owner.getState().brush).toBe('pen');
    owner.selectBrush('crayon');
    owner.selectBrush('crayon');
    expect(owner.getState().brush).toBe('crayon');
    owner.setAvailable('crayon', false);
    expect(owner.getState().brush).toBe('pen');
  });
  it('serializes writes and retains a failed latest choice for explicit retry', async () => {
    const fixture = brushFixture();
    await fixture.owner.load();
    fixture.storage.write.mockRejectedValueOnce(new Error('disk full'));
    fixture.owner.selectBrush('crayon');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(fixture.owner.getState().saved).toBe(false);
    await fixture.owner.retrySave();
    expect(fixture.owner.getState().saved).toBe(true);
    expect(JSON.parse(fixture.saved()).brush).toBe('crayon');
    fixture.owner.selectBrush('magic');
    fixture.owner.selectBrush('pen');
    await fixture.owner.retrySave();
    expect(JSON.parse(fixture.saved()).brush).toBe('pen');
  });
  it('coalesces rapid choices behind one active write and saves the latest snapshot', async () => {
    let finish;
    const snapshots = [];
    const storage = {
      read: async () => null,
      write: vi.fn(async (snapshot) => {
        snapshots.push(snapshot);
        if (snapshots.length === 1)
          await new Promise((resolve) => {
            finish = resolve;
          });
      }),
    };
    const owner = createBrushPreferences(storage, () => {});
    await owner.load();
    owner.selectBrush('crayon');
    await Promise.resolve();
    for (let i = 0; i < 20; i++) owner.selectBrush(i % 2 ? 'pen' : 'magic');
    const drained = owner.retrySave();
    expect(storage.write).toHaveBeenCalledTimes(1);
    finish();
    await drained;
    expect(storage.write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(snapshots.at(-1)).brush).toBe('pen');
    expect(owner.getState()).toMatchObject({ brush: 'pen', saved: true });
  });
  it('rejects malformed settings and does not publish a late load after disposal', async () => {
    expect(() =>
      parseBrushPreferences(
        '{"version":1,"brush":"marker","availability":{"crayon":true,"magic":true,"eraser":true}}'
      )
    ).toThrow();
    expect(() =>
      parseBrushPreferences(
        '{"version":1,"brush":"pen","availability":{"crayon":1,"magic":true,"eraser":true}}'
      )
    ).toThrow();
    let resolve;
    const states = [];
    const owner = createBrushPreferences(
      {
        read: () =>
          new Promise((done) => {
            resolve = done;
          }),
        write: async () => {},
      },
      (state) => states.push(state)
    );
    const loading = owner.load();
    owner.dispose();
    resolve(null);
    await loading;
    expect(states).toEqual([]);
  });
});
