import { InkPaperScope, useInkPaper, useInkProjection } from './InkPaper';
import {
  paperBounds,
  paperRasterSize,
  samePaperProjection,
  type PaperProjection,
  type PaperReference,
} from './paperSpace';
import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ForwardedRef,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Svg, G } from '../platform/svg';
import {
  planInk,
  sameStrokes,
  needsPreparation,
  preparationMatches,
  preparationWitnessed,
  type InkCheckpoint,
  type InkPlan,
  type InkPreparation,
} from './checkpoints';
import { useInkAppearance } from './InkAppearance';
import {
  CrayonTileResourceScope,
  useCrayonTileResources,
  useCrayonTileReadiness,
} from './useCrayonTileReadiness';
import type { PaintColor } from './palette';
import type { Brush } from './brushes';
import { InkScene } from './InkScene';
import { FixedInkCapture } from './FixedInkCapture';
import { DecodedPng } from './DecodedPng';
import type { Stroke } from './model';
import { createSvgCapture, PNG_TIMEOUT_MS, type SvgCaptureJob } from './svgCapture';
import type { UndoGhost } from './undoFeedback';
import type { PaperFrame } from './paperGeometry';
import { SvgUndoGhostLayer } from '../rsdDrawing/undoFeedbackSurface';

export type RasterInkHandle = {
  readyPlan: (strokes: readonly Stroke[]) => InkPlan;
  isReady: () => boolean;
  canStart: (strokes: readonly Stroke[], brush: Brush, active: boolean) => boolean;
};
type Props = {
  strokes: readonly Stroke[];
  drafts?: readonly Stroke[];
  brush: Brush;
  color: PaintColor;
  onBusy: (busy: boolean) => void;
  onError: (error: unknown) => void;
  undoGhost?: UndoGhost | null;
  paperFrame?: PaperFrame | null;
};
const NO_DRAFTS: readonly Stroke[] = [];
type Incoming = Readonly<{
  frame: InkCheckpoint;
  plan: InkPlan;
  brush: Brush;
  provisional: boolean;
}>;

export const RasterInk = forwardRef<RasterInkHandle, Props>(function RasterInk(props, ref) {
  const state = useRasterCheckpoint(props, ref);
  return (
    <CrayonTileResourceScope.Provider value={state.tileResources}>
      <View style={styles.scene} pointerEvents="none">
        {state.tileDecode}
        {state.capturePlan ? (
          <FixedInkCapture
            plan={state.capturePlan}
            svgRef={state.fixedSvg}
            onReady={state.captureReady}
            onError={state.captureError}
          />
        ) : null}
        <RasterFrames
          frames={state.frames}
          onImageLoad={state.imageLoaded}
          onImageError={state.failImage}
        />
        {props.undoGhost ? (
          <SvgUndoGhostLayer
            key={props.undoGhost.id}
            feedback={props.undoGhost}
            checkpoint={state.undoCheckpoint}
            frame={props.paperFrame ?? null}
          />
        ) : null}
      </View>
    </CrayonTileResourceScope.Provider>
  );
});

function useInkTiles(props: Props, strokes: readonly Stroke[]) {
  const { theme } = useInkAppearance();
  const tileResources = useCrayonTileResources(
    strokes,
    theme,
    props.brush === 'crayon' ? props.color : undefined
  );
  return { tileResources, ...useCrayonTileReadiness(tileResources.uris, props.onError) };
}

function useRasterFault(props: RefObject<Props>) {
  const [fault, setFault] = useState<unknown>(null);
  const reportFault = useCallback(
    (error: unknown) => {
      setFault(error);
      props.current.onError(error);
    },
    [props]
  );
  return { fault, reportFault };
}

