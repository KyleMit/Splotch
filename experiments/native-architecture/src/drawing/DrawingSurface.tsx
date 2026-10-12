import { InkPaperScope } from './InkPaper';
import { drawingPaper, type PaperReference } from './paperSpace';
import { useDrawingAppearance } from './DrawingAppearance';
import { createDrawingStyles, useDrawingStyles } from './DrawingAppearance';
import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
  type RefObject,
} from 'react';
import { PanResponder, PixelRatio, StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';
import { PAPER_HEIGHT, PAPER_WIDTH, type Drawing, type Stroke } from './model';
import { createContactResponder, type ContactDrawingProps } from './contactResponder';
import { createPaperGeometry } from './paperGeometry';
import { measurePaper } from './measurePaper';
import { PageOutline } from './PageOutline';
import { RasterInk, type RasterInkHandle } from './RasterInk';
import { PictureCapture, type PictureRequest } from './PictureCapture';
import { PAPER_THEMES } from './theme';
import { InkAppearanceScope, type InkAppearance } from './InkAppearance';
import { createPngCapture, type PngCaptureRequest } from './interactions';

export type DrawingSurfaceHandle = {
  capturePng: (snapshot: Drawing) => Promise<string>;
  captureInk: (snapshot: Drawing) => Promise<string>;
  lockInput: () => () => void;
  refreshGeometry: () => void;
};
type Props = ContactDrawingProps & {
  drawing: Drawing;
  onPreparingChange: (busy: boolean) => void;
  onRendererFault: (error: unknown) => void;
};

export const DrawingSurface = forwardRef<DrawingSurfaceHandle, Props>(
  function DrawingSurface(props, ref) {
    const styles = useDrawingStyles(themedStyles);
    const theme = useDrawingAppearance();
    const appearance = useMemo<InkAppearance>(
      () => ({ pageId: props.drawing.pageId, theme }),
      [props.drawing.pageId, theme]
    );
    const propsRef = useRef(props);
    propsRef.current = props;
    const paper = useRef<View>(null);
    const inputRef = useRef<ReturnType<typeof createContactResponder> | null>(null);
    const geometry = useRef(createPaperGeometry(() => inputRef.current?.resize())).current;
    const [draft, setDraft] = useState<{
      strokes: readonly Stroke[];
      paper: PaperReference | null;
    }>({ strokes: [], paper: null });
    const paperReference = draft.paper ?? drawingPaper(props.drawing);
    const raster = useRef<RasterInkHandle>(null);
    const input = useRef(
      createContactResponder(
        () => ({
          ...propsRef.current,
          disabled:
            propsRef.current.disabled ||
            commandLock.current !== null ||
            captureLock.current !== null ||
            raster.current?.canStart(
              propsRef.current.currentDrawing().strokes,
              propsRef.current.brush,
              inputRef.current?.hasActive() === true
            ) !== true,
        }),
        geometry.current,
        (strokes, paper) => setDraft({ strokes, paper }),
        () => PixelRatio.get()
      )
    ).current;
    inputRef.current = input;
    useLayoutEffect(() => {
      if (props.disabled) input.silence();
    }, [input, props.disabled]);
    const refreshGeometry = useCallback(() => {
      geometry.refresh((complete) => measurePaper(paper.current, complete));
    }, [geometry]);
    const [packet, setPacket] = useState<PictureRequest | null>(null);
    const { captureLock, commandLock } = useSurfaceCapture(
      input,
      ref,
      setPacket,
      raster,
      props.drawing,
      appearance,
      refreshGeometry
    );
    useLayoutEffect(() => {
      refreshGeometry();
      return () => {
        input.detach();
        geometry.clear();
      };
    }, [input, geometry, refreshGeometry]);
    const responder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => input.ready(),
        onMoveShouldSetPanResponder: () => input.ready(),
        onPanResponderGrant: (event) => input.grant(event),
        onPanResponderStart: (event) => input.start(event),
        onPanResponderMove: (event) => input.move(event),
        onPanResponderEnd: (event) => input.end(event),
        onPanResponderRelease: (event) => input.release(event),
        onPanResponderTerminate: () => input.interrupt(),
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      })
    ).current;

    return (
      <InkPaperScope.Provider value={paperReference}>
        <InkAppearanceScope.Provider value={appearance}>
          <View style={styles.container}>
            <View style={[styles.paper, { backgroundColor: PAPER_THEMES[appearance.theme].paper }]}>
              <View
                ref={paper}
                accessibilityLabel="Drawing paper"
                testID="drawing-paper"
                style={styles.inkPlane}
                pointerEvents="box-only"
                onLayout={refreshGeometry}
                {...responder.panHandlers}
                onTouchEnd={(event) => input.endRaw(event)}
                onTouchCancel={() => input.interrupt()}
              >
                {/* Checkpoints contain Magic colors; appearance changes must replay semantic strokes. */}
                <RasterInk
                  key={`${appearance.pageId}:${appearance.theme}`}
                  ref={raster}
                  strokes={props.drawing.strokes}
                  drafts={draft.strokes}
                  brush={props.brush}
                  color={props.color}
                  onBusy={props.onPreparingChange}
                  onError={(error) => {
                    input.silence();
                    props.onRendererFault(error);
                  }}
                />
                <Svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}`}
                  preserveAspectRatio="xMidYMid meet"
                  pointerEvents="none"
                  style={StyleSheet.absoluteFill}
                >
                  <PageOutline pageId={props.drawing.pageId} />
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
);

function useSurfaceCapture(
  input: ReturnType<typeof createContactResponder>,
  ref: ForwardedRef<DrawingSurfaceHandle>,
  setPacket: (packet: PictureRequest | null) => void,
  raster: RefObject<RasterInkHandle | null>,
  drawing: Drawing,
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
    if (input.hasActive()) throw new Error('Lift your finger before capturing the picture.');
    const lease = commandLock.current;
    if (!lease || currentDrawing.current !== snapshot || !raster.current)
      throw new Error('The current drawing paper is not ready to capture.');
    const plan = raster.current.readyPlan(snapshot.strokes);
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
