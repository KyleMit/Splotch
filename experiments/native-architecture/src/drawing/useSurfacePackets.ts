import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import type { Drawing } from './model';
import type { InkAppearance } from './InkAppearance';
import type { PictureRequest } from './PictureCapture';
import type { RasterInkHandle } from './RasterInk';
import type { InkPlan } from './checkpoints';
import { createPngCapture, type PngCaptureRequest } from './interactions';
import { PNG_TIMEOUT_MS } from './svgCapture';

type PendingPacket = {
  request: PngCaptureRequest;
  lease: object;
  kind: PictureRequest['kind'];
  appearance: InkAppearance;
  prepared: boolean;
};

type PacketOwner = {
  inputActive: () => boolean;
  currentDrawing: () => Drawing;
  drawing: Drawing;
  appearance: InkAppearance;
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

  const isCurrent = useCallback((packet: PendingPacket) => {
    const current = latest.current;
    return (
      captureLock.current === packet.request &&
      current.commandLock.current === packet.lease &&
      current.currentDrawing() === packet.request.drawing &&
      (!packet.prepared || current.drawing === packet.request.drawing) &&
      current.appearance === packet.appearance
    );
  }, []);

  const resume = useCallback(() => {
    const packet = pending.current;
    if (!packet) return;
    if (!isCurrent(packet)) {
      packet.request.cancel('The picture changed before capture finished.');
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
      plan,
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
    async (snapshot: Drawing, kind: PictureRequest['kind']) => {
      const current = latest.current;
      if (current.inputActive()) throw new Error('Lift your finger before capturing the picture.');
      const lease = current.commandLock.current;
      if (!lease || current.currentDrawing() !== snapshot || !raster.current)
        throw new Error('The current drawing paper is not ready to capture.');
      const request = captures.begin(snapshot);
      captureLock.current = request;
      pending.current = { request, lease, kind, appearance: current.appearance, prepared: false };
      const timeout = setTimeout(
        () => request.cancel('Picture capture did not finish. Your drawing is still here.'),
        PNG_TIMEOUT_MS
      );
      resume();
      return request.promise.finally(() => {
        clearTimeout(timeout);
        if (captureLock.current !== request) return;
        captureLock.current = null;
        pending.current = null;
        if (mounted.current) latest.current.setPacket(null);
      });
    },
    [captures, resume]
  );

  const cancel = useCallback(() => {
    const request = captureLock.current;
    if (!request) return;
    captureLock.current = null;
    pending.current = null;
    request.cancel('The picture changed before capture finished.');
    if (mounted.current) latest.current.setPacket(null);
  }, []);

  useLayoutEffect(resume);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
    };
  }, [cancel]);

  return { capture, captureLock, raster, attachRaster, resume, cancel };
}
