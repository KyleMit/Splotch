import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ForwardedRef,
  type RefObject,
} from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';
import { PAPER_HEIGHT, PAPER_WIDTH, type Drawing, type Stroke } from './model';
import { createContactResponder, type ContactDrawingProps } from './contactResponder';
import { createPaperGeometry } from './paperGeometry';
import { measurePaper } from './measurePaper';
import { PageOutline } from './PageOutline';
import { RasterInk, type RasterInkHandle } from './RasterInk';
import { PictureCapture, type PictureRequest } from './PictureCapture';
import { DRAWING_THEME } from './theme';
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
    const propsRef = useRef(props);
    propsRef.current = props;
    const paper = useRef<View>(null);
    const inputRef = useRef<ReturnType<typeof createContactResponder> | null>(null);
    const geometry = useRef(createPaperGeometry(() => inputRef.current?.resize())).current;
    const [drafts, setDrafts] = useState<readonly Stroke[]>([]);
    const raster = useRef<RasterInkHandle>(null);
    const input = useRef(
      createContactResponder(
        () => ({
          ...propsRef.current,
          disabled:
            propsRef.current.disabled ||
            commandLock.current !== null ||
            captureLock.current !== null ||
            raster.current?.isReady() !== true,
        }),
        geometry.current,
        setDrafts
      )
    ).current;
    inputRef.current = input;
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
        onPanResponderRelease: (event) => input.end(event),
        onPanResponderTerminate: () => input.interrupt(),
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      })
    ).current;

    return (
      <View style={styles.container}>
        <View
          ref={paper}
          accessibilityLabel="Drawing paper"
          testID="drawing-paper"
          style={styles.paper}
          pointerEvents="box-only"
          onLayout={refreshGeometry}
          {...responder.panHandlers}
        >
          <RasterInk
            ref={raster}
            strokes={props.drawing.strokes}
            drafts={drafts}
            prepareEraser={props.brush === 'eraser'}
            onBusy={props.onPreparingChange}
            onError={props.onRendererFault}
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

function useSurfaceCapture(
  input: ReturnType<typeof createContactResponder>,
  ref: ForwardedRef<DrawingSurfaceHandle>,
  setPacket: (packet: PictureRequest | null) => void,
  raster: RefObject<RasterInkHandle | null>,
  drawing: Drawing,
  refreshGeometry: () => void
) {
  const captures = useRef(createPngCapture()).current;
  const captureLock = useRef<PngCaptureRequest | null>(null);
  const commandLock = useRef<object | null>(null);

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
