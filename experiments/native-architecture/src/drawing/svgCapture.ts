import type Svg from 'react-native-svg';
import { PAPER_WIDTH, PAPER_HEIGHT } from './model';

export const PNG_TIMEOUT_MS = 10_000;

export function createSvgCapture() {
  let active: {
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
    frame: number;
  } | null = null;
  let failed = false;
  let disposed = false;

  function cancel(message: string) {
    if (!active) return;
    const request = active;
    active = null;
    clearTimeout(request.timeout);
    cancelAnimationFrame(request.frame);
    request.reject(new Error(message));
  }

  return {
    capture(svg: Svg | null): Promise<string> {
      if (disposed || failed)
        return Promise.reject(
          new Error('PNG capture is unavailable. Reopen the drawing screen to retry.')
        );
      if (!svg || active)
        return Promise.reject(new Error('The drawing paper is not ready to capture.'));
      return new Promise<string>((resolve, reject) => {
        const request = {
          reject,
          timeout: setTimeout(() => {
            if (active !== request) return;
            failed = true;
            cancel('PNG capture did not finish. Your picture is still here.');
          }, PNG_TIMEOUT_MS),
          frame: 0,
        };
        active = request;
        request.frame = requestAnimationFrame(() => {
          request.frame = requestAnimationFrame(() => {
            if (active !== request) return;
            try {
              svg.toDataURL(
                (base64) => {
                  if (active !== request) return;
                  if (!base64) {
                    failed = true;
                    cancel('PNG capture returned no picture.');
                    return;
                  }
                  active = null;
                  clearTimeout(request.timeout);
                  resolve(base64);
                },
                { width: PAPER_WIDTH, height: PAPER_HEIGHT }
              );
            } catch {
              failed = true;
              cancel('PNG capture failed. Your picture is still here.');
            }
          });
        });
      });
    },
    dispose() {
      disposed = true;
      cancel('PNG capture was cancelled.');
    },
  };
}
