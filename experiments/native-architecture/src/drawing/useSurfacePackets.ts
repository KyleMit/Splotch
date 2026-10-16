import { watchCaptureScreen } from './captureScreen';
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { PixelRatio } from 'react-native';
import { samePaperProjection, type PaperProjection } from './paperSpace';
import type { Drawing } from './model';
import type { InkAppearance } from './InkAppearance';
import type { PictureRequest } from './PictureCapture';
import type { RasterInkHandle } from './RasterInk';
import type { InkPlan } from './checkpoints';
import { createPngCapture, type PngCaptureRequest } from './interactions';
import { PNG_TIMEOUT_MS } from './svgCapture';

const CAPTURE_CHANGED_MESSAGE = 'The picture changed before capture finished.';

type PendingPacket = {
  request: PngCaptureRequest;
  lease: object;
  kind: PictureRequest['kind'];
  appearance: InkAppearance;
  prepared: boolean;
  projection: PaperProjection;
  pixelRatio: number;
  screen: ReturnType<typeof watchCaptureScreen>;
};

type PacketOwner = {
  inputActive: () => boolean;
  currentDrawing: () => Drawing;
  drawing: Drawing;
  appearance: InkAppearance;
  projection: PaperProjection;
  commandLock: RefObject<object | null>;
  setPacket: (packet: PictureRequest | null) => void;
};

export function useSurfacePackets(owner: PacketOwner) {
  const latest = useRef(owner);
  latest.current = owner;
  const captures = useRef(createPngCapture()).current;
  const captureLock = useRef<PngCaptureRequest | null>(null);
  const pending = useRef<PendingPacket | null>(null);
  const raster = useRef<RasterInkHandle | null>(null);
  const nextId = useRef(1);
  const mounted = useRef(true);

  const matches = useCallback((packet: PendingPacket) => {
    const current = latest.current;
    return (
      mounted.current &&
      current.commandLock.current === packet.lease &&
      current.currentDrawing() === packet.request.drawing &&
      (!packet.prepared || current.drawing === packet.request.drawing) &&
      current.appearance === packet.appearance &&
      samePaperProjection(current.projection, packet.projection) &&
      packet.screen.current()
    );
  }, []);

  const isCurrent = useCallback(
    (packet: PendingPacket) => captureLock.current === packet.request && matches(packet),
    [matches]
  );

  const resume = useCallback(() => {
    const packet = pending.current;
    if (!packet) return;
    if (!isCurrent(packet)) {
      packet.request.cancel(CAPTURE_CHANGED_MESSAGE);
      return;
    }
    if (packet.prepared) return;
    if (latest.current.drawing !== packet.request.drawing || !raster.current?.isReady()) return;
    let plan: InkPlan;
    try {
      plan = raster.current.readyPlan(packet.request.drawing.strokes);
    } catch {
      return;
    }
    packet.prepared = true;
    latest.current.setPacket({
      request: packet.request,
      kind: packet.kind,
      appearance: packet.appearance,
      id: nextId.current++,
      plan: { ...plan, projection: packet.projection },
      pixelRatio: packet.pixelRatio,
      isCurrent: () => isCurrent(packet),
    });
  }, [isCurrent]);

  const attachRaster = useCallback(
    (handle: RasterInkHandle | null) => {
      raster.current = handle;
      if (handle) resume();
    },
    [resume]
  );

  const capture = useCallback(
    (snapshot: Drawing, kind: PictureRequest['kind']) => {
      const current = latest.current;
      if (current.inputActive()) throw new Error('Lift your finger before capturing the picture.');
      const lease = current.commandLock.current;
      if (!lease || current.currentDrawing() !== snapshot || !raster.current)
        throw new Error('The current drawing paper is not ready to capture.');
      const screen = watchCaptureScreen(() => request.cancel(CAPTURE_CHANGED_MESSAGE));
      const ownsPaper = () => matches(packet);
      const request = captures.begin(snapshot, ownsPaper);
      captureLock.current = request;
      const packet: PendingPacket = {
        request,
        lease,
        kind,
        appearance: current.appearance,
        prepared: false,
        projection: current.projection,
        pixelRatio: PixelRatio.get(),
        screen,
      };
      pending.current = packet;
      const timeout = setTimeout(
        () => request.cancel('Picture capture did not finish. Your drawing is still here.'),
        PNG_TIMEOUT_MS
      );
      resume();
      const promise = request.promise.finally(() => {
        screen.dispose();
        clearTimeout(timeout);
        if (captureLock.current !== request) return;
        captureLock.current = null;
        pending.current = null;
        if (mounted.current) latest.current.setPacket(null);
      });
      return { promise, isCurrent: ownsPaper };
    },
    [captures, resume, matches]
  );

  const cancel = useCallback((message = CAPTURE_CHANGED_MESSAGE) => {
    const request = captureLock.current;
    if (!request) return;
    pending.current?.screen.dispose();
    captureLock.current = null;
    pending.current = null;
    request.cancel(message);
    if (mounted.current) latest.current.setPacket(null);
  }, []);

  useLayoutEffect(resume);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel('Picture capture was cancelled.');
    };
  }, [cancel]);

  return { capture, captureLock, raster, attachRaster, resume, cancel };
}
