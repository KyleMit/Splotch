import {
  appendPoint,
  MAX_POINTS,
  type Drawing,
  type Point,
  type Stroke,
  type StrokeStyle,
} from './model';

export function createStrokeInput() {
  let current: { identifier: string; stroke: Stroke } | null = null;
  return {
    start(identifier: string, style: StrokeStyle, point: Point): Stroke {
      const stroke = { ...style, points: [point] };
      current = { identifier, stroke };
      return stroke;
    },
    sample(identifier: string, point: Point, endpoint = false): Stroke | null {
      if (!current || current.identifier !== identifier) return null;
      current = {
        ...current,
        stroke: { ...current.stroke, points: appendPoint(current.stroke.points, point, endpoint) },
      };
      return current.stroke;
    },
    finish(identifier?: string, point?: Point): Stroke | null {
      if (!current || (identifier !== undefined && identifier !== current.identifier)) return null;
      const stroke = current.stroke;
      current = null;
      return point && stroke.points.length < MAX_POINTS
        ? { ...stroke, points: appendPoint(stroke.points, point, true) }
        : stroke;
    },
    identifier(): string | undefined {
      return current?.identifier;
    },
  };
}

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
