import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { paletteHex, type PaletteLabel } from './palette';
import {
  BRUSHES,
  PAPER_HEIGHT,
  PAPER_WIDTH,
  paperPoint,
  strokePath,
  type Brush,
  type Drawing,
  type Point,
  type Stroke,
} from './model';
import { DRAWING_THEME } from './theme';
import { createPngCapture, createStrokeInput, type PngCaptureRequest } from './interactions';

const EXPORT_TIMEOUT_MS = 10_000;
export type DrawingSurfaceHandle = { capturePng: (snapshot: Drawing) => Promise<string> };
type Props = {
  drawing: Drawing;
  color: PaletteLabel;
  brush: Brush;
  disabled: boolean;
  onStroke: (stroke: Stroke) => void;
  onDrawingChange: (drawing: boolean) => void;
  onError: (error: unknown) => void;
  onSoundStart: (point: Point, timestamp: number) => void;
  onSoundSample: (point: Point, timestamp: number) => void;
  onSoundEnd: () => void;
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
  draft,
  svgRef,
}: {
  drawing: Drawing;
  draft?: Stroke | null;
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
      {draft ? <Ink stroke={draft} /> : null}
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

export const DrawingSurface = forwardRef<DrawingSurfaceHandle, Props>(
  function DrawingSurface(props, ref) {
    const propsRef = useRef(props);
    propsRef.current = props;
    const size = useRef({ width: 0, height: 0 });
    const input = useRef(createStrokeInput()).current;
    const [draft, setDraft] = useState<Stroke | null>(null);
    const { exportRequest, exportSvg } = usePngExport(ref);

    function point(event: GestureResponderEvent, identifier: string) {
      const touch = [...event.nativeEvent.touches, ...event.nativeEvent.changedTouches].find(
        (item) => item.identifier === identifier
      );
      return touch
        ? paperPoint(touch.locationX, touch.locationY, size.current.width, size.current.height)
        : undefined;
    }

    function sample(event: GestureResponderEvent) {
      const identifier = input.identifier();
      if (identifier === undefined) return;
      const nextPoint = point(event, identifier);
      if (!nextPoint) return;
      try {
        setDraft(input.sample(identifier, nextPoint));
        propsRef.current.onSoundSample(nextPoint, event.nativeEvent.timestamp);
      } catch (error) {
        propsRef.current.onError(error);
      }
    }

    function finish(event?: GestureResponderEvent) {
      const identifier = input.identifier();
      if (identifier === undefined) return;
      const stroke = input.finish(identifier, event ? point(event, identifier) : undefined);
      setDraft(null);
      propsRef.current.onSoundEnd();
      propsRef.current.onDrawingChange(false);
      if (stroke) propsRef.current.onStroke(stroke);
    }

    function ready() {
      return !propsRef.current.disabled && size.current.width > 0 && size.current.height > 0;
    }

    const responder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: ready,
        onMoveShouldSetPanResponder: ready,
        onPanResponderGrant: (event) => {
          const current = propsRef.current;
          const touch = event.nativeEvent.changedTouches[0];
          if (!touch) return;
          const first = paperPoint(
            touch.locationX,
            touch.locationY,
            size.current.width,
            size.current.height
          );
          setDraft(input.start(touch.identifier, current.color, current.brush, first));
          current.onDrawingChange(true);
          current.onSoundStart(first, event.nativeEvent.timestamp);
        },
        onPanResponderStart: (event) => {
          if (event.nativeEvent.touches.length > 1) finish();
        },
        onPanResponderMove: sample,
        onPanResponderEnd: (event) => {
          if (
            event.nativeEvent.changedTouches.some(
              (touch) => touch.identifier === input.identifier()
            )
          )
            finish(event);
        },
        onPanResponderRelease: (event) => finish(event),
        onPanResponderTerminate: () => finish(),
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      })
    ).current;

    useEffect(
      () => () => {
        propsRef.current.onSoundEnd();
      },
      []
    );

    return (
      <View style={styles.container}>
        <View
          accessibilityLabel="Drawing paper"
          testID="drawing-paper"
          style={styles.paper}
          onLayout={({ nativeEvent }) => {
            size.current = nativeEvent.layout;
          }}
          {...responder.panHandlers}
        >
          <Artwork drawing={props.drawing} draft={draft} />
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
