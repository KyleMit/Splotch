import { drawingPaper, paperSize, samePaper } from './paperSpace';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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

export type PictureRequest = Readonly<{
  id: number;
  request: PngCaptureRequest;
  kind: 'ink' | 'picture';
  plan: InkPlan;
  appearance: InkAppearance;
  isCurrent: () => boolean;
}>;

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
  if (!samePaper(packet.plan.paper, drawingPaper(request.drawing)))
    throw new Error('The captured paper reference does not match the picture.');

  function fail(error: unknown) {
    request.cancel(error instanceof Error ? error.message : 'PNG capture failed.');
  }
  function accept(pixels: string, kind: PictureRequest['kind']) {
    if (!current.current || !packet.isCurrent()) {
      request.cancel('The picture changed before capture finished.');
      return;
    }
    if (kind === 'ink' && packet.kind === 'picture') setBase64(pixels);
    else request.complete(pixels);
  }
  function loaded() {
    if (current.current && packet.isCurrent()) setImageLoaded(true);
  }

  useEffect(() => {
    if (!ready || base64) return;
    if (!packet.isCurrent()) {
      fail(new Error('The picture changed before capture finished.'));
      return;
    }
    const job = captures.capture(ink.current, size);
    void job.promise.then((pixels) => accept(pixels, 'ink')).catch(fail);
    return () => job.cancel();
  }, [ready, base64, captures]);

  useEffect(() => {
    if (!imageLoaded || !outlineReady) return;
    if (!packet.isCurrent()) {
      fail(new Error('The picture changed before capture finished.'));
      return;
    }
    const job = captures.capture(output.current, size);
    void job.promise.then((pixels) => accept(pixels, 'picture')).catch(fail);
    return () => job.cancel();
  }, [imageLoaded, outlineReady, captures]);

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
  }, [captures, request]);

  return (
    <InkAppearanceScope.Provider value={packet.appearance}>
      <View style={[styles.capture, size, { left: -size.width * 2 }]} pointerEvents="none">
        {base64 ? <DecodedPng base64={base64} size={size} onLoad={loaded} onError={fail} /> : null}
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
            <Rect
              width={size.width}
              height={size.height}
              fill={PAPER_THEMES[packet.appearance.theme].paper}
            />
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
