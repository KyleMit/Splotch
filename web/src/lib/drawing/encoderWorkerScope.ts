import type { EncodePngResponse } from './pngEncoderProtocol';
import { createTiledPngPreview, type TiledLayers } from './tiledPngCompositor';

export interface EncoderWorkerScope<Request> {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: EncodePngResponse, transfer?: Transferable[]): void;
}

// The app type-checks against the DOM lib, which types `self` as Window; the webworker lib cannot
// join the same program, so the worker scope is declared here.
export function encoderWorkerScope<Request>(): EncoderWorkerScope<Request> {
  return self as unknown as EncoderWorkerScope<Request>;
}

export function postPreview(
  scope: Pick<EncoderWorkerScope<never>, 'postMessage'>,
  id: number,
  layers: TiledLayers,
  previewWidth: number
) {
  let preview: ImageBitmap | null = null;
  try {
    preview = createTiledPngPreview(layers, previewWidth);
    scope.postMessage({ id, preview }, [preview]);
    preview = null;
  } catch {
    // Preview feedback is optional; its failure must not cancel the PNG save.
    preview?.close();
  }
}
