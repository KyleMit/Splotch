import { InkPaperScope } from './InkPaper';
import type { CapturedPaper } from './interactions';
export type { CapturedPaper } from './interactions';
import {
  drawingPaper,
  paperBounds,
  paperProjection,
  type PaperProjection,
  type PaperReference,
} from './paperSpace';
import { useDrawingAppearance } from './DrawingAppearance';
import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
  type RefObject,
  type ReactNode,
} from 'react';
import {
  PixelRatio,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewInstance,
} from 'react-native';
import type { Drawing } from './model';
import { createContactResponder, type ContactDrawingProps } from './contactResponder';
import { createPaperGeometry } from './paperGeometry';
import { measurePaper } from './measurePaper';
import { pageArt } from './pageArtResource';
import { InkLayer } from './InkLayer';
import { PictureCapture, type PictureRequest } from './pictureCaptureSurface';
import { PAPER_THEMES } from './theme';
import { InkAppearanceScope, type InkAppearance } from './InkAppearance';
import { useSurfacePackets } from './useSurfacePackets';
import { PaperInputView } from './PaperInputView';
import { PAPER_INPUT_TEST_ID } from '../platform/firstFrameContract';
import { PointerHalos } from './PointerHalos';
import { createHaloFeed } from './haloFeed';
import { createLiveInkFeed } from './liveInk';
import type { Halo } from './haloModel';
import type { UndoGhost } from './undoFeedback';
import type { DepartingInk } from './departingInk';
import { useSurfaceCommitProbe } from './perfProbe';

export type ExportedPaper = CapturedPaper | Readonly<{ base64: null; isCurrent: () => boolean }>;

export type DrawingSurfaceHandle = {
  capturePng: (snapshot: Drawing) => Promise<string>;
  captureAiPng: (snapshot: Drawing) => Promise<CapturedPaper>;
  // The saved picture: the shipping export's pixel grid, paper color and grain.
  exportPng: (snapshot: Drawing) => Promise<ExportedPaper>;
  captureInk: (snapshot: Drawing) => Promise<CapturedPaper>;
  // The committed ink's pixels for the page Clear sends away, or null where no native layer holds them.
  departingInk: () => DepartingInk | null;
  lockInput: (mode?: 'command' | 'undo') => () => void;
  finishInput: () => void;
  // A lease for work the child never asked for. Any foreground claim on the paper (a fresh
  // contact, lockInput) ends it first, ending its capture and calling onPreempt; it is refused
  // while anything else holds the paper.
  lockBackground: (onPreempt: () => void) => () => void;
  refreshGeometry: () => void;
};

type Lease = Readonly<{ preempt: (() => void) | null }>;
export type DrawingSurfaceProps = ContactDrawingProps & {
  drawing: Drawing;
  projection: PaperProjection;
  undoGhost?: UndoGhost | null;
  onPreparingChange: (busy: boolean) => void;
  onRendererFault: (error: unknown) => void;
  // What the paper shows beneath the ink, in place of a plain sheet: the drawing screen's paper
  // grain, or null where the slot around a sheet that fills it already wears that grain.
  underlay?: ReactNode;
};

// The surface renders only when a cohort starts or ends (its paper is the live paper while one
// is drawing); live ink and halos go straight to their own layers.
function useLiveCohort() {
  const [paper, setPaper] = useState<PaperReference | null>(null);
  const halos = useRef(createHaloFeed()).current;
  const ink = useRef(createLiveInkFeed()).current;
  const show = useCallback(
    (next: PaperReference | null, live: readonly Halo[]) => {
      setPaper(next);
      halos.publish(live);
    },
    [halos]
  );
  return { paper, halos, ink, show };
}

function surfaceUndoGhost(props: DrawingSurfaceProps, drawing: boolean) {
  return !drawing && props.undoGhost?.after === props.drawing ? props.undoGhost : null;
}

