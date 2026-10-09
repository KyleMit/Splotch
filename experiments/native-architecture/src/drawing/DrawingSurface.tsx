import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { paletteHex } from './palette';
import { BRUSHES, PAPER_HEIGHT, PAPER_WIDTH, strokePath, type Drawing, type Stroke } from './model';
import { DRAWING_THEME } from './theme';
import { createContactResponder, type ContactDrawingProps } from './contactResponder';
import { createPngCapture, type PngCaptureRequest } from './interactions';

const EXPORT_TIMEOUT_MS = 10_000;
export type DrawingSurfaceHandle = { capturePng: (snapshot: Drawing) => Promise<string> };
type Props = ContactDrawingProps & {
  drawing: Drawing;
};

function Ink({ stroke }: { stroke: Stroke }) {
  const color = paletteHex(stroke.color);
  const width = BRUSHES[stroke.brush].width;
  const first = stroke.points[0];
  if (!first) return null;
  return stroke.points.length === 1 ? (
    <Circle cx={first.x} cy={first.y} r={width / 2} fill={color} />
  ) : (
    <Path
      d={strokePath(stroke.points)}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

function Artwork({
  drawing,
  drafts = [],
  svgRef,
}: {
  drawing: Drawing;
  drafts?: readonly Stroke[];
  svgRef?: Ref<Svg>;
}) {
  return (
    <Svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={`0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}`}
      pointerEvents="none"
    >
      <Rect width={PAPER_WIDTH} height={PAPER_HEIGHT} fill={DRAWING_THEME.paper} />
      {drawing.strokes.map((stroke, index) => (
        <Ink key={index} stroke={stroke} />
      ))}
      {drafts.map((stroke, index) => (
        <Ink key={`draft-${index}`} stroke={stroke} />
      ))}
    </Svg>
  );
}

function usePngExport(ref: Ref<DrawingSurfaceHandle>) {
  const captures = useRef(createPngCapture()).current;
  const [exportRequest, setExportRequest] = useState<PngCaptureRequest | null>(null);
  const exportSvg = useRef<Svg>(null);
  useImperativeHandle(
    ref,
    () => ({
      capturePng(snapshot) {
        const request = captures.begin(snapshot);
        setExportRequest(request);
        return request.promise;
      },
    }),
    [captures]
  );

  useEffect(() => {
    if (!exportRequest) return;
    const cancel = () => {
      if (exportRequest.cancel('PNG export did not finish. Please try again.'))
        setExportRequest(null);
    };
    const timeout = setTimeout(cancel, EXPORT_TIMEOUT_MS);
    const frame = requestAnimationFrame(() => {
      try {
        exportSvg.current?.toDataURL(
          (base64) => {
            if (exportRequest.complete(base64)) {
              clearTimeout(timeout);
              setExportRequest(null);
            }
          },
          { width: PAPER_WIDTH, height: PAPER_HEIGHT }
        );
      } catch {
        cancel();
      }
    });
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
      exportRequest.cancel('PNG export was cancelled.');
    };
  }, [exportRequest]);

  return { exportRequest, exportSvg };
}

function useContactDrawing(props: Props) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const size = useRef({ width: 0, height: 0 });
  const [drafts, setDrafts] = useState<readonly Stroke[]>([]);
  const input = useRef(
    createContactResponder(
      () => propsRef.current,
      () => size.current,
      setDrafts
    )
  ).current;

  useEffect(
    () => () => {
      input.detach();
    },
    [input]
  );

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => input.ready(),
      onMoveShouldSetPanResponder: () => input.ready(),
      onPanResponderGrant: (event) => input.grant(event),
      onPanResponderStart: (event) => input.start(event),
      onPanResponderMove: (event) => input.move(event),
      onPanResponderEnd: (event) => input.end(event),
      onPanResponderRelease: (event) => input.end(event),
      onPanResponderTerminate: () => input.interrupt(),
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    })
  ).current;

  function layout(next: { width: number; height: number }) {
    if (next.width !== size.current.width || next.height !== size.current.height) input.resize();
    size.current = next;
  }

  return { drafts, layout, responder };
}

export const DrawingSurface = forwardRef<DrawingSurfaceHandle, Props>(
  function DrawingSurface(props, ref) {
    const { drafts, layout, responder } = useContactDrawing(props);
    const { exportRequest, exportSvg } = usePngExport(ref);

    return (
      <View style={styles.container}>
        <View
          accessibilityLabel="Drawing paper"
          testID="drawing-paper"
          pointerEvents="box-only"
          style={styles.paper}
          onLayout={({ nativeEvent }) => {
            layout(nativeEvent.layout);
          }}
          {...responder.panHandlers}
        >
          <Artwork drawing={props.drawing} drafts={drafts} />
        </View>
        {exportRequest ? (
          <View pointerEvents="none" style={styles.export}>
            <Artwork drawing={exportRequest.drawing} svgRef={exportSvg} />
          </View>
        ) : null}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: PAPER_WIDTH, alignSelf: 'center' },
  paper: {
    width: '100%',
    aspectRatio: PAPER_WIDTH / PAPER_HEIGHT,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: DRAWING_THEME.borderWarm,
    backgroundColor: DRAWING_THEME.paper,
  },
  export: {
    position: 'absolute',
    left: -PAPER_WIDTH * 2,
    top: 0,
    width: PAPER_WIDTH,
    height: PAPER_HEIGHT,
  },
});
