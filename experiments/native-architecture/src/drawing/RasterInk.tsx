import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G } from 'react-native-svg';
import { checkpointMatches, planInk, type InkCheckpoint, type InkPlan } from './checkpoints';
import { InkScene } from './InkScene';
import { FixedInkCapture } from './FixedInkCapture';
import { PAPER_WIDTH, PAPER_HEIGHT, type Stroke } from './model';
import { createSvgCapture, PNG_TIMEOUT_MS } from './svgCapture';

export type RasterInkHandle = {
  capturePng: () => Promise<string>;
  isReady: () => boolean;
};
type Props = {
  strokes: readonly Stroke[];
  draft?: Stroke | null;
  prepareEraser: boolean;
  onBusy: (busy: boolean) => void;
  onError: (error: unknown) => void;
};

export const RasterInk = forwardRef<RasterInkHandle, Props>(function RasterInk(props, ref) {
  const strokes = useMemo(
    () => (props.draft ? [...props.strokes, props.draft] : props.strokes),
    [props.strokes, props.draft]
  );
  const currentStrokes = useRef(strokes);
  currentStrokes.current = strokes;
  const [checkpoint, setCheckpoint] = useState<InkCheckpoint | null>(null);
  const [incoming, setIncoming] = useState<InkCheckpoint | null>(null);
  const [settled, setSettled] = useState(0);
  const mounted = useRef(true);
  const [fault, setFault] = useState<unknown>(null);
  const loadedId = useRef<number | null>(null);
  const nextId = useRef(1);
  const epoch = useRef(0);
  const working = useRef(false);
  const svg = useRef<Svg>(null);
  const captures = useRef(createSvgCapture()).current;
  const plan = useMemo(
    () => planInk(strokes, checkpoint, props.prepareEraser),
    [strokes, checkpoint, props.prepareEraser]
  );
  const fixedSvg = useRef<Svg>(null);
  const [fixedReady, setFixedReady] = useState<typeof plan | null>(null);
  const imageReady = !plan.checkpoint || loadedId.current === plan.checkpoint.id;
  const ready = !fault && !incoming && !plan.needsCheckpoint && imageReady;
  const propsRef = useRef(props);
  propsRef.current = props;

  useImperativeHandle(ref, () => ({
    isReady: () => ready,
    capturePng: () =>
      ready
        ? captures.capture(svg.current)
        : Promise.reject(new Error('This picture is still being prepared.')),
  }));

  useEffect(() => {
    propsRef.current.onBusy(!ready);
  }, [ready]);

  useEffect(() => {
    const revision = ++epoch.current;
    if (
      fault ||
      incoming ||
      working.current ||
      !imageReady ||
      !plan.needsCheckpoint ||
      fixedReady !== plan
    )
      return;
    working.current = true;
    void captures
      .capture(fixedSvg.current)
      .then((base64) => {
        if (epoch.current !== revision) return;
        const next = { id: nextId.current++, strokes: plan.prefix, base64 };
        if (checkpointMatches(currentStrokes.current, next)) setIncoming(next);
      })
      .catch((error: unknown) => {
        if (epoch.current !== revision) return;
        setFault(error);
        propsRef.current.onError(error);
      })
      .finally(() => {
        working.current = false;
        if (mounted.current) setSettled((value) => value + 1);
      });
  }, [plan, incoming, fault, imageReady, captures, settled, fixedReady]);

  useEffect(() => {
    if (!incoming) return;
    const timeout = setTimeout(() => {
      const error = new Error(
        'The prepared picture did not load. Your saved drawing is unchanged.'
      );
      setFault(error);
      setIncoming(null);
      propsRef.current.onError(error);
    }, PNG_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [incoming]);

  useEffect(
    () => () => {
      epoch.current += 1;
      mounted.current = false;
      captures.dispose();
    },
    [captures]
  );

  function imageLoaded(frame: InkCheckpoint) {
    if (incoming !== frame || !checkpointMatches(currentStrokes.current, frame)) return;
    loadedId.current = frame.id;
    setCheckpoint(frame);
    setIncoming(null);
  }

  const frames = [
    { id: plan.checkpoint?.id ?? 0, plan, hidden: false },
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
      <RasterFrames frames={frames} svg={svg} onImageLoad={imageLoaded} />
    </View>
  );
});

function RasterFrames({
  frames,
  svg,
  onImageLoad,
}: {
  frames: readonly { id: number; plan: InkPlan; hidden: boolean }[];
  svg: RefObject<Svg | null>;
  onImageLoad: (frame: InkCheckpoint) => void;
}) {
  return (
    <>
      {frames.map((frame) => (
        <Svg
          key={frame.id}
          ref={frame.hidden ? undefined : svg}
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
                if (frame.plan.checkpoint) onImageLoad(frame.plan.checkpoint);
              }}
            />
          </G>
        </Svg>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  scene: { width: '100%', height: '100%', isolation: 'isolate' },
});
