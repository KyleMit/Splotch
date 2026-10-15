import { drawingPaper, paperSize, samePaper, type PaperSize } from './paperSpace';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio, Platform, StyleSheet, View } from 'react-native';
import { Image, Rect, type Svg } from '../platform/svg';
import { CaptureSvg } from './CaptureSvg';
import type { PngCaptureRequest } from './interactions';
import type { InkPlan } from './checkpoints';
import { PageOutline, usePageOutlineReady } from './PageOutline';
import { FixedInkCapture } from './FixedInkCapture';
import { createSvgCapture, PNG_TIMEOUT_MS } from './svgCapture';
import { PAPER_THEMES } from './theme';
import { InkAppearanceScope, type InkAppearance } from './InkAppearance';
import { DecodedPng } from './DecodedPng';
import { pictureExport, type PictureExport } from './pictureExport';

type PictureKind = 'ink' | 'picture' | 'ai' | 'export';
export type PictureRequest = Readonly<{
  id: number;
  request: PngCaptureRequest;
  kind: PictureKind;
  plan: InkPlan;
  appearance: InkAppearance;
  isCurrent: () => boolean;
}>;

// The pixel grid the capture rasterizes, and the saved picture it composes into, if any.
type CaptureTarget = Readonly<{ raster: PaperSize; exported: PictureExport | null }>;

// react-native-svg on iOS draws the view box into the view's laid-out bounds at the screen scale,
// whatever size is requested (RNSVGSvgView drawRect), so there the capture keeps the paper's size
// and composing scales it; Android and the web rasterize the view box into exactly the requested
// pixels.
function captureTarget(packet: PictureRequest): CaptureTarget {
  const size = paperSize(packet.plan.paper);
  if (packet.kind === 'ink' || packet.kind === 'picture') return { raster: size, exported: null };
  const exported = pictureExport(packet.plan.paper, packet.appearance.theme, PixelRatio.get());
  return { raster: Platform.OS === 'ios' ? size : exported.size, exported };
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
  const size = paperSize(packet.plan.paper);
  const [target] = useState(() => captureTarget(packet));
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
      else request.complete(pixels);
    },
    [packet, request]
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
    <InkAppearanceScope.Provider value={packet.appearance}>
      <View style={[styles.capture, size, { left: -size.width * 2 }]} pointerEvents="none">
        {base64 ? (
          <DecodedPng base64={base64} size={target.raster} onLoad={loaded} onError={fail} />
        ) : null}
        {!base64 ? (
          <FixedInkCapture
            plan={packet.plan}
            svgRef={ink}
            onReady={() => setReady(true)}
            onError={fail}
          />
        ) : (
          <CaptureSvg
            ref={output}
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {target.exported ? null : (
              <Rect
                width={size.width}
                height={size.height}
                fill={PAPER_THEMES[packet.appearance.theme].paper}
              />
            )}
            <Image
              href={`data:image/png;base64,${base64}`}
              x={0}
              y={0}
              width={size.width}
              height={size.height}
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
  );
}

const styles = StyleSheet.create({
  capture: { position: 'absolute', top: 0 },
});
