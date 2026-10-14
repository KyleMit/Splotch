import { InkPaperScope } from './InkPaper';
import { drawingPaper, presentedPaperSize, type PaperReference } from './paperSpace';
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
  type ReactNode,
  type RefObject,
} from 'react';
import { PanResponder, PixelRatio, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Svg } from '../platform/svg';
import type { Drawing, Stroke } from './model';
import { createContactResponder, type ContactDrawingProps } from './contactResponder';
import { createPaperGeometry } from './paperGeometry';
import { measurePaper } from './measurePaper';
import { PageOutline } from './PageOutline';
import type { RasterInkHandle } from './RasterInk';
import { InkLayer } from './InkLayer';
import { PictureCapture, type PictureRequest } from './PictureCapture';
import { PAPER_THEMES } from './theme';
import { InkAppearanceScope, type InkAppearance } from './InkAppearance';
import { createPngCapture, type PngCaptureRequest } from './interactions';
import { PointerHalos } from './PointerHalos';
import { createHaloFeed } from './haloFeed';
import type { Halo } from './haloModel';

export type DrawingSurfaceHandle = {
  capturePng: (snapshot: Drawing) => Promise<string>;
  captureInk: (snapshot: Drawing) => Promise<string>;
  lockInput: () => () => void;
  // A lease for work the child never asked for. Any foreground claim on the paper (a fresh
  // contact, lockInput) ends it first, ending its capture and calling onPreempt; it is refused
  // while anything else holds the paper.
  lockBackground: (onPreempt: () => void) => () => void;
  refreshGeometry: () => void;
};

type Lease = Readonly<{ preempt: (() => void) | null }>;
export type DrawingSurfaceProps = ContactDrawingProps & {
  drawing: Drawing;
  onPreparingChange: (busy: boolean) => void;
  onRendererFault: (error: unknown) => void;
  // Painted on the paper beneath the ink: the drawing screen's paper grain.
  underlay?: ReactNode;
};

type LiveDraft = {
  strokes: readonly Stroke[];
  paper: PaperReference | null;
};

// Drafts render the surface; halos go straight to their own layer.
function useLiveDraft() {
  const [draft, setDraft] = useState<LiveDraft>({ strokes: [], paper: null });
  const halos = useRef(createHaloFeed()).current;
  const show = useCallback(
    (strokes: readonly Stroke[], paper: PaperReference | null, live: readonly Halo[]) => {
      setDraft({ strokes, paper });
      halos.publish(live);
    },
    [halos]
  );
  return { draft, halos, show };
}

export const DrawingSurface = forwardRef<DrawingSurfaceHandle, DrawingSurfaceProps>(
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
    const { draft, halos, show } = useLiveDraft();
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
        show,
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
    const [presented, layoutPlane] = usePresentedPaper(paperReference, refreshGeometry);
    const [packet, setPacket] = useState<PictureRequest | null>(null);
    const { captureLock, commandLock, preemptBackground } = useSurfaceCapture(
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
    const responder = useRef(createSurfaceResponder(input, preemptBackground)).current;

    return (
      <InkPaperScope.Provider value={paperReference}>
        <InkAppearanceScope.Provider value={appearance}>
          <View style={styles.container}>
            <View style={[styles.paper, { backgroundColor: PAPER_THEMES[appearance.theme].paper }]}>
              {props.underlay}
              <View
                ref={paper}
                accessibilityLabel="Drawing paper"
                testID="drawing-paper"
                style={styles.inkPlane}
                pointerEvents="box-only"
                onLayout={layoutPlane}
                {...responder.panHandlers}
                onTouchEnd={(event) => input.endRaw(event)}
                onTouchCancel={() => input.interrupt()}
              >
                {/* Committed ink holds Magic colors; appearance changes must replay semantic strokes. */}
                <InkLayer
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
                  viewBox={`0 0 ${presented.width} ${presented.height}`}
                  preserveAspectRatio="xMidYMid meet"
                  pointerEvents="none"
                  style={StyleSheet.absoluteFill}
                >
                  <PageOutline pageId={props.drawing.pageId} size={presented} />
                </Svg>
                <PointerHalos feed={halos} />
              </View>
            </View>
            {packet ? <PictureCapture key={packet.id} packet={packet} /> : null}
          </View>
        </InkAppearanceScope.Provider>
      </InkPaperScope.Provider>
    );
  }
);

// A blank picture shows as the paper it would adopt from the ink plane's live size.
function usePresentedPaper(paper: PaperReference, refreshGeometry: () => void) {
  const [plane, setPlane] = useState({ width: 0, height: 0 });
  const layout = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      const { width, height } = nativeEvent.layout;
      setPlane((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height }
      );
      refreshGeometry();
    },
    [refreshGeometry]
  );
  return [presentedPaperSize(paper, plane), layout] as const;
}

// A new touch is a foreground claim: it ends background work on the paper before asking whether
// the paper can take it.
function createSurfaceResponder(
  input: ReturnType<typeof createContactResponder>,
  preemptBackground: () => void
) {
  const admit = () => {
    preemptBackground();
    return input.ready();
  };
  return PanResponder.create({
    onStartShouldSetPanResponder: admit,
    onMoveShouldSetPanResponder: admit,
    onPanResponderGrant: (event) => input.grant(event),
    onPanResponderStart: (event) => input.start(event),
    onPanResponderMove: (event) => input.move(event),
    onPanResponderEnd: (event) => input.end(event),
    onPanResponderRelease: (event) => input.release(event),
    onPanResponderTerminate: () => input.interrupt(),
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  });
}

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
  const commandLock = useRef<Lease | null>(null);

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

  // A capture belongs to the lease it was taken under, so ending the lease ends its capture at
  // once, rather than leaving it to block the next claim's.
  function endLease(lease: Lease) {
    if (commandLock.current !== lease) return;
    commandLock.current = null;
    const request = captureLock.current;
    if (!request) return;
    captureLock.current = null;
    captureAppearance.current = null;
    request.cancel('The picture changed before capture finished.');
    if (mounted.current) setPacket(null);
  }

  function claim(preempt: Lease['preempt']) {
    const lease: Lease = { preempt };
    commandLock.current = lease;
    return () => endLease(lease);
  }

  // Background work never refuses or delays the child: every foreground claim on the paper
  // passes through here first, so no caller can forget to make it yield.
  function preemptBackground() {
    const lease = commandLock.current;
    if (!lease?.preempt) return;
    endLease(lease);
    lease.preempt();
  }

  useImperativeHandle(
    ref,
    () => ({
      capturePng: (snapshot) => capture(snapshot, 'picture'),
      captureInk: (snapshot) => capture(snapshot, 'ink'),
      refreshGeometry,
      lockInput() {
        preemptBackground();
        if (input.hasActive() || commandLock.current)
          throw new Error('Finish drawing before using this control.');
        return claim(null);
      },
      lockBackground(onPreempt) {
        if (input.hasActive() || commandLock.current || captureLock.current)
          throw new Error('The drawing paper is in use.');
        return claim(onPreempt);
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

  return { captureLock, commandLock, preemptBackground };
}

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    container: { width: '100%', height: '100%' },
    inkPlane: { width: '100%', height: '100%' },
    paper: {
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      backgroundColor: palette.paper,
    },
  })
);
