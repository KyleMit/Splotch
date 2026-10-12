import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
  type RefObject,
} from 'react';
import {
  PanResponder,
  PixelRatio,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Svg from 'react-native-svg';
import { InkPaperScope } from './InkPaper';
import { InkAppearanceScope, type InkAppearance } from './InkAppearance';
import { useDrawingAppearance, createDrawingStyles, useDrawingStyles } from './DrawingAppearance';
import { createPaperGeometry } from './paperGeometry';
import { measurePaper } from './measurePaper';
import { PAPER_WIDTH, PAPER_HEIGHT, adoptPaper } from './paperSpace';
import { createNativeRecordedInput7 } from './nativeRecordedInput7';
import { PageOutline } from './PageOutline';
import { RecordedRasterInk7, type RecordedRasterHandle7 } from './RecordedRasterInk7';
import { PictureCapture, type PictureRequest } from './PictureCapture';
import { createPngCapture, type PngCaptureRequest } from './interactions';
import { PAPER_THEMES } from './theme';
import { STROKE_WIDTH_PX } from './strokeWidth';
import type { Drawing } from './model';
import type { Drawing7, Style7 } from './recordedTypes7';
import type { LiveCohort7 } from './recordedContactCohort7';
import type { DrawingSurfaceHandle, DrawingSurfaceProps } from './DrawingSurface';

type Props = Omit<DrawingSurfaceProps, 'drawing'> & { drawing: Drawing7 };

function selection7(props: Props): Style7 {
  if (props.brush === 'eraser')
    return { brush: 'eraser', width: STROKE_WIDTH_PX.eraser[props.eraserWidth] };
  if (props.brush === 'magic')
    return {
      brush: 'magic',
      width: STROKE_WIDTH_PX.magic[props.strokeWidth],
      rainbow: props.drawing.rainbow,
    };
  return {
    brush: props.brush,
    color: props.color,
    width: STROKE_WIDTH_PX[props.brush][props.strokeWidth],
  };
}

export const RecordedDrawingSurface7 = forwardRef<DrawingSurfaceHandle, Props>(
  function RecordedDrawingSurface7(props, ref) {
    const current = useRef(props);
    current.current = props;
    const paperView = useRef<View>(null);
    const input = useRef<ReturnType<typeof createNativeRecordedInput7> | null>(null);
    const mounted = useRef(true);
    const receiptedCursor = useRef<number | null>(null);
    const base = useRef<Drawing7 | null>(null);
    const [preview, setPreview] = useState<LiveCohort7 | null>(null);
    const geometry = useRef(createPaperGeometry(cancel)).current;
    const theme = useDrawingAppearance();
    const drawing = props.drawing;
    const appearance = useMemo(() => ({ pageId: drawing.pageId, theme }), [drawing.pageId, theme]);
    const raster = useRef<RecordedRasterHandle7>(null);
    const [packet, setPacket] = useState<PictureRequest | null>(null);
    const captureInput = useRef({ hasActive: () => input.current?.hasActive() === true }).current;
    const { captureLock, commandLock } = useRecordedSurfaceCapture7(
      captureInput,
      ref,
      setPacket,
      raster,
      drawing,
      appearance,
      refresh
    );
    function ready() {
      return raster.current?.isReady() === true && !captureLock.current && !commandLock.current;
    }
    function fail(error: unknown) {
      const owner = input.current;
      const original = base.current;
      if (
        owner &&
        original &&
        (receiptedCursor.current === null || receiptedCursor.current < owner.allocationCursor())
      )
        current.current.onAbandonAllocation(original, owner.allocationCursor());
      cancel();
      if (mounted.current) current.current.onError(error);
    }
    function cancel() {
      input.current?.cancel();
      input.current = null;
      base.current = null;
      if (mounted.current) {
        setPreview(null);
        current.current.onDrawingChange(false);
      }
    }
    function refresh() {
      geometry.refresh((complete) => measurePaper(paperView.current, complete));
    }
    function start(event: GestureResponderEvent) {
      if (input.current) {
        input.current.start(event);
        return;
      }
      if (current.current.disabled || !ready()) return;
      try {
        const { snapshot, paper } = recordedContactReference7(current.current, geometry);
        const firstSeed = snapshot.seedCursor;
        base.current = snapshot;
        receiptedCursor.current = null;
        input.current = createNativeRecordedInput7({
          paper,
          firstSeed,
          frame: geometry.current,
          style: () => selection7(current.current),
          sound: current.current.sound ?? null,
          preview(value) {
            if (mounted.current) setPreview(value);
          },
          abandon(cursor) {
            receiptedCursor.current = cursor;
            current.current.onAbandonAllocation(snapshot, cursor);
          },
          complete(cohort) {
            if (current.current.currentDrawing() !== snapshot)
              throw new Error('The picture changed during this contact.');
            const committed = current.current.onRecordedCohort(snapshot, cohort);
            if (current.current.currentDrawing() !== committed)
              throw new Error('The recorded picture was not committed.');
            input.current = null;
            base.current = null;
            setPreview(null);
            current.current.onDrawingChange(false);
          },
          error: fail,
        });
        input.current.start(event);
        current.current.onDrawingChange(input.current?.hasActive() === true);
      } catch (error) {
        fail(error);
      }
    }
    useRecordedSurfaceLifetime7({
      mounted,
      refresh,
      input,
      geometry,
      cancel,
      disabled: props.disabled,
      base,
      drawing,
    });

    const responder = useRef(
      createRecordedResponder7(current, ready, start, input, cancel)
    ).current;
    return (
      <RecordedSurfaceView7
        props={props}
        appearance={appearance}
        theme={theme}
        preview={preview}
        paperView={paperView}
        raster={raster}
        refresh={refresh}
        responder={responder}
        cancel={cancel}
        packet={packet}
      />
    );
  }
);
function recordedContactReference7(props: Props, geometry: ReturnType<typeof createPaperGeometry>) {
  const frame = geometry.current();
  if (!frame) throw new Error('The drawing paper is not ready.');
  const snapshot = props.currentDrawing();
  if (snapshot.version !== 7 || snapshot !== props.drawing)
    throw new Error('The drawing input mode changed.');
  const paper =
    snapshot.paper.kind === 'adopted'
      ? snapshot.paper
      : adoptPaper(frame.width, frame.height, PixelRatio.get());
  return { snapshot, paper };
}

function useRecordedSurfaceLifetime7({
  mounted,
  refresh,
  input,
  geometry,
  cancel,
  disabled,
  base,
  drawing,
}: {
  mounted: RefObject<boolean>;
  refresh: () => void;
  input: RefObject<ReturnType<typeof createNativeRecordedInput7> | null>;
  geometry: ReturnType<typeof createPaperGeometry>;
  cancel: () => void;
  disabled: boolean;
  base: RefObject<Drawing7 | null>;
  drawing: Drawing7;
}) {
  useLayoutEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
      input.current?.cancel();
      geometry.clear();
    };
  }, [geometry]);
  useLayoutEffect(() => {
    if (disabled || (base.current && base.current !== drawing)) cancel();
  }, [disabled, drawing]);
}