function useRasterCheckpoint(props: Props, ref: ForwardedRef<RasterInkHandle>) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const drafts = props.drafts ?? NO_DRAFTS;
  const { plan, available, capturePlan, commitFrame, undoCheckpoint } = useInkPlan(props);
  const checkpoint = (drafts.length ? available?.checkpoint : null) ?? plan.checkpoint;
  const displayStrokes = useMemo(
    () => [...props.strokes.slice(checkpoint?.strokes.length ?? 0), ...drafts],
    [props.strokes, checkpoint, drafts]
  );
  const { tileResources, ...tiles } = useInkTiles(props, displayStrokes);
  const [pending, setPending] = useState<Incoming | null>(null);
  const { fault, reportFault } = useRasterFault(propsRef);
  const nextId = useRef(1);
  const incoming = pending && pending.plan === capturePlan ? pending : null;
  const incomingRef = useRef(incoming);
  incomingRef.current = incoming;
  const fixedSvg = useRef<Svg>(null);
  const [fixedReady, setFixedReady] = useState<InkPlan | null>(null);
  const canonicalReady = !fault && !plan.needsCheckpoint && tiles.ready;
  const inputReady =
    canonicalReady &&
    !incoming &&
    (drafts.length > 0 || !needsPreparation(props.strokes, props.brush) || !!available);
  const working = useCheckpointJob({
    plan: capturePlan ?? plan,
    ready:
      !drafts.length &&
      !fault &&
      tiles.ready &&
      !incoming &&
      capturePlan !== null &&
      fixedReady === capturePlan,
    svg: fixedSvg,
    onCheckpoint(base64, capturedPlan) {
      setPending({
        frame: {
          id: nextId.current++,
          strokes: capturedPlan.prefix,
          base64,
          paper: capturedPlan.paper,
          projection: capturedPlan.projection,
        },
        plan: capturedPlan,
        brush: propsRef.current.brush,
        provisional: !plan.needsCheckpoint,
      });
    },
    onError: reportFault,
  });
  useImperativeHandle(ref, () => ({
    isReady: () => inputReady && !working.current,
    canStart(requested, brush, active) {
      return (
        sameStrokes(requested, props.strokes) &&
        canonicalReady &&
        !working.current &&
        !incoming &&
        (active || (brush === props.brush && inputReady))
      );
    },
    readyPlan(requested) {
      if (
        !canonicalReady ||
        working.current ||
        incoming ||
        propsRef.current.drafts?.length ||
        !sameStrokes(requested, props.strokes)
      )
        throw new Error('This picture is still being prepared.');
      return plan;
    },
  }));
  useEffect(() => propsRef.current.onBusy(!inputReady), [inputReady]);
  useEffect(() => {
    if (pending && !incoming) setPending(null);
  }, [pending, incoming]);
  const failImage = useCallback(
    (frame: InkCheckpoint, error: Error) => {
      if (incomingRef.current?.frame !== frame) return;
      incomingRef.current = null;
      setPending(null);
      reportFault(error);
    },
    [reportFault]
  );
  useEffect(() => {
    if (!incoming) return;
    const timeout = setTimeout(() => {
      if (incomingRef.current !== incoming) return;
      failImage(
        incoming.frame,
        new Error('The prepared picture did not load. Your saved drawing is unchanged.')
      );
    }, PNG_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [incoming, failImage]);
  function imageLoaded(frame: InkCheckpoint) {
    const current = incomingRef.current;
    if (!current || current.frame !== frame) return;
    incomingRef.current = null;
    commitFrame(current);
    setPending(null);
  }
  return {
    undoCheckpoint,
    tileResources,
    tileDecode: tiles.decode,
    capturePlan: capturePlan && !drafts.length && !incoming && !fault ? capturePlan : null,
    captureReady: () => setFixedReady(capturePlan),
    captureError: reportFault,
    fixedSvg,
    frames: createRasterFrames(
      checkpoint,
      displayStrokes,
      props.strokes,
      incoming,
      plan.paper,
      plan.projection
    ),
    imageLoaded,
    failImage,
  };
}

function createRasterFrames(
  checkpoint: InkCheckpoint | null,
  strokes: readonly Stroke[],
  prefix: readonly Stroke[],
  incoming: Incoming | null,
  paper: PaperReference,
  projection: PaperProjection
) {
  const displayPlan: InkPlan = {
    paper,
    projection,
    checkpoint,
    strokes,
    prefix,
    needsCheckpoint: false,
  };
  const frames = [
    { id: checkpoint?.id ?? 0, plan: displayPlan, hidden: false },
    ...(incoming
      ? [
          {
            id: incoming.frame.id,
            plan: {
              paper: incoming.frame.paper,
              projection: incoming.frame.projection,
              checkpoint: incoming.frame,
              strokes: [],
              prefix: incoming.frame.strokes,
              needsCheckpoint: false,
            },
            hidden: true,
          },
        ]
      : []),
  ];
  return frames;
}

function useInkPlan(props: Pick<Props, 'strokes' | 'drafts' | 'brush'>) {
  const paper = useInkPaper();
  const projection = useInkProjection();
  const drafts = props.drafts ?? NO_DRAFTS;
  const [checkpoint, setCheckpoint] = useState<InkCheckpoint | null>(null);
  const [prepared, setPrepared] = useState<InkPreparation | null>(null);
  const predecessor = useMemo(
    () => planInk(props.strokes, checkpoint, paper, projection),
    [props.strokes, checkpoint, paper, projection]
  );
  const promoted =
    prepared &&
    samePaperProjection(prepared.checkpoint.projection, projection) &&
    preparationWitnessed(props.strokes, prepared, predecessor.checkpoint)
      ? prepared
      : null;
  const plan = useMemo(
    () => planInk(props.strokes, promoted?.checkpoint ?? checkpoint, paper, projection),
    [props.strokes, promoted, checkpoint, paper, projection]
  );
  const available =
    prepared &&
    samePaperProjection(prepared.checkpoint.projection, projection) &&
    sameStrokes(props.strokes, prepared.checkpoint.strokes) &&
    preparationMatches(props.strokes, prepared, plan.checkpoint) &&
    (drafts.length ? drafts[0].brush === prepared.brush : props.brush === prepared.brush)
      ? prepared
      : null;
  // The brush decides whether the paper prepares, so a switch between two brushes that both
  // prepare starts a new preparation rather than finishing the old one under the new brush.
  const capturePlan = useMemo(() => {
    if (plan.needsCheckpoint) return plan;
    const prepare = !drafts.length && needsPreparation(props.strokes, props.brush) && !available;
    return prepare ? { ...plan, needsCheckpoint: true } : null;
  }, [plan, drafts.length, props.strokes, props.brush, available]);
  useEffect(() => {
    if (promoted) {
      setCheckpoint(promoted.checkpoint);
      setPrepared(null);
    } else {
      if (checkpoint && predecessor.checkpoint !== checkpoint) setCheckpoint(null);
      if (prepared && !available) setPrepared(null);
    }
  }, [promoted, prepared, available, checkpoint, predecessor.checkpoint]);
  function commitFrame(current: Incoming) {
    if (current.provisional)
      setPrepared({
        checkpoint: current.frame,
        predecessor: current.plan.checkpoint,
        brush: current.brush,
      });
    else setCheckpoint(current.frame);
  }
  return {
    plan,
    available,
    capturePlan,
    commitFrame,
    undoCheckpoint: promoted?.checkpoint ?? checkpoint,
  };
}

function useCheckpointJob(options: {
  plan: InkPlan;
  ready: boolean;
  svg: RefObject<Svg | null>;
  onCheckpoint: (base64: string, plan: InkPlan) => void;
  onError: (error: unknown) => void;
}) {
  const current = useRef(options);
  current.current = options;
  const active = useRef<SvgCaptureJob | null>(null);
  const epoch = useRef(0);
  const captures = useRef(createSvgCapture()).current;
  const { plan, ready, svg } = options;
  useEffect(() => {
    const revision = ++epoch.current;
    if (!ready) return;
    const job = captures.capture(svg.current, paperRasterSize(plan.projection));
    active.current = job;
    const valid = () =>
      epoch.current === revision &&
      active.current === job &&
      current.current.plan === plan &&
      current.current.ready;
    void job.promise
      .then((base64) => {
        if (valid()) current.current.onCheckpoint(base64, plan);
      })
      .catch((error: unknown) => {
        if (valid()) current.current.onError(error);
      })
      .finally(() => {
        if (active.current === job) active.current = null;
      });
    return () => {
      epoch.current += 1;
      if (active.current === job) active.current = null;
      job.cancel();
    };
  }, [plan, ready, svg, captures]);
  useEffect(
    () => () => {
      epoch.current += 1;
      captures.dispose();
    },
    [captures]
  );
  return active;
}

function paperViewBox(plan: InkPlan) {
  const { x, y, width, height } = paperBounds(plan.projection);
  return `${x} ${y} ${width} ${height}`;
}

function RasterFrames({
  frames,
  onImageLoad,
  onImageError,
}: {
  frames: readonly { id: number; plan: InkPlan; hidden: boolean }[];
  onImageLoad: (frame: InkCheckpoint) => void;
  onImageError: (frame: InkCheckpoint, error: Error) => void;
}) {
  return (
    <>
      {frames.map((frame) => (
        <Fragment key={frame.id}>
          {frame.hidden && frame.plan.checkpoint ? (
            <DecodedPng
              key={frame.plan.checkpoint.id}
              base64={frame.plan.checkpoint.base64}
              size={paperRasterSize(frame.plan.projection)}
              onLoad={() => {
                if (frame.plan.checkpoint) onImageLoad(frame.plan.checkpoint);
              }}
              onError={(error) => {
                if (frame.plan.checkpoint) onImageError(frame.plan.checkpoint, error);
              }}
            />
          ) : null}
          <InkPaperScope.Provider value={frame.plan.projection}>
            <Svg
              width="100%"
              height="100%"
              viewBox={paperViewBox(frame.plan)}
              preserveAspectRatio="xMidYMid meet"
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              <G opacity={frame.hidden ? 0 : 1}>
                <InkScene
                  checkpoint={frame.plan.checkpoint}
                  strokes={frame.plan.strokes}
                  onImageLoad={() => {
                    if (Platform.OS !== 'android' && frame.plan.checkpoint)
                      onImageLoad(frame.plan.checkpoint);
                  }}
                />
              </G>
            </Svg>
          </InkPaperScope.Provider>
        </Fragment>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  scene: { width: '100%', height: '100%', isolation: 'isolate' },
});
