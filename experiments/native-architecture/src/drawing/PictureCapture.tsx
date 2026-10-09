import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Image, Rect } from 'react-native-svg';
import type { PngCaptureRequest } from './interactions';
import type { InkPlan } from './checkpoints';
import { PAPER_WIDTH, PAPER_HEIGHT } from './model';
import { PageOutline } from './PageOutline';
import { FixedInkCapture } from './FixedInkCapture';
import { createSvgCapture, PNG_TIMEOUT_MS } from './svgCapture';
import { DRAWING_THEME } from './theme';

export type PictureRequest = Readonly<{
  id: number;
  request: PngCaptureRequest;
  kind: 'ink' | 'picture';
  plan: InkPlan;
  isCurrent: () => boolean;
}>;

export function PictureCapture({ packet }: { packet: PictureRequest }) {
  const ink = useRef<Svg>(null);
  const output = useRef<Svg>(null);
  const [ready, setReady] = useState(false);
  const [base64, setBase64] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const captures = useRef(createSvgCapture()).current;
  const current = useRef(true);
  const request = packet.request;

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

  useEffect(() => {
    if (!ready || base64) return;
    if (!packet.isCurrent()) {
      fail(new Error('The picture changed before capture finished.'));
      return;
    }
    const job = captures.capture(ink.current);
    void job.promise.then((pixels) => accept(pixels, 'ink')).catch(fail);
    return () => job.cancel();
  }, [ready, base64, captures]);

  useEffect(() => {
    if (!imageLoaded) return;
    if (!packet.isCurrent()) {
      fail(new Error('The picture changed before capture finished.'));
      return;
    }
    const job = captures.capture(output.current);
    void job.promise.then((pixels) => accept(pixels, 'picture')).catch(fail);
    return () => job.cancel();
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
        <FixedInkCapture
          plan={packet.plan}
          svgRef={ink}
          onReady={() => setReady(true)}
          onError={fail}
        />
      ) : (
        <Svg
          ref={output}
          width={PAPER_WIDTH}
          height={PAPER_HEIGHT}
          viewBox={`0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}`}
        >
          <Rect width={PAPER_WIDTH} height={PAPER_HEIGHT} fill={DRAWING_THEME.paper} />
          <Image
            href={`data:image/png;base64,${base64}`}
            x={0}
            y={0}
            width={PAPER_WIDTH}
            height={PAPER_HEIGHT}
            preserveAspectRatio="none"
            onLoad={() => {
              if (current.current && packet.isCurrent()) setImageLoaded(true);
            }}
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
