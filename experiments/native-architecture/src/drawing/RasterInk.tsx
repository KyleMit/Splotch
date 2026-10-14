import { InkPaperScope, useInkPaper } from './InkPaper';
import { paperSize, samePaper, type PaperReference } from './paperSpace';
import {
  Fragment,
  forwardRef,
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
};
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
      </View>
    </CrayonTileResourceScope.Provider>
  );
});

function useRasterCheckpoint(props: Props, ref: ForwardedRef<RasterInkHandle>) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const drafts = props.drafts ?? [];
  const { plan, available, capturePlan, commitFrame } = useInkPlan(props);
  const checkpoint = (drafts.length ? available?.checkpoint : null) ?? plan.checkpoint;
  const displayStrokes = useMemo(
    () => [...props.strokes.slice(checkpoint?.strokes.length ?? 0), ...drafts],
    [props.strokes, checkpoint, props.drafts]
  );
  const { theme } = useInkAppearance();
  const tileResources = useCrayonTileResources(
    displayStrokes,
    theme,
    props.brush === 'crayon' ? props.color : undefined
  );
  const tiles = useCrayonTileReadiness(tileResources.uris, props.onError);
  const [pending, setPending] = useState<Incoming | null>(null);
  const [fault, setFault] = useState<unknown>(null);
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
        },
        plan: capturedPlan,
        brush: propsRef.current.brush,
        provisional: !plan.needsCheckpoint,
      });
    },
    onError(error) {
      setFault(error);
      propsRef.current.onError(error);
    },
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
  }, [incoming]);
  function imageLoaded(frame: InkCheckpoint) {
    const current = incomingRef.current;
    if (!current || current.frame !== frame) return;
    incomingRef.current = null;
    commitFrame(current);
    setPending(null);
  }
  function failImage(frame: InkCheckpoint, error: Error) {
    if (incomingRef.current?.frame !== frame) return;
    incomingRef.current = null;
    setPending(null);
    setFault(error);
    propsRef.current.onError(error);
  }
  return {
    tileResources,
    tileDecode: tiles.decode,
    capturePlan: capturePlan && !drafts.length && !incoming && !fault ? capturePlan : null,
    captureReady: () => setFixedReady(capturePlan),
    captureError(error: unknown) {
      setFault(error);
      propsRef.current.onError(error);
    },
    fixedSvg,
    frames: createRasterFrames(checkpoint, displayStrokes, props.strokes, incoming, plan.paper),
    imageLoaded,
    failImage,
  };
}

function createRasterFrames(
  checkpoint: InkCheckpoint | null,
  strokes: readonly Stroke[],
  prefix: readonly Stroke[],
  incoming: Incoming | null,
  paper: PaperReference
) {
  const displayPlan: InkPlan = {
    paper,
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
  const drafts = props.drafts ?? [];
  const [checkpoint, setCheckpoint] = useState<InkCheckpoint | null>(null);
  const [prepared, setPrepared] = useState<InkPreparation | null>(null);
  const predecessor = useMemo(
    () => planInk(props.strokes, checkpoint, paper),
    [props.strokes, checkpoint, paper]
  );
  const promoted =
    prepared &&
    samePaper(prepared.checkpoint.paper, paper) &&
    preparationWitnessed(props.strokes, prepared, predecessor.checkpoint)
      ? prepared
      : null;
  const plan = useMemo(
    () => planInk(props.strokes, promoted?.checkpoint ?? checkpoint, paper),
    [props.strokes, promoted, checkpoint, paper]
  );
  const available =
    prepared &&
    samePaper(prepared.checkpoint.paper, paper) &&
    sameStrokes(props.strokes, prepared.checkpoint.strokes) &&
    preparationMatches(props.strokes, prepared, plan.checkpoint) &&
    (drafts.length ? drafts[0].brush === prepared.brush : props.brush === prepared.brush)
      ? prepared
      : null;
  const prepare =
    !drafts.length &&
    !plan.needsCheckpoint &&
    needsPreparation(props.strokes, props.brush) &&
    !available;
  const capturePlan = useMemo(
    () => (plan.needsCheckpoint ? plan : prepare ? { ...plan, needsCheckpoint: true } : null),
    [plan, prepare, props.brush]
  );
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
  return { plan, available, capturePlan, commitFrame };
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
    const job = captures.capture(svg.current, paperSize(plan.paper));
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

function paperViewBox(paper: PaperReference) {
  const { width, height } = paperSize(paper);
  return `0 0 ${width} ${height}`;
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
              size={paperSize(frame.plan.paper)}
              onLoad={() => {
                if (frame.plan.checkpoint) onImageLoad(frame.plan.checkpoint);
              }}
              onError={(error) => {
                if (frame.plan.checkpoint) onImageError(frame.plan.checkpoint, error);
              }}
            />
          ) : null}
          <InkPaperScope.Provider value={frame.plan.paper}>
            <Svg
              width="100%"
              height="100%"
              viewBox={paperViewBox(frame.plan.paper)}
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
