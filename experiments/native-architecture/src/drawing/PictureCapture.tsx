import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Image, Rect } from 'react-native-svg';
import type { PngCaptureRequest } from './interactions';
import { PAPER_WIDTH, PAPER_HEIGHT } from './model';
import { PageOutline } from './PageOutline';
import { RasterInk, type RasterInkHandle } from './RasterInk';
import { createSvgCapture, PNG_TIMEOUT_MS } from './svgCapture';
import { DRAWING_THEME } from './theme';

export type PictureRequest = Readonly<{ request: PngCaptureRequest; kind: 'ink' | 'picture' }>;

export function PictureCapture({
  packet,
  onSettled,
}: {
  packet: PictureRequest;
  onSettled: () => void;
}) {
  const ink = useRef<RasterInkHandle>(null);
  const output = useRef<Svg>(null);
  const [busy, setBusy] = useState(true);
  const [base64, setBase64] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const captures = useRef(createSvgCapture()).current;
  const current = useRef(true);
  const request = packet.request;

  function fail(error: unknown) {
    if (request.cancel(error instanceof Error ? error.message : 'PNG capture failed.')) onSettled();
  }

  useEffect(() => {
    if (busy || base64) return;
    void ink.current
      ?.capturePng()
      .then((pixels) => {
        if (!current.current) return;
        if (packet.kind === 'ink') {
          if (request.complete(pixels)) onSettled();
        } else setBase64(pixels);
      })
      .catch(fail);
  }, [busy, base64]);

  useEffect(() => {
    if (!imageLoaded) return;
    void captures
      .capture(output.current)
      .then((pixels) => {
        if (request.complete(pixels)) onSettled();
      })
      .catch(fail);
  }, [imageLoaded, captures]);

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
    <View style={styles.capture} pointerEvents="none">
      {!base64 ? (
        <RasterInk
          ref={ink}
          strokes={request.drawing.strokes}
          prepareEraser={false}
          onBusy={setBusy}
          onError={fail}
        />
      ) : (
        <Svg ref={output} width="100%" height="100%" viewBox={`0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}`}>
          <Rect width={PAPER_WIDTH} height={PAPER_HEIGHT} fill={DRAWING_THEME.paper} />
          <Image
            href={`data:image/png;base64,${base64}`}
            x={0}
            y={0}
            width={PAPER_WIDTH}
            height={PAPER_HEIGHT}
            preserveAspectRatio="none"
            onLoad={() => setImageLoaded(true)}
          />
          <PageOutline pageId={request.drawing.pageId} />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  capture: {
    position: 'absolute',
    left: -PAPER_WIDTH * 2,
    top: 0,
    width: PAPER_WIDTH,
    height: PAPER_HEIGHT,
  },
});
