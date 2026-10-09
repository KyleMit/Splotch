import type Svg from 'react-native-svg';
import { PAPER_WIDTH, PAPER_HEIGHT } from './model';

export const PNG_TIMEOUT_MS = 10_000;
export type SvgCaptureJob = Readonly<{ promise: Promise<string>; cancel: () => void }>;
type CaptureRequest = {
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout> | null;
  frame: number;
};

export function createSvgCapture() {
  let active: CaptureRequest | null = null;
  let failed = false;
  let disposed = false;

  function cancel(request: CaptureRequest, message: string) {
    if (active !== request) return;
    active = null;
    if (request.timeout) clearTimeout(request.timeout);
    cancelAnimationFrame(request.frame);
    request.reject(new Error(message));
  }

  function capture(svg: Svg | null): SvgCaptureJob {
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
    const request: CaptureRequest = { reject() {}, timeout: null, frame: 0 };
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
          if (active !== request) return;
          try {
            svg.toDataURL(
              (base64) => {
                if (active !== request) return;
                if (!base64) {
                  failed = true;
                  cancel(request, 'PNG capture returned no picture.');
                  return;
                }
                active = null;
                if (request.timeout) clearTimeout(request.timeout);
                resolve(base64);
              },
              { width: PAPER_WIDTH, height: PAPER_HEIGHT }
            );
          } catch {
            failed = true;
            cancel(request, 'PNG capture failed. Your picture is still here.');
          }
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
