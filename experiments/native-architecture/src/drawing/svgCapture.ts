import { PAPER_WIDTH, PAPER_HEIGHT } from './model';

export const PNG_TIMEOUT_MS = 10_000;
export type SvgCaptureJob = Readonly<{ promise: Promise<string>; cancel: () => void }>;
export type SvgCaptureTarget = {
  toDataURL: (callback: (base64: string) => void, options?: object) => void | (() => void);
};
type CaptureRequest = {
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout> | null;
  frame: number;
  release: (() => void) | null;
};

export function createSvgCapture() {
  let active: CaptureRequest | null = null;
  let failed = false;
  let disposed = false;

  function release(request: CaptureRequest) {
    if (request.timeout) clearTimeout(request.timeout);
    cancelAnimationFrame(request.frame);
    const dispose = request.release;
    request.release = null;
    try {
      dispose?.();
      return null;
    } catch {
      failed = true;
      return new Error('PNG capture cleanup failed. Your picture is still here.');
    }
  }

  function cancel(request: CaptureRequest, message: string) {
    if (active !== request) return;
    active = null;
    request.reject(release(request) ?? new Error(message));
  }

  function start(request: CaptureRequest, svg: SvgCaptureTarget, resolve: (value: string) => void) {
    let starting = true;
    let synchronous: string | undefined;
    function accept(base64: string) {
      if (active !== request) return;
      if (starting) {
        if (synchronous === undefined) synchronous = base64;
        return;
      }
      if (!base64) {
        failed = true;
        cancel(request, 'PNG capture returned no picture.');
        return;
      }
      active = null;
      const error = release(request);
      if (error) request.reject(error);
      else resolve(base64);
    }
    try {
      const dispose = svg.toDataURL(accept, { width: PAPER_WIDTH, height: PAPER_HEIGHT });
      if (typeof dispose === 'function') {
        if (active === request) request.release = dispose;
        else dispose();
      }
      starting = false;
      if (synchronous !== undefined) accept(synchronous);
    } catch {
      failed = true;
      cancel(request, 'PNG capture failed. Your picture is still here.');
    }
  }

  function capture(svg: SvgCaptureTarget | null): SvgCaptureJob {
    const unavailable = disposed || failed;
    if (unavailable || !svg || active)
      return {
        promise: Promise.reject(
          new Error(
            unavailable
              ? 'PNG capture is unavailable. Reopen the drawing screen to retry.'
              : 'The drawing paper is not ready to capture.'
          )
        ),
        cancel() {},
      };
    const request: CaptureRequest = { reject() {}, timeout: null, frame: 0, release: null };
    const promise = new Promise<string>((resolve, reject) => {
      request.reject = reject;
      active = request;
      request.timeout = setTimeout(() => {
        if (active !== request) return;
        failed = true;
        cancel(request, 'PNG capture did not finish. Your picture is still here.');
      }, PNG_TIMEOUT_MS);
      request.frame = requestAnimationFrame(() => {
        request.frame = requestAnimationFrame(() => {
          if (active === request) start(request, svg, resolve);
        });
      });
    });
    return { promise, cancel: () => cancel(request, 'PNG capture was superseded.') };
  }

  return {
    capture,
    dispose() {
      disposed = true;
      if (active) cancel(active, 'PNG capture was cancelled.');
    },
  };
}
