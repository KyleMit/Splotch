import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { G } from 'react-native-svg';
import { checkpointMatches, planInk, type InkCheckpoint, type InkPlan } from './checkpoints';
import { InkScene } from './InkScene';
import { FixedInkCapture } from './FixedInkCapture';
import { DecodedPng } from './DecodedPng';
import { PAPER_WIDTH, PAPER_HEIGHT, type Stroke } from './model';
import { createSvgCapture, PNG_TIMEOUT_MS, type SvgCaptureJob } from './svgCapture';

export type RasterInkHandle = {
  readyPlan: (strokes: readonly Stroke[]) => InkPlan;
  isReady: () => boolean;
};
type Props = {
  strokes: readonly Stroke[];
  drafts?: readonly Stroke[];
  prepareEraser: boolean;
  onBusy: (busy: boolean) => void;
  onError: (error: unknown) => void;
};

export const RasterInk = forwardRef<RasterInkHandle, Props>(function RasterInk(props, ref) {
  const strokes = useMemo(
    () => (props.drafts?.length ? [...props.strokes, ...props.drafts] : props.strokes),
    [props.strokes, props.drafts]
  );
  const currentStrokes = useRef(strokes);
  currentStrokes.current = strokes;
  const [checkpoint, setCheckpoint] = useState<InkCheckpoint | null>(null);
  const [pending, setIncoming] = useState<InkCheckpoint | null>(null);
  const incoming = pending && checkpointMatches(strokes, pending) ? pending : null;
  const incomingRef = useRef(incoming);
  incomingRef.current = incoming;
  const [fault, setFault] = useState<unknown>(null);
  const loadedId = useRef<number | null>(null);
  const nextId = useRef(1);
  const plan = useMemo(
    () => planInk(strokes, checkpoint, props.prepareEraser),
    [strokes, checkpoint, props.prepareEraser]
  );
  const fixedSvg = useRef<Svg>(null);
  const [fixedReady, setFixedReady] = useState<InkPlan | null>(null);
  const imageReady = !plan.checkpoint || loadedId.current === plan.checkpoint.id;
  const ready = !fault && !incoming && !plan.needsCheckpoint && imageReady;
  const propsRef = useRef(props);
  propsRef.current = props;
  const working = useCheckpointJob({
    plan,
    ready: !fault && !incoming && imageReady && plan.needsCheckpoint && fixedReady === plan,
    svg: fixedSvg,
    onCheckpoint(base64, capturedPlan) {
      const next = { id: nextId.current++, strokes: capturedPlan.prefix, base64 };
      if (checkpointMatches(currentStrokes.current, next)) setIncoming(next);
    },
    onError(error) {
      setFault(error);
      propsRef.current.onError(error);
    },
  });

  useImperativeHandle(ref, () => ({
    isReady: () => ready && !working.current,
    readyPlan(requested) {
      if (
        !ready ||
        working.current ||
        propsRef.current.drafts?.length ||
        requested.length !== strokes.length ||
        requested.some((stroke, index) => stroke !== strokes[index])
      )
        throw new Error('This picture is still being prepared.');
      return plan;
    },
  }));
  useEffect(() => propsRef.current.onBusy(!ready), [ready]);

  useEffect(() => {
    if (pending && !incoming) setIncoming(null);
  }, [pending, incoming]);

  useEffect(() => {
    if (!incoming) return;
    const timeout = setTimeout(() => {
      if (incomingRef.current !== incoming) return;
      const error = new Error(
        'The prepared picture did not load. Your saved drawing is unchanged.'
      );
      setFault(error);
      incomingRef.current = null;
      setIncoming(null);
      propsRef.current.onError(error);
    }, PNG_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [incoming]);

  function imageLoaded(frame: InkCheckpoint) {
    if (incomingRef.current !== frame || !checkpointMatches(currentStrokes.current, frame)) return;
    loadedId.current = frame.id;
    incomingRef.current = null;
    setCheckpoint(frame);
    setIncoming(null);
  }

  function imageFailed(frame: InkCheckpoint, error: Error) {
    if (incomingRef.current !== frame || !checkpointMatches(currentStrokes.current, frame)) return;
    incomingRef.current = null;
    setIncoming(null);
    setFault(error);
    propsRef.current.onError(error);
  }

  const frames = [
    ...(plan.prefix.length === strokes.length
      ? [{ id: plan.checkpoint?.id ?? 0, plan, hidden: false }]
      : []),
    ...(incoming
      ? [{ id: incoming.id, plan: planInk(strokes, incoming, props.prepareEraser), hidden: true }]
      : []),
  ];
  return (
    <View style={styles.scene} pointerEvents="none">
      {plan.needsCheckpoint && !incoming && !fault ? (
        <FixedInkCapture
          plan={plan}
          svgRef={fixedSvg}
          onReady={() => setFixedReady(plan)}
          onError={(error) => {
            setFault(error);
            propsRef.current.onError(error);
          }}
        />
      ) : null}
      <RasterFrames frames={frames} onImageLoad={imageLoaded} onImageError={imageFailed} />
    </View>
  );
});

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
    const job = captures.capture(svg.current);
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
              onLoad={() => {
                if (frame.plan.checkpoint) onImageLoad(frame.plan.checkpoint);
              }}
              onError={(error) => {
                if (frame.plan.checkpoint) onImageError(frame.plan.checkpoint, error);
              }}
            />
          ) : null}
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}`}
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
        </Fragment>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  scene: { width: '100%', height: '100%', isolation: 'isolate' },
});
