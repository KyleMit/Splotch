import { promiseWithResolvers } from '../promiseWithResolvers';

export const CANVAS_CONTEXT_RECOVERY_ERROR_CODE = 'canvas-context-recovery-failed';
export type CanvasContextRecoveryErrorCode = typeof CANVAS_CONTEXT_RECOVERY_ERROR_CODE;

const CANVAS_CONTEXT_RESTORE_TIMEOUT_MS = 1_000;
const MAX_CANVAS_CONTEXT_RETRIES = 1;

export interface RecoverableCanvas2dSurface {
  canvas: OffscreenCanvas;
  context: OffscreenCanvasRenderingContext2D;
}

export class CanvasContextRecoveryError extends Error {
  readonly code = CANVAS_CONTEXT_RECOVERY_ERROR_CODE;

  constructor() {
    super('Canvas 2D context recovery failed after one retry');
    this.name = 'CanvasContextRecoveryError';
  }
}

export function createOffscreenCanvas2dSurface(
  width: number,
  height: number,
  allocationErrorMessage: string
): RecoverableCanvas2dSurface {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error(allocationErrorMessage);
  return { canvas, context };
}

interface ContextAttemptComplete<T> {
  kind: 'complete';
  value: T;
}

interface ContextAttemptLost {
  kind: 'lost';
  restored: boolean;
}

type ContextAttempt<T> = ContextAttemptComplete<T> | ContextAttemptLost;

function isContextLost(context: OffscreenCanvasRenderingContext2D) {
  if (typeof context.isContextLost !== 'function') return false;
  try {
    return context.isContextLost();
  } catch {
    return false;
  }
}

function monitorContextLoss(surface: RecoverableCanvas2dSurface) {
  let lostByEvent = false;
  const { promise: lost, resolve: resolveLost } = promiseWithResolvers<void>();
  const { promise: restored, resolve: resolveRestored } = promiseWithResolvers<void>();
  const onContextLost = () => {
    lostByEvent = true;
    resolveLost();
  };
  const onContextRestored = () => {
    lostByEvent = false;
    resolveRestored();
  };

  surface.canvas.addEventListener('contextlost', onContextLost);
  surface.canvas.addEventListener('contextrestored', onContextRestored);

  return {
    lost,
    isLost: () => lostByEvent || isContextLost(surface.context),
    async waitForRestoration(timeoutMs: number) {
      if (!lostByEvent) return false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<false>((resolve) => {
        timeoutId = setTimeout(() => resolve(false), timeoutMs);
      });
      const didRestore = await Promise.race([restored.then(() => true as const), timedOut]);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      return didRestore && !isContextLost(surface.context);
    },
    dispose() {
      surface.canvas.removeEventListener('contextlost', onContextLost);
      surface.canvas.removeEventListener('contextrestored', onContextRestored);
    },
  };
}

async function runContextAttempt<T>(
  surface: RecoverableCanvas2dSurface,
  operation: (surface: RecoverableCanvas2dSurface) => Promise<T> | T,
  discardResult: ((value: T) => void) | undefined,
  waitForRestoration: boolean
): Promise<ContextAttempt<T>> {
  const monitor = monitorContextLoss(surface);
  try {
    if (monitor.isLost()) return { kind: 'lost', restored: false };

    const operationPromise = Promise.resolve().then(() => operation(surface));
    const outcome = await Promise.race<ContextAttemptComplete<T> | ContextAttemptLost>([
      operationPromise.then((value) => ({ kind: 'complete' as const, value })),
      monitor.lost.then(() => ({ kind: 'lost' as const, restored: false })),
    ]);

    if (outcome.kind === 'complete' && !monitor.isLost()) return outcome;

    if (outcome.kind === 'complete') {
      discardResult?.(outcome.value);
    } else {
      void operationPromise.then(discardResult, () => undefined);
    }

    return {
      kind: 'lost',
      restored: waitForRestoration
        ? await monitor.waitForRestoration(CANVAS_CONTEXT_RESTORE_TIMEOUT_MS)
        : false,
    };
  } finally {
    monitor.dispose();
  }
}

export async function runWithCanvasContextRecovery<T>(
  createSurface: () => RecoverableCanvas2dSurface,
  operation: (surface: RecoverableCanvas2dSurface) => Promise<T> | T,
  discardResult?: (value: T) => void
): Promise<T> {
  let surface = createSurface();
  for (let retryCount = 0; retryCount <= MAX_CANVAS_CONTEXT_RETRIES; retryCount++) {
    const canRetry = retryCount < MAX_CANVAS_CONTEXT_RETRIES;
    const outcome = await runContextAttempt(surface, operation, discardResult, canRetry);
    if (outcome.kind === 'complete') return outcome.value;
    if (!canRetry) throw new CanvasContextRecoveryError();
    if (!outcome.restored) {
      try {
        surface = createSurface();
      } catch {
        throw new CanvasContextRecoveryError();
      }
    }
  }
  throw new CanvasContextRecoveryError();
}
