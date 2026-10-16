import { drawingPaper, paperBounds, samePaper, type PaperSize } from './paperSpace';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Image, Rect, type Svg } from '../platform/svg';
import { CaptureSvg } from './CaptureSvg';
import type { PngCaptureRequest } from './interactions';
import type { InkPlan } from './checkpoints';
import { PageOutline, usePageOutlineReady } from './PageOutline';
import { FixedInkCapture } from './FixedInkCapture';
import { createSvgCapture, PNG_TIMEOUT_MS } from './svgCapture';
import { PAPER_THEMES } from './theme';
import { InkPaperScope } from './InkPaper';
import { InkAppearanceScope, type InkAppearance } from './InkAppearance';
import { DecodedPng } from './DecodedPng';
import {
  pictureExport,
  boundedRasterSize,
  paperRasterBounds,
  paperRasterSize,
  type PictureExport,
} from './pictureExport';

type PictureKind = 'ink' | 'picture' | 'ai' | 'export';
export type PictureRequest = Readonly<{
  id: number;
  request: PngCaptureRequest;
  kind: PictureKind;
  plan: InkPlan;
  appearance: InkAppearance;
  pixelRatio: number;
  isCurrent: () => boolean;
}>;

// The pixel grid the capture rasterizes, and the saved picture it composes into, if any.
type CaptureTarget = Readonly<{ raster: PaperSize; exported: PictureExport | null }>;

// react-native-svg on iOS draws the view box into the view's laid-out bounds at the screen scale,
// whatever size is requested (RNSVGSvgView drawRect). Its integer CSS layout stays within the
// sampling budget at that actual scale; Android and web rasterize exactly the requested pixels.
function captureTarget(packet: PictureRequest): CaptureTarget {
  const ios = Platform.OS === 'ios';
  const size = paperRasterSize(
    packet.plan.projection,
    ios ? 1 : packet.pixelRatio,
    ios ? packet.pixelRatio : 1
  );
  if (packet.kind === 'ink' || packet.kind === 'picture') return { raster: size, exported: null };
  const exported = pictureExport(
    packet.plan.paper,
    packet.appearance.theme,
    packet.pixelRatio,
    packet.plan.projection.extent
  );
  return { raster: ios ? size : boundedRasterSize(exported.size), exported };
}

function composeExport(
  layer: string,
  exported: PictureExport | null,
  includePaperTexture: boolean
): Promise<string> {
  if (!exported) return Promise.resolve(layer);
  return import('./pictureCompose').then(({ composePicture }) =>
    composePicture(layer, exported, includePaperTexture)
  );
}

export function PictureCapture({ packet }: { packet: PictureRequest }) {
  const ink = useRef<Svg>(null);
  const output = useRef<Svg>(null);
  const [ready, setReady] = useState(false);
  const [base64, setBase64] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const outlineReady = usePageOutlineReady(packet.request.drawing.pageId);
  const captures = useRef(createSvgCapture()).current;
  const current = useRef(true);
  const request = packet.request;
  const size = paperBounds(packet.plan.projection);
  const [target] = useState(() => captureTarget(packet));
  const raster = target.raster;
  if (!samePaper(packet.plan.paper, drawingPaper(request.drawing)))
    throw new Error('The captured paper reference does not match the picture.');

  // DrawingSurface keys this component by packet id, so the packet and its request, and with them
  // these callbacks, stay the same for the component's whole life: listing them in the capture
  // effects never restarts a capture.
  const fail = useCallback(
    (error: unknown) =>
      request.cancel(error instanceof Error ? error.message : 'PNG capture failed.'),
    [request]
  );
  const accept = useCallback(
    (pixels: string, kind: PictureRequest['kind']) => {
      if (!current.current || !packet.isCurrent()) {
        request.cancel('The picture changed before capture finished.');
        return;
      }
      if (kind === 'ink' && packet.kind !== 'ink') setBase64(pixels);
      else request.complete(pixels, target.exported?.size ?? target.raster);
    },
    [packet, request, target]
  );
  function loaded() {
    if (current.current && packet.isCurrent()) setImageLoaded(true);
  }

  useEffect(() => {
    if (!ready || base64) return;
    if (!packet.isCurrent()) {
      fail(new Error('The picture changed before capture finished.'));
      return;
    }
    const job = captures.capture(ink.current, target.raster);
    void job.promise.then((pixels) => accept(pixels, 'ink')).catch(fail);
    return () => job.cancel();
  }, [ready, base64, captures, packet, target.raster, accept, fail]);

  useEffect(() => {
    if (!imageLoaded || !outlineReady) return;
    if (!packet.isCurrent()) {
      fail(new Error('The picture changed before capture finished.'));
      return;
    }
    const job = captures.capture(output.current, target.raster);
    void job.promise
      .then((pixels) => composeExport(pixels, target.exported, packet.kind === 'export'))
      .then((pixels) => accept(pixels, 'picture'))
      .catch(fail);
    return () => job.cancel();
  }, [imageLoaded, outlineReady, captures, packet, target, accept, fail]);

  useEffect(() => {
    const timeout = setTimeout(
      () => fail(new Error('Picture capture did not finish. Your drawing is still here.')),
      PNG_TIMEOUT_MS
    );
    return () => {
      current.current = false;
      clearTimeout(timeout);
      captures.dispose();
      request.cancel('Picture capture was cancelled.');
    };
  }, [captures, request, fail]);

  return (
    <InkPaperScope.Provider value={packet.plan.projection}>
      <InkAppearanceScope.Provider value={packet.appearance}>
        <View
          style={[
            styles.capture,
            { width: raster.width, height: raster.height, left: -raster.width * 2 },
          ]}
          pointerEvents="none"
        >
          {base64 ? (
            <DecodedPng base64={base64} size={target.raster} onLoad={loaded} onError={fail} />
          ) : null}
          {!base64 ? (
            <FixedInkCapture
              plan={packet.plan}
              raster={raster}
              svgRef={ink}
              onReady={() => setReady(true)}
              onError={fail}
            />
          ) : (
            <CaptureSvg
              ref={output}
              width={raster.width}
              height={raster.height}
              viewBox={`${size.x} ${size.y} ${size.width} ${size.height}`}
              preserveAspectRatio="xMidYMid meet"
            >
              {target.exported ? null : (
                <Rect
                  x={size.x}
                  y={size.y}
                  width={size.width}
                  height={size.height}
                  fill={PAPER_THEMES[packet.appearance.theme].paper}
                />
              )}
              <Image
                href={`data:image/png;base64,${base64}`}
                {...paperRasterBounds(packet.plan.projection, raster)}
                preserveAspectRatio="none"
                onLoad={() => {
                  if (Platform.OS !== 'android') loaded();
                }}
              />
              <PageOutline pageId={request.drawing.pageId} size={size} />
            </CaptureSvg>
          )}
        </View>
      </InkAppearanceScope.Provider>
    </InkPaperScope.Provider>
  );
}

const styles = StyleSheet.create({
  capture: { position: 'absolute', top: 0 },
});