export const DrawingSurface = forwardRef<DrawingSurfaceHandle, DrawingSurfaceProps>(
  function DrawingSurface(props, ref) {
    useSurfaceCommitProbe();
    const theme = useDrawingAppearance();
    const PageArt = pageArt().current()?.PageArtMotion;
    const appearance = useMemo<InkAppearance>(
      () => ({ pageId: props.drawing.pageId, theme }),
      [props.drawing.pageId, theme]
    );
    const propsRef = useRef(props);
    propsRef.current = props;
    const paper = useRef<ViewInstance>(null);
    const inputRef = useRef<ReturnType<typeof createContactResponder> | null>(null);
    const geometry = useRef(createPaperGeometry()).current;
    const live = useLiveCohort();
    const paperReference = live.paper ?? drawingPaper(props.drawing);
    const projectionRef = useRef(paperProjection(paperReference));
    // Created once; the responder connects its cohort to the live ink feed when it attaches.
    const [input] = useState(() =>
      createContactResponder(
        () => ({
          ...propsRef.current,
          projection: projectionRef.current,
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
        live.show,
        () => PixelRatio.get(),
        live.ink
      )
    );
    inputRef.current = input;
    useLayoutEffect(() => {
      if (props.disabled) input.silence();
    }, [input, props.disabled]);
    const refreshGeometry = useCallback(() => {
      geometry.refresh((complete) => measurePaper(paper.current, complete));
    }, [geometry]);
    const [projection, layoutPlane] = usePresentedPaper(
      paperReference,
      props.projection,
      refreshGeometry
    );
    const presented = paperBounds(projection);
    projectionRef.current = projection;
    const [packet, setPacket] = useState<PictureRequest | null>(null);
    const { captureLock, commandLock, preemptBackground, raster, attachRaster, resume } =
      useSurfaceCapture(
        input,
        ref,
        setPacket,
        props.drawing,
        props.currentDrawing,
        appearance,
        projection,
        refreshGeometry
      );
    useLayoutEffect(() => {
      input.attach();
      refreshGeometry();
      return () => {
        input.detach();
        geometry.clear();
      };
    }, [input, geometry, refreshGeometry]);
    useLayoutEffect(
      () => input.observeInputStyle(),
      [input, props.color, props.brush, props.eraserWidth]
    );
    const ink = useInkHandlers(propsRef, input, resume);

    return (
      <InkPaperScope.Provider value={projection}>
        <InkAppearanceScope.Provider value={appearance}>
          <View style={styles.container}>
            <View
              style={[
                styles.paper,
                props.underlay === undefined && {
                  backgroundColor: PAPER_THEMES[appearance.theme].paper,
                },
              ]}
            >
              {props.underlay}
              <PaperInputView
                ref={paper}
                accessibilityLabel="Drawing paper"
                testID={PAPER_INPUT_TEST_ID}
                style={styles.inkPlane}
                onLayout={layoutPlane}
                onClaim={preemptBackground}
                engineReady={() => input.isReady()}
                onInput={(value) => input.receiveInput(value)}
                onHover={(sample) => input.hover(sample)}
                erasing={props.brush === 'eraser'}
              >
                {/* Committed ink holds Magic colors; appearance changes must replay semantic strokes. */}
                <InkLayer
                  key={`${appearance.pageId}:${appearance.theme}`}
                  ref={attachRaster}
                  strokes={props.drawing.strokes}
                  undoGhost={surfaceUndoGhost(props, live.paper !== null)}
                  paperFrame={geometry.current()}
                  live={live.ink}
                  brush={props.brush}
                  color={props.color}
                  onBusy={ink.onBusy}
                  onError={ink.onError}
                />
                {PageArt ? <PageArt pageId={props.drawing.pageId} size={presented} /> : null}
                <PointerHalos feed={live.halos} />
              </PaperInputView>
            </View>
            {packet ? <PictureCapture key={packet.id} packet={packet} /> : null}
          </View>
        </InkAppearanceScope.Provider>
      </InkPaperScope.Provider>
    );
  }
);

// Stable, so the memoized native ink layer renders for what it draws and not for every surface
// render (the input's disabled flag, a stroke width, a cohort starting).
function useInkHandlers(
  propsRef: RefObject<DrawingSurfaceProps>,
  input: ReturnType<typeof createContactResponder>,
  resume: () => void
) {
  const onBusy = useCallback(
    (busy: boolean) => {
      propsRef.current.onPreparingChange(busy);
      if (!busy) resume();
    },
    [propsRef, resume]
  );
  const onError = useCallback(
    (error: unknown) => {
      input.detach();
      propsRef.current.onRendererFault(error);
    },
    [propsRef, input]
  );
  return { onBusy, onError };
}

// A blank picture shows as the paper it would adopt from the ink plane's live size.
function usePresentedPaper(
  paper: PaperReference,
  supplied: PaperProjection,
  refreshGeometry: () => void
) {
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
  const projection = useMemo(
    () =>
      supplied.paper === paper
        ? supplied
        : paperProjection(
            paper,
            paper.kind === 'unadopted' && plane.width > 0 && plane.height > 0 ? plane : undefined
          ),
    [paper, supplied, plane]
  );
  return [projection, layout] as const;
}

function useSurfaceCapture(
  input: ReturnType<typeof createContactResponder>,
  ref: ForwardedRef<DrawingSurfaceHandle>,
  setPacket: (packet: PictureRequest | null) => void,
  drawing: Drawing,
  currentDrawing: () => Drawing,
  appearance: InkAppearance,
  projection: PaperProjection,
  refreshGeometry: () => void
) {
  const commandLock = useRef<Lease | null>(null);
  const { capture, captureLock, raster, attachRaster, resume, cancel } = useSurfacePackets({
    inputActive: () => input.hasActive(),
    currentDrawing,
    drawing,
    appearance,
    projection,
    commandLock,
    setPacket,
  });

  // A capture belongs to the lease it was taken under, so ending the lease ends its capture at
  // once, rather than leaving it to block the next claim's.
  const endLease = useCallback(
    (lease: Lease) => {
      if (commandLock.current !== lease) return;
      commandLock.current = null;
      cancel();
    },
    [cancel]
  );

  const claim = useCallback(
    (preempt: Lease['preempt']) => {
      const lease: Lease = { preempt };
      commandLock.current = lease;
      return () => endLease(lease);
    },
    [endLease]
  );

  // Background work never refuses or delays the child: every foreground claim on the paper
  // passes through here first, so no caller can forget to make it yield.
  const preemptBackground = useCallback(() => {
    const lease = commandLock.current;
    if (!lease?.preempt) return;
    endLease(lease);
    lease.preempt();
  }, [endLease]);

  useImperativeHandle(
    ref,
    () => ({
      capturePng: async (snapshot) => (await capture(snapshot, 'picture').promise).base64,
      captureAiPng: async (snapshot) => capture(snapshot, 'ai').promise,
      exportPng: async (snapshot) => {
        const output = capture(snapshot, 'export');
        return output.promise.catch(() => ({ base64: null, isCurrent: output.isCurrent }));
      },
      captureInk: async (snapshot) => capture(snapshot, 'ink').promise,
      departingInk: () => raster.current?.departingInk() ?? null,
      refreshGeometry,
      finishInput() {
        preemptBackground();
        input.finishInput();
      },
      lockInput(mode = 'command') {
        preemptBackground();
        if ((mode === 'command' && input.hasActive()) || commandLock.current)
          throw new Error('Finish drawing before using this control.');
        return claim(null);
      },
      lockBackground(onPreempt) {
        if (input.hasActive() || commandLock.current || captureLock.current)
          throw new Error('The drawing paper is in use.');
        return claim(onPreempt);
      },
    }),
    [capture, captureLock, claim, input, preemptBackground, raster, refreshGeometry]
  );

  return { captureLock, commandLock, preemptBackground, raster, attachRaster, resume };
}

const styles = StyleSheet.create({
  container: { width: '100%', height: '100%' },
  inkPlane: { width: '100%', height: '100%' },
  paper: { width: '100%', height: '100%', overflow: 'hidden' },
});
