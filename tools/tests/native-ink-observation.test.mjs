import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createInkObservationController } from '../../experiments/native-architecture/src/drawing/inkObservation.ts';

function fixture() {
  const dispose = vi.fn();
  let current = true;
  const context = { grid: { width: 2, height: 2 }, current: () => current, dispose };
  const decode = vi.fn(async () => true);
  const controller = createInkObservationController(() => context, decode);
  return {
    context,
    decode,
    dispose,
    controller,
    change: () => {
      current = false;
    },
  };
}
describe('owned ink observation request', () => {
  it('binds the exact prepared grid and current callback into the consumed decoder', async () => {
    const f = fixture(),
      request = f.controller.begin(() => true);
    await expect(request.observe('actual-png')).resolves.toBe(true);
    expect(f.decode).toHaveBeenCalledWith('actual-png', f.context.grid, expect.any(Function));
    expect(f.dispose).toHaveBeenCalledOnce();
  });
  it('abandons only pre-decode leases and refuses their late use', async () => {
    const f = fixture(),
      request = f.controller.begin(() => true);
    request.cancel();
    await expect(request.observe('late')).rejects.toThrow('changed');
    expect(f.decode).not.toHaveBeenCalled();
    expect(f.dispose).toHaveBeenCalledOnce();
    expect(f.controller.begin(() => true)).toBeDefined();
  });
  it('retains an underlying decoder lease after cancellation until real finally', async () => {
    const f = fixture();
    let settle;
    f.decode.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        })
    );
    const request = f.controller.begin(() => true),
      pending = request.observe('png');
    const rejected = (async () => {
      await expect(pending).rejects.toThrow('changed');
    })();
    request.cancel();
    expect(() => f.controller.begin(() => true)).toThrow('not ready');
    expect(f.dispose).not.toHaveBeenCalled();
    settle(true);
    await rejected;
    expect(f.dispose).toHaveBeenCalledOnce();
    expect(f.controller.begin(() => true)).toBeDefined();
  });
  it('refuses stale context, history and disposed-owner completion', async () => {
    const f = fixture(),
      request = f.controller.begin(() => true);
    f.change();
    await expect(request.observe('png')).rejects.toThrow('changed');
    expect(f.decode).not.toHaveBeenCalled();
    expect(() => f.controller.begin(() => false)).toThrow();
    f.controller.dispose();
    expect(() => f.controller.begin(() => true)).toThrow();
  });
  it('preserves failures without converting them into visual empty', async () => {
    const f = fixture();
    f.decode.mockRejectedValue(new Error('corrupt tail'));
    await expect(f.controller.begin(() => true).observe('png')).rejects.toThrow('corrupt tail');
    expect(f.dispose).toHaveBeenCalledOnce();
  });
  it('wires actual Clear preparation before capture and guards history/owner before commit', () => {
    const caller = readFileSync(
      new URL('../../experiments/native-architecture/src/useDrawingScreen.ts', import.meta.url),
      'utf8'
    );
    expect(caller.indexOf('observations.current?.begin(isCurrent)')).toBeLessThan(
      caller.indexOf('await owner?.captureInk')
    );
    expect(caller).toContain('historyRef.current === snapshot');
    expect(caller).toContain('surface.current === owner');
    expect(caller).toMatch(/mounted\.current\s*&&\s*command\.current\s*&&\s*!blocked\(\)/);
    expect(caller.indexOf('if (!isCurrent())')).toBeLessThan(
      caller.indexOf('setHistory(clearDrawing(snapshot, empty))')
    );
    expect(caller).toContain('observation?.cancel()');
    const surface = readFileSync(
      new URL(
        '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx',
        import.meta.url
      ),
      'utf8'
    );
    expect(surface).toMatch(/useImperativeHandle\([\s\S]*?captureInk:[\s\S]*?\[\]\s*\)/);
  });
});
