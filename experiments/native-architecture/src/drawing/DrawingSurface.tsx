import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ForwardedRef,
  type RefObject,
} from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg from 'react-native-svg';
import type { PaletteLabel } from './palette';
import {
  PAPER_HEIGHT,
  PAPER_WIDTH,
  paperPoint,
  strokeStyle,
  type Drawing,
  type Stroke,
} from './model';
import type { Brush } from './brushes';
import { PageOutline } from './PageOutline';
import { RasterInk, type RasterInkHandle } from './RasterInk';
import { PictureCapture, type PictureRequest } from './PictureCapture';
import { DRAWING_THEME } from './theme';
import { createPngCapture, createStrokeInput, type PngCaptureRequest } from './interactions';

export type DrawingSurfaceHandle = {
  capturePng: (snapshot: Drawing) => Promise<string>;
  captureInk: (snapshot: Drawing) => Promise<string>;
  lockInput: () => () => void;
};
type Props = {
  drawing: Drawing;
  color: PaletteLabel;
  brush: Brush;
  disabled: boolean;
  onStroke: (stroke: Stroke) => void;
  onDrawingChange: (drawing: boolean) => void;
  onPreparingChange: (busy: boolean) => void;
  onError: (error: unknown) => void;
};

export const DrawingSurface = forwardRef<DrawingSurfaceHandle, Props>(
  function DrawingSurface(props, ref) {
    const propsRef = useRef(props);
    propsRef.current = props;
    const size = useRef({ width: 0, height: 0 });
    const input = useRef(createStrokeInput()).current;
    const [draft, setDraft] = useState<Stroke | null>(null);
    const raster = useRef<RasterInkHandle>(null);
    const [packet, setPacket] = useState<PictureRequest | null>(null);
    const { captureLock, commandLock } = useSurfaceCapture(
      input,
      ref,
      setPacket,
      raster,
      props.drawing
    );

    function sample(event: GestureResponderEvent) {
      const identifier = input.identifier();
      if (identifier === undefined) return;
      const nextPoint = touchPoint(event, identifier, size.current);
      if (!nextPoint) return;
      try {
        setDraft(input.sample(identifier, nextPoint));
      } catch (error) {
        propsRef.current.onError(error);
      }
    }

    function finish(event?: GestureResponderEvent) {
      const identifier = input.identifier();
      if (identifier === undefined) return;
      const stroke = input.finish(
        identifier,
        event ? touchPoint(event, identifier, size.current) : undefined
      );
      setDraft(null);
      propsRef.current.onDrawingChange(false);
      if (stroke) propsRef.current.onStroke(stroke);
    }

    function ready() {
      return (
        !propsRef.current.disabled &&
        !commandLock.current &&
        !captureLock.current &&
        raster.current?.isReady() === true &&
        size.current.width > 0 &&
        size.current.height > 0
      );
    }

    const responder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: ready,
        onMoveShouldSetPanResponder: ready,
        onPanResponderGrant: (event) => {
          if (!ready()) return;
          const current = propsRef.current;
          const touch = event.nativeEvent.changedTouches[0];
          if (!touch) return;
          const first = paperPoint(
            touch.locationX,
            touch.locationY,
            size.current.width,
            size.current.height
          );
          setDraft(
            input.start(
              touch.identifier,
              strokeStyle(current.brush, current.color, current.drawing),
              first
            )
          );
          current.onDrawingChange(true);
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
          <RasterInk
            ref={raster}
            strokes={props.drawing.strokes}
            draft={draft}
            prepareEraser={props.brush === 'eraser'}
            onBusy={props.onPreparingChange}
            onError={props.onError}
          />
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}`}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          >
            <PageOutline pageId={props.drawing.pageId} />
          </Svg>
        </View>
        {packet ? <PictureCapture key={packet.id} packet={packet} /> : null}
      </View>
    );
  }
);

function touchPoint(
  event: GestureResponderEvent,
  identifier: string,
  size: { width: number; height: number }
) {
  const touch = [...event.nativeEvent.touches, ...event.nativeEvent.changedTouches].find(
    (item) => item.identifier === identifier
  );
  return touch ? paperPoint(touch.locationX, touch.locationY, size.width, size.height) : undefined;
}

function useSurfaceCapture(
  input: ReturnType<typeof createStrokeInput>,
  ref: ForwardedRef<DrawingSurfaceHandle>,
  setPacket: (packet: PictureRequest | null) => void,
  raster: RefObject<RasterInkHandle | null>,
  drawing: Drawing
) {
  const captures = useRef(createPngCapture()).current;
  const captureLock = useRef<PngCaptureRequest | null>(null);
  const commandLock = useRef<object | null>(null);

  const currentDrawing = useRef(drawing);
  currentDrawing.current = drawing;
  const mounted = useRef(true);
  const nextId = useRef(1);

  async function capture(snapshot: Drawing, kind: PictureRequest['kind']) {
    if (input.identifier() !== undefined)
      throw new Error('Lift your finger before capturing the picture.');
    const lease = commandLock.current;
    if (!lease || currentDrawing.current !== snapshot || !raster.current)
      throw new Error('The current drawing paper is not ready to capture.');
    const plan = raster.current.readyPlan(snapshot.strokes);
    const request = captures.begin(snapshot);
    captureLock.current = request;
    setPacket({
      id: nextId.current++,
      request,
      kind,
      plan,
      isCurrent: () =>
        captureLock.current === request &&
        commandLock.current === lease &&
        currentDrawing.current === snapshot,
    });
    return request.promise.finally(() => {
      if (captureLock.current !== request) return;
      captureLock.current = null;
      if (mounted.current) setPacket(null);
    });
  }

  useEffect(() => {
    const request = captureLock.current;
    if (request && request.drawing !== drawing)
      request.cancel('The picture changed before capture finished.');
  }, [drawing]);

  useImperativeHandle(ref, () => ({
    capturePng: (snapshot) => capture(snapshot, 'picture'),
    captureInk: (snapshot) => capture(snapshot, 'ink'),
    lockInput() {
      if (input.identifier() !== undefined || commandLock.current)
        throw new Error('Finish drawing before using this control.');
      const lease = {};
      commandLock.current = lease;
      return () => {
        if (commandLock.current === lease) commandLock.current = null;
      };
    },
  }));

  useEffect(
    () => () => {
      mounted.current = false;
      input.finish();
      captureLock.current?.cancel('Picture capture was cancelled.');
    },
    [input]
  );

  return { captureLock, commandLock };
}

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
});
