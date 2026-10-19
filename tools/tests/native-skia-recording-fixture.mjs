import { Component } from 'react';
import { createRequire } from 'node:module';

// A Skia that records instead of rasterizing, for tests of what the ink view hands over rather
// than of its pixels (CanvasKit tests own those: native-incremental-ink.test.mjs). Every call on a
// canvas, paint or path builder is kept and returns the recorder, so chained calls work; a
// snapshot is an `ink` image.
export function recorder() {
  const calls = [];
  const target = new Proxy(
    { calls },
    {
      get: (_record, name) =>
        name === 'calls'
          ? calls
          : name === 'then'
            ? undefined
            : (...args) => {
                calls.push([name, ...args]);
                return target;
              },
    }
  );
  return target;
}

function image(width, height) {
  return {
    kind: 'ink',
    width: () => width,
    height: () => height,
    dispose() {},
    encodeToBase64: () => 'committed ink',
  };
}

// The module @shopify/react-native-skia exports, with Skia's real enums. `nativeId` numbers each
// SkiaPictureView and `redraw` receives the id of one asked to redraw.
export function recordingSkiaModule({
  onSurface = () => {},
  nativeId = () => 1,
  redraw = () => {},
}) {
  const types = createRequire(import.meta.url)(
    '@shopify/react-native-skia/lib/commonjs/skia/types'
  );
  class SkiaPictureView extends Component {
    nativeId = nativeId();
    redraw() {
      redraw(this.nativeId);
    }
    render() {
      return null;
    }
  }
  return {
    ...types,
    Skia: {
      XYWHRect: (x, y, width, height) => ({ x, y, width, height }),
      Color: (color) => color,
      Paint: recorder,
      Matrix: recorder,
      PathBuilder: { Make: recorder },
      Shader: { MakeLinearGradient: recorder },
      PictureRecorder: () => {
        const canvas = recorder();
        return {
          beginRecording: () => canvas,
          finishRecordingAsPicture: () => ({ calls: canvas.calls, dispose() {} }),
        };
      },
      Surface: {
        Make: (width, height) => {
          onSurface();
          const canvas = recorder();
          return {
            getCanvas: () => canvas,
            flush: () => {},
            dispose() {},
            makeImageSnapshot: (rect) => image(rect?.width ?? width, rect?.height ?? height),
          };
        },
      },
    },
    SkiaPictureView,
  };
}
