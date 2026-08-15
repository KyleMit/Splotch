import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_CONTEXT_RECOVERY_ERROR_CODE,
  CanvasContextRecoveryError,
  type RecoverableCanvas2dSurface,
  runWithCanvasContextRecovery,
} from './canvasContextRecovery';

class ControlledContext {
  lost = false;
  transform = 'default';

  isContextLost() {
    return this.lost;
  }
}

class ControlledCanvas extends EventTarget {
  oncontextlost: ((event: Event) => void) | null = null;
  oncontextrestored: ((event: Event) => void) | null = null;
}

function controlledSurface(): {
  canvas: ControlledCanvas;
  context: ControlledContext;
  surface: RecoverableCanvas2dSurface;
} {
  const canvas = new ControlledCanvas();
  const context = new ControlledContext();
  return {
    canvas,
    context,
    surface: {
      canvas: canvas as unknown as OffscreenCanvas,
      context: context as unknown as OffscreenCanvasRenderingContext2D,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('runWithCanvasContextRecovery', () => {
  it('recreates a surface when the context is already lost before dispatch', async () => {
    const first = controlledSurface();
    const second = controlledSurface();
    first.context.lost = true;
    const createSurface = vi
      .fn<() => RecoverableCanvas2dSurface>()
      .mockReturnValueOnce(first.surface)
      .mockReturnValueOnce(second.surface);
    const operation = vi.fn(() => 'encoded');

    await expect(runWithCanvasContextRecovery(createSurface, operation)).resolves.toBe('encoded');

    expect(createSurface).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledWith(second.surface);
  });

  it('waits for restoration and reapplies state before a successful retry', async () => {
    const controlled = controlledSurface();
    let firstAttemptResolve!: (value: string) => void;
    const operation = vi.fn(({ context }: RecoverableCanvas2dSurface) => {
      (context as unknown as ControlledContext).transform = 'painted';
      if (operation.mock.calls.length === 1) {
        return new Promise<string>((resolve) => {
          firstAttemptResolve = resolve;
        });
      }
      return Promise.resolve('encoded');
    });

    const encoded = runWithCanvasContextRecovery(() => controlled.surface, operation);
    await vi.waitFor(() => expect(operation).toHaveBeenCalledOnce());
    controlled.context.lost = true;
    controlled.canvas.dispatchEvent(new Event('contextlost'));
    controlled.context.transform = 'default';
    controlled.context.lost = false;
    controlled.canvas.dispatchEvent(new Event('contextrestored'));

    await expect(encoded).resolves.toBe('encoded');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(controlled.context.transform).toBe('painted');
    firstAttemptResolve('discarded');
  });

  it('isolates a loss between requests to the completed disposable surface', async () => {
    const first = controlledSurface();
    const second = controlledSurface();

    await expect(
      runWithCanvasContextRecovery(
        () => first.surface,
        () => 'first'
      )
    ).resolves.toBe('first');
    first.context.lost = true;
    first.canvas.dispatchEvent(new Event('contextlost'));

    await expect(
      runWithCanvasContextRecovery(
        () => second.surface,
        () => 'second'
      )
    ).resolves.toBe('second');
  });

  it('uses a fresh surface when restoration does not arrive', async () => {
    vi.useFakeTimers();
    const first = controlledSurface();
    const second = controlledSurface();
    const createSurface = vi
      .fn<() => RecoverableCanvas2dSurface>()
      .mockReturnValueOnce(first.surface)
      .mockReturnValueOnce(second.surface);
    const operation = vi
      .fn<(surface: RecoverableCanvas2dSurface) => Promise<string>>()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce('encoded');

    const encoded = runWithCanvasContextRecovery(createSurface, operation);
    await Promise.resolve();
    first.context.lost = true;
    first.canvas.dispatchEvent(new Event('contextlost'));
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(encoded).resolves.toBe('encoded');
    expect(createSurface).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenLastCalledWith(second.surface);
  });

  it('rejects with the stable error when a lost surface cannot be recreated', async () => {
    vi.useFakeTimers();
    const first = controlledSurface();
    const createSurface = vi
      .fn<() => RecoverableCanvas2dSurface>()
      .mockReturnValueOnce(first.surface)
      .mockImplementationOnce(() => {
        throw new Error('allocation failed');
      });
    const operation = vi.fn(() => new Promise<string>(() => undefined));

    const encoded = runWithCanvasContextRecovery(createSurface, operation);
    // Attach the expectation before the loss is dispatched: the rejection is otherwise
    // unhandled for a tick and reported as an error even though it is asserted.
    // eslint-disable-next-line vitest/valid-expect -- awaited below as `rejection`; the rule only sees the statement it is declared in
    const rejection = expect(encoded).rejects.toMatchObject({
      code: CANVAS_CONTEXT_RECOVERY_ERROR_CODE,
    });
    await Promise.resolve();
    first.context.lost = true;
    first.canvas.dispatchEvent(new Event('contextlost'));
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(createSurface).toHaveBeenCalledTimes(2);
  });

  it('rejects with a stable error after a repeated loss', async () => {
    const controlled = controlledSurface();
    const pendingAttempts: Array<() => void> = [];
    const operation = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          pendingAttempts.push(() => resolve('discarded'));
        })
    );

    const encoded = runWithCanvasContextRecovery(() => controlled.surface, operation);
    await vi.waitFor(() => expect(operation).toHaveBeenCalledOnce());
    controlled.context.lost = true;
    controlled.canvas.dispatchEvent(new Event('contextlost'));
    controlled.context.lost = false;
    controlled.canvas.dispatchEvent(new Event('contextrestored'));
    await vi.waitFor(() => expect(operation).toHaveBeenCalledTimes(2));
    controlled.context.lost = true;
    controlled.canvas.dispatchEvent(new Event('contextlost'));

    const error = await encoded.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CanvasContextRecoveryError);
    expect(error).toMatchObject({ code: CANVAS_CONTEXT_RECOVERY_ERROR_CODE });
    expect(String(error)).toBe(
      'CanvasContextRecoveryError: Canvas 2D context recovery failed after one retry'
    );
    for (const settle of pendingAttempts) settle();
  });

  it('does not retry an ordinary operation error', async () => {
    const controlled = controlledSurface();
    const operation = vi.fn(() => {
      throw new Error('encoding failed');
    });

    await expect(runWithCanvasContextRecovery(() => controlled.surface, operation)).rejects.toThrow(
      'encoding failed'
    );
    expect(operation).toHaveBeenCalledOnce();
  });
});
