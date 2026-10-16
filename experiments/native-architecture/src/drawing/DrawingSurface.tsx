import { InkPaperScope } from './InkPaper';
import { drawingPaper, presentedPaperSize, type PaperReference } from './paperSpace';
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
  type ReactNode,
} from 'react';
import { PixelRatio, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Svg } from '../platform/svg';
import type { Drawing, Stroke } from './model';
import { createContactResponder, type ContactDrawingProps } from './contactResponder';
import { createPaperGeometry } from './paperGeometry';
import { measurePaper } from './measurePaper';
import { PageOutline, pageHasOutline } from './PageOutline';
import { InkLayer } from './InkLayer';
import { PictureCapture, type PictureRequest } from './PictureCapture';
import { PAPER_THEMES } from './theme';
import { InkAppearanceScope, type InkAppearance } from './InkAppearance';
import { useSurfacePackets } from './useSurfacePackets';
import { PaperInputView } from './PaperInputView';
import { PointerHalos } from './PointerHalos';
import { createHaloFeed } from './haloFeed';
import type { Halo } from './haloModel';
import type { UndoGhost } from './undoFeedback';

export type DrawingSurfaceHandle = {
  capturePng: (snapshot: Drawing) => Promise<string>;
  captureAiPng: (snapshot: Drawing) => Promise<string>;
  // The saved picture: the shipping export's pixel grid, paper color and grain.
  exportPng: (snapshot: Drawing) => Promise<string>;
  captureInk: (snapshot: Drawing) => Promise<string>;
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
  undoGhost?: UndoGhost | null;
  onPreparingChange: (busy: boolean) => void;
  onRendererFault: (error: unknown) => void;
  // What the paper shows beneath the ink, in place of a plain sheet: the drawing screen's paper
  // grain, or null where the slot around a sheet that fills it already wears that grain.
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

function surfaceUndoGhost(props: DrawingSurfaceProps, drafts: readonly Stroke[]) {
  return !drafts.length && props.undoGhost?.after === props.drawing ? props.undoGhost : null;
}

export const DrawingSurface = forwardRef<DrawingSurfaceHandle, DrawingSurfaceProps>(
  function DrawingSurface(props, ref) {
    const theme = useDrawingAppearance();
    const appearance = useMemo<InkAppearance>(
      () => ({ pageId: props.drawing.pageId, theme }),
      [props.drawing.pageId, theme]
    );
    const propsRef = useRef(props);
    propsRef.current = props;
    const paper = useRef<View>(null);
    const inputRef = useRef<ReturnType<typeof createContactResponder> | null>(null);
    const geometry = useRef(createPaperGeometry()).current;
    const { draft, halos, show } = useLiveDraft();
    const paperReference = draft.paper ?? drawingPaper(props.drawing);
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
    const { captureLock, commandLock, preemptBackground, raster, attachRaster, resume } =
      useSurfaceCapture(
        input,
        ref,
        setPacket,
        props.drawing,
        props.currentDrawing,
        appearance,
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
    useLayoutEffect(() => input.observeInputStyle(), [input, props.color, props.brush]);

    return (
      <InkPaperScope.Provider value={paperReference}>
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
                testID="drawing-paper"
                style={styles.inkPlane}
                onLayout={layoutPlane}
                onClaim={preemptBackground}
                onInput={(value) => input.receiveInput(value)}
              >
                {/* Committed ink holds Magic colors; appearance changes must replay semantic strokes. */}
                <InkLayer
                  key={`${appearance.pageId}:${appearance.theme}`}
                  ref={attachRaster}
                  strokes={props.drawing.strokes}
                  undoGhost={surfaceUndoGhost(props, draft.strokes)}
                  paperFrame={geometry.current()}
                  drafts={draft.strokes}
                  brush={props.brush}
                  color={props.color}
                  onBusy={(busy) => {
                    props.onPreparingChange(busy);
                    if (!busy) resume();
                  }}
                  onError={(error) => {
                    input.detach();
                    props.onRendererFault(error);
                  }}
                />
                {/* react-native-svg paints a full-paper bitmap on Android even when it is empty. */}
                {pageHasOutline(props.drawing.pageId) ? (
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
                ) : null}
                <PointerHalos feed={halos} />
              </PaperInputView>
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

function useSurfaceCapture(
  input: ReturnType<typeof createContactResponder>,
  ref: ForwardedRef<DrawingSurfaceHandle>,
  setPacket: (packet: PictureRequest | null) => void,
  drawing: Drawing,
  currentDrawing: () => Drawing,
  appearance: InkAppearance,
  refreshGeometry: () => void
) {
  const commandLock = useRef<Lease | null>(null);
  const { capture, captureLock, raster, attachRaster, resume, cancel } = useSurfacePackets({
    inputActive: () => input.hasActive(),
    currentDrawing,
    drawing,
    appearance,
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
      capturePng: (snapshot) => capture(snapshot, 'picture'),
      captureAiPng: (snapshot) => capture(snapshot, 'ai'),
      exportPng: (snapshot) => capture(snapshot, 'export'),
      captureInk: (snapshot) => capture(snapshot, 'ink'),
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
    [capture, captureLock, claim, input, preemptBackground, refreshGeometry]
  );

  return { captureLock, commandLock, preemptBackground, raster, attachRaster, resume };
}

const styles = StyleSheet.create({
  container: { width: '100%', height: '100%' },
  inkPlane: { width: '100%', height: '100%' },
  paper: { width: '100%', height: '100%', overflow: 'hidden' },
});