function createRecordedResponder7(
  current: RefObject<Props>,
  ready: () => boolean,
  start: (event: GestureResponderEvent) => void,
  input: RefObject<ReturnType<typeof createNativeRecordedInput7> | null>,
  cancel: () => void
) {
  return PanResponder.create({
    onStartShouldSetPanResponder: () => !current.current.disabled && ready(),
    onMoveShouldSetPanResponder: () => false,
    onPanResponderGrant: start,
    onPanResponderStart: start,
    onPanResponderMove: (event) => input.current?.move(event),
    onPanResponderEnd: (event) => input.current?.end(event),
    onPanResponderRelease: (event) => input.current?.end(event),
    onPanResponderTerminate: cancel,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  });
}

function RecordedSurfaceView7({
  props,
  appearance,
  theme,
  preview,
  paperView,
  raster,
  refresh,
  responder,
  cancel,
  packet,
}: {
  props: Props;
  appearance: InkAppearance;
  theme: ReturnType<typeof useDrawingAppearance>;
  preview: LiveCohort7 | null;
  paperView: RefObject<View | null>;
  raster: RefObject<RecordedRasterHandle7 | null>;
  refresh: () => void;
  responder: ReturnType<typeof PanResponder.create>;
  cancel: () => void;
  packet: PictureRequest | null;
}) {
  const styles = useDrawingStyles(themedStyles);
  const drawing = props.drawing;
  return (
    <InkPaperScope.Provider value={preview?.paper ?? drawing.paper}>
      <InkAppearanceScope.Provider value={appearance}>
        <View style={styles.container}>
          <View style={[styles.paper, { backgroundColor: PAPER_THEMES[theme].paper }]}>
            <View
              ref={paperView}
              accessibilityLabel="Drawing paper"
              testID="drawing-paper"
              style={styles.inkPlane}
              onLayout={refresh}
              {...responder.panHandlers}
              onTouchCancel={cancel}
            >
              <RecordedRasterInk7
                ref={raster}
                drawing={drawing}
                preview={preview}
                selection={selection7(props)}
                onBusy={props.onPreparingChange}
                onError={(error) => {
                  cancel();
                  props.onRendererFault(error);
                }}
              />
              <Svg
                width="100%"
                height="100%"
                viewBox={'0 0 ' + PAPER_WIDTH + ' ' + PAPER_HEIGHT}
                preserveAspectRatio="xMidYMid meet"
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
              >
                <PageOutline pageId={drawing.pageId} />
              </Svg>
            </View>
            <View pointerEvents="none" style={styles.paperBorder} />
          </View>
          {packet ? <PictureCapture key={packet.id} packet={packet} /> : null}
        </View>
      </InkAppearanceScope.Provider>
    </InkPaperScope.Provider>
  );
}

