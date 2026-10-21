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

// The grid an SVG ink capture produces, which the rest of a capture expects: iOS draws the view
// box at the screen scale (see captureTarget).
function inkGrid(packet: PictureRequest, raster: PaperSize): PaperSize {
  if (Platform.OS !== 'ios') return raster;
  return {
    width: Math.round(raster.width * packet.pixelRatio),
    height: Math.round(raster.height * packet.pixelRatio),
  };
}

// react-native-svg on Android draws an <Image> only from Fresco's decoded-bitmap memory cache
// (ImageView.draw), and Fresco caches a bitmap only while its budget, a share of the app's memory
// class, has room for it. A capture taken while the ink was uncached left it out, and the picture
// saved bare paper (issue 3125). Android composes the ink beneath the captured line art instead.
function composesInk(): boolean {
  return Platform.OS === 'android';
}

// The capture's output, composed onto the saved picture or, when this capture composes the ink,
// onto its own grid over the plain paper.
function composeOutput(
  output: string,
  ink: string,
  packet: PictureRequest,
  target: CaptureTarget
): Promise<string> {
  const withInk = composesInk();
  const picture =
    target.exported ??
    (withInk
      ? {
          size: target.raster,
          scale: packet.pixelRatio,
          paper: PAPER_THEMES[packet.appearance.theme].paper,
        }
      : null);
  if (!picture) return Promise.resolve(output);
  return import('./pictureCompose').then(({ composePicture }) =>
    composePicture(withInk ? [ink, output] : [output], picture, packet.kind === 'export')
  );
}

// Native ink is already raster: its committed pixels are the capture's ink (ADR-0178).
function useCommittedInk(
  packet: PictureRequest,
  raster: PaperSize,
  captured: boolean,
  accept: (pixels: string, kind: PictureRequest['kind']) => void,
  fail: (error: unknown) => void
) {
  const committedInk = packet.plan.ink;
  useEffect(() => {
    if (!committedInk || captured) return;
    if (!packet.isCurrent()) {
      fail(new Error('The picture changed before capture finished.'));
      return;
    }
    try {
      accept(committedInk(inkGrid(packet, raster), packet.plan.projection), 'ink');
    } catch (error) {
      fail(error);
    }
  }, [committedInk, captured, packet, raster, accept, fail]);
  return committedInk;
}

// A capture that has not finished within PNG_TIMEOUT_MS fails; unmounting cancels it.
function useCaptureLifetime(
  captures: ReturnType<typeof createSvgCapture>,
  request: PngCaptureRequest,
  fail: (error: unknown) => void,
  current: { current: boolean }
) {
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
  }, [captures, request, fail, current]);
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
  const committedInk = useCommittedInk(packet, target.raster, base64 !== null, accept, fail);

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

  const withInk = composesInk();
  const inkPlaced = base64 !== null && (withInk || imageLoaded);
  useEffect(() => {
    if (!inkPlaced || !outlineReady || base64 === null) return;
    if (!packet.isCurrent()) {
      fail(new Error('The picture changed before capture finished.'));
      return;
    }
    const job = captures.capture(output.current, target.raster);
    void job.promise
      .then((pixels) => composeOutput(pixels, base64, packet, target))
      .then((pixels) => accept(pixels, 'picture'))
      .catch(fail);
    return () => job.cancel();
  }, [inkPlaced, outlineReady, base64, captures, packet, target, accept, fail]);

  useCaptureLifetime(captures, request, fail, current);

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
          {!base64 ? (
            committedInk ? null : (
              <FixedInkCapture
                plan={packet.plan}
                raster={raster}
                svgRef={ink}
                onReady={() => setReady(true)}
                onError={fail}
              />
            )
          ) : (
            <CaptureSvg
              ref={output}
              width={raster.width}
              height={raster.height}
              viewBox={`${size.x} ${size.y} ${size.width} ${size.height}`}
              preserveAspectRatio="xMidYMid meet"
            >
              {target.exported || withInk ? null : (
                <Rect
                  x={size.x}
                  y={size.y}
                  width={size.width}
                  height={size.height}
                  fill={PAPER_THEMES[packet.appearance.theme].paper}
                />
              )}
              {withInk ? null : (
                <Image
                  href={`data:image/png;base64,${base64}`}
                  {...paperRasterBounds(packet.plan.projection, raster)}
                  preserveAspectRatio="none"
                  onLoad={loaded}
                />
              )}
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
