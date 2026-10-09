import type { Drawing } from './model';

export type PngCaptureRequest = {
  drawing: Drawing;
  promise: Promise<string>;
  complete: (base64: string) => boolean;
  cancel: (message: string) => boolean;
};

export function createPngCapture() {
  let active: PngCaptureRequest | null = null;
  return {
    begin(drawing: Drawing): PngCaptureRequest {
      if (active) throw new Error('A picture is already being exported.');
      let resolve: (value: string) => void = () => {};
      let reject: (error: Error) => void = () => {};
      const promise = new Promise<string>((accept, refuse) => {
        resolve = accept;
        reject = refuse;
      });
      const request: PngCaptureRequest = {
        drawing,
        promise,
        complete(base64) {
          if (active !== request) return false;
          active = null;
          resolve(base64);
          return true;
        },
        cancel(message) {
          if (active !== request) return false;
          active = null;
          reject(new Error(message));
          return true;
        },
      };
      active = request;
      return request;
    },
  };
}