function useRecordedSurfaceCapture7(
  input: { hasActive: () => boolean },
  ref: ForwardedRef<DrawingSurfaceHandle>,
  setPacket: (packet: PictureRequest | null) => void,
  raster: RefObject<RecordedRasterHandle7 | null>,
  drawing: Drawing7,
  appearance: InkAppearance,
  refreshGeometry: () => void
) {
  const captures = useRef(createPngCapture()).current;
  const captureLock = useRef<PngCaptureRequest | null>(null);
  const commandLock = useRef<object | null>(null);

  const currentAppearance = useRef(appearance);
  currentAppearance.current = appearance;
  const captureAppearance = useRef<InkAppearance | null>(null);
  const currentDrawing = useRef(drawing);
  currentDrawing.current = drawing;
  const mounted = useRef(true);
  const nextId = useRef(1);

  async function capture(snapshot: Drawing, kind: PictureRequest['kind']) {
    if (snapshot.version !== 7) throw new Error('The drawing capture mode changed.');
    if (input.hasActive()) throw new Error('Lift your finger before capturing the picture.');
    const lease = commandLock.current;
    if (!lease || currentDrawing.current !== snapshot || !raster.current)
      throw new Error('The current drawing paper is not ready to capture.');
    const plan = raster.current.readyPlan(snapshot);
    const request = captures.begin(snapshot);
    captureLock.current = request;
    const capturedAppearance = currentAppearance.current;
    captureAppearance.current = capturedAppearance;
    setPacket({
      id: nextId.current++,
      request,
      kind,
      plan,
      appearance: capturedAppearance,
      isCurrent: () =>
        captureLock.current === request &&
        commandLock.current === lease &&
        currentDrawing.current === snapshot &&
        currentAppearance.current === capturedAppearance,
    });
    return request.promise.finally(() => {
      if (captureLock.current !== request) return;
      captureLock.current = null;
      captureAppearance.current = null;
      if (mounted.current) setPacket(null);
    });
  }

  useEffect(() => {
    const request = captureLock.current;
    if (request && (request.drawing !== drawing || captureAppearance.current !== appearance))
      request.cancel('The picture changed before capture finished.');
  }, [drawing, appearance]);

  useImperativeHandle(
    ref,
    () => ({
      capturePng: (snapshot) => capture(snapshot, 'picture'),
      captureInk: (snapshot) => capture(snapshot, 'ink'),
      refreshGeometry,
      lockInput() {
        if (input.hasActive() || commandLock.current)
          throw new Error('Finish drawing before using this control.');
        const lease = {};
        commandLock.current = lease;
        return () => {
          if (commandLock.current === lease) commandLock.current = null;
        };
      },
    }),
    []
  );

  useEffect(
    () => () => {
      mounted.current = false;
      captureLock.current?.cancel('Picture capture was cancelled.');
    },
    [input]
  );

  return { captureLock, commandLock };
}

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    container: { width: '100%', maxWidth: PAPER_WIDTH, alignSelf: 'center' },
    inkPlane: { width: '100%', height: '100%' },
    paperBorder: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      borderWidth: 1,
      borderColor: palette.borderWarm,
      borderRadius: 16,
    },
    paper: {
      width: '100%',
      aspectRatio: PAPER_WIDTH / PAPER_HEIGHT,
      overflow: 'hidden',
      borderRadius: 16,
      backgroundColor: palette.paper,
    },
  })
);
