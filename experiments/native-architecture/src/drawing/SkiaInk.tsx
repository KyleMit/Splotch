import { useInkPaper, useInkProjection } from './InkPaper';
import {
  artOrientation,
  paperKey,
  paperBounds,
  samePaperProjection,
  type PaperProjection,
  type PaperSize,
} from './paperSpace';
import {
  forwardRef,
  memo,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PixelRatio, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Skia, SkiaPictureView, type SkImage } from '@shopify/react-native-skia';
import { sameStrokes, type InkPlan } from './checkpoints';
import { useInkAppearance } from './InkAppearance';
import { useCrayonTileResources } from './useCrayonTileReadiness';
import type { CrayonTileResources } from './crayonTiles';
import { isFarmPageId } from './bundledBooks';
import { bundledFill } from './bundledBookAssets';
import { isOfflinePageId } from '../offlineLibrary/identity';
import { OfflineArtworkScope } from '../offlineLibrary/artworkContext';
import type { PageId } from './pages';
import type { PaperTheme } from './theme';
import { decodeDataUriImage, type InkPaintContext } from './skiaInkPainter';
import type { Stroke } from './model';
import type { RasterInkHandle } from './RasterInk';
import type { UndoGhost } from './undoFeedback';
import { SkiaUndoGhost, type PreviousInk } from './SkiaUndoGhost';
import { perfSubmitted, useInkCommitProbe } from './perfProbe';
import type { InkLayerProps } from './inkLayerProps';
import type { LiveInkFeed } from './liveInk';
import { createInkScene, type InkScene, type SceneInput } from './skiaInkScene';
import { createInkLayer } from './skiaInkLayer';
import { orderedOps } from './inkOps';
import { showPicture } from './skiaViewPicture';

type Size = Readonly<{ width: number; height: number }>;
type GhostCue = { feedback: UndoGhost; size: Size | null; ink: PreviousInk | null };
type SceneState = Readonly<{
  input: SceneInput | null;
  error: unknown;
  previous: PreviousInk | null;
  after: SkImage | null;
}>;

async function loadUriImage(uri: string): Promise<SkImage> {
  if (uri.startsWith('data:')) return decodeDataUriImage(uri);
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!image) throw new Error('The coloring page fill could not be decoded.');
  return image;
}

// A blank picture shows as the paper its ink plane would adopt, so the fill a first Magic
// contact needs is already decoded for that paper's art orientation.
function useBookFill(
  pageId: PageId,
  theme: PaperTheme,
  paper: PaperSize,
  onError: (error: unknown) => void
) {
  const offline = useContext(OfflineArtworkScope);
  const uri = isFarmPageId(pageId)
    ? bundledFill(pageId, theme, paper)
    : isOfflinePageId(pageId)
      ? (offline[pageId]?.[artOrientation(paper)][theme].fill ?? null)
      : null;
  const [loaded, setLoaded] = useState<Readonly<{ uri: string; image: SkImage }> | null>(null);
  const reportError = useRef(onError);
  reportError.current = onError;
  useEffect(() => {
    if (!uri) return;
    let current = true;
    loadUriImage(uri).then(
      (image) => {
        if (current) setLoaded({ uri, image });
      },
      (error: unknown) => {
        if (current) reportError.current(error);
      }
    );
    return () => {
      current = false;
    };
  }, [uri]);
  const needed = isFarmPageId(pageId) || isOfflinePageId(pageId);
  const image = loaded && loaded.uri === uri ? loaded.image : null;
  return { needed, image, ready: !needed || image !== null };
}

function useInkContext(
  projection: PaperProjection,
  tiles: CrayonTileResources,
  bookFill: ReturnType<typeof useBookFill>
): InkPaintContext | null {
  const { pageId, theme } = useInkAppearance();
  const paper = projection.paper;
  return useMemo(
    () =>
      bookFill.ready && paper.kind !== 'unadopted'
        ? { paper, projection, theme, pageId, tiles, bookFill: bookFill.image }
        : null,
    [paper, projection, theme, pageId, tiles, bookFill.ready, bookFill.image]
  );
}

function pixelSize(size: Size): Size {
  return {
    width: Math.max(1, Math.round(size.width * PixelRatio.get())),
    height: Math.max(1, Math.round(size.height * PixelRatio.get())),
  };
}

// The pre-Undo ink an Undo ghost lifts away: the layer's own pixels when it held exactly the
// strokes the Undo removed, replayed at the current size if the paper has since changed.
function ghostInk(cue: GhostCue | null, next: SceneInput, size: Size): PreviousInk | null {
  if (!cue?.ink) return null;
  if (
    cue.size !== size ||
    !samePaperProjection(cue.ink.context.projection, next.context.projection)
  ) {
    const layer = createInkLayer(size, next.pixels, next.context);
    try {
      layer.paint(orderedOps(cue.ink.strokes));
      cue.ink = { image: layer.snapshot(), strokes: cue.ink.strokes, context: next.context };
    } finally {
      layer.dispose();
    }
    cue.size = size;
  }
  return cue.ink;
}

// Brings the scene to the committed strokes in render, as the committed raster always was: the
// Undo ghost below needs the pre-Undo pixels in the same render that replaces them.
function useSceneSync(
  scene: InkScene,
  live: LiveInkFeed,
  strokes: readonly Stroke[],
  size: Size | null,
  context: InkPaintContext | null,
  key: string,
  feedback: UndoGhost | null | undefined
): SceneState {
  const cue = useRef<GhostCue | null>(null);
  return useMemo(() => {
    const drawing = live.source()?.live() ?? [];
    if (cue.current?.feedback !== feedback) {
      const before = scene.base();
      const drawn = scene.context();
      const matches =
        feedback &&
        drawn &&
        scene.idle() &&
        drawing.length === 0 &&
        !feedback.reduced &&
        before === feedback.before.strokes &&
        strokes === feedback.after.strokes;
      const image = matches ? scene.snapshot() : null;
      cue.current = feedback
        ? {
            feedback,
            size,
            ink: image && drawn ? { image, strokes: before, context: drawn } : null,
          }
        : null;
    }
    if (!size || !context) {
      scene.dispose();
      const previous = cue.current && cue.current.size === size ? cue.current.ink : null;
      return { input: null, error: null, previous, after: null };
    }
    const next: SceneInput = { strokes, size, pixels: pixelSize(size), key, context };
    try {
      scene.sync(next, drawing);
      const previous = ghostInk(cue.current, next, size);
      return { input: next, error: null, previous, after: previous ? scene.snapshot() : null };
    } catch (error) {
      scene.dispose();
      return { input: null, error, previous: null, after: null };
    }
  }, [scene, live, strokes, size, context, key, feedback]);
}

function useLayoutRedraw(size: Size | null) {
  const view = useRef<SkiaPictureView>(null);
  useEffect(() => {
    if (!size) return;
    let current = true;
    let secondFrame: number | undefined;
    // Native drawable resizing can coalesce with picture submission before the new size lands.
    const firstFrame = requestAnimationFrame(() => {
      if (!current) return;
      secondFrame = requestAnimationFrame(() => {
        if (current) view.current?.redraw();
      });
    });
    return () => {
      current = false;
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
    };
  }, [size]);
  return view;
}

// Hands the view the scene's newest picture, if ink changed since the last one.
function present(scene: InkScene, view: SkiaPictureView | null) {
  if (!view) return;
  const picture = scene.picture();
  if (!picture) return;
  showPicture(view, picture);
  perfSubmitted();
}

// Live ink paints once per display frame, however many packets arrived in it, and at once when a
// contact ends; neither renders React (ADR-0178). A cohort that finished and was not committed
// after all leaves the layer by the frame after its commit would have rendered.
function useLiveFrames(
  scene: InkScene,
  live: LiveInkFeed,
  view: { current: SkiaPictureView | null },
  latest: {
    current: {
      strokes: readonly Stroke[];
      input: SceneInput | null;
      onError: (error: unknown) => void;
    };
  }
) {
  useEffect(() => {
    let frame: number | null = null;
    let check: number | null = null;
    // A fault detaches the input, which settles the feed again: report it once.
    let failed = false;
    const run = () => {
      frame = null;
      const source = live.source();
      if (!source || failed) return;
      try {
        scene.flush(source);
        present(scene, view.current);
        if (check === null && scene.orphaned(latest.current.strokes))
          check = requestAnimationFrame(() => {
            check = null;
            const { strokes, input } = latest.current;
            if (!input || !scene.orphaned(strokes)) return;
            scene.rebuild(input, source.live());
            present(scene, view.current);
          });
      } catch (error) {
        failed = true;
        latest.current.onError(error);
      }
    };
    const unsubscribe = live.subscribe((event) => {
      if (event === 'settle') {
        if (frame !== null) cancelAnimationFrame(frame);
        run();
      } else frame ??= requestAnimationFrame(run);
    });
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
      if (check !== null) cancelAnimationFrame(check);
    };
  }, [scene, live, view, latest]);
}

const SkiaInkLayer = forwardRef<RasterInkHandle, InkLayerProps>(function SkiaInk(props, ref) {
  const paper = useInkPaper();
  const projection = useInkProjection();
  const { pageId, theme } = useInkAppearance();
  const [size, setSize] = useState<Size | null>(null);
  const view = useLayoutRedraw(size);
  const tiles = useCrayonTileResources(
    props.strokes,
    theme,
    props.brush === 'crayon' ? props.color : undefined
  );
  const bookFill = useBookFill(pageId, theme, paperBounds(projection), props.onError);
  const context = useInkContext(projection, tiles, bookFill);
  const key = `${pageId}:${theme}:${paper.kind === 'unadopted' ? 'unadopted' : paperKey(paper)}:${projection.extent.width}x${projection.extent.height}`;
  const [scene] = useState(createInkScene);
  const state = useSceneSync(scene, props.live, props.strokes, size, context, key, props.undoGhost);
  useInkCommitProbe();
  const failure = state.error;
  // A blank picture has no layer until its first contact adopts the paper: that contact's ops are
  // recorded meanwhile, and the layer built for the adopted paper replays them.
  const ready = size !== null && bookFill.ready && failure === null;
  const latest = useRef({ strokes: props.strokes, input: state.input, onError: props.onError });
  latest.current = { strokes: props.strokes, input: state.input, onError: props.onError };
  useLiveFrames(scene, props.live, view, latest);
  // The layer's rasters are released on unmount. An effect replay (StrictMode) mounts again
  // without a render, so the layer is rebuilt from what the last render drew.
  useLayoutEffect(() => {
    const { input, onError } = latest.current;
    if (input && !scene.ready()) {
      try {
        scene.rebuild(input, props.live.source()?.live() ?? []);
      } catch (error) {
        onError(error);
      }
    }
    return () => scene.dispose();
  }, [scene, props.live]);
  useLayoutEffect(() => {
    try {
      present(scene, view.current);
    } catch (error) {
      latest.current.onError(error);
    }
  });
  const propsRef = useRef(props);
  propsRef.current = props;
  useEffect(() => {
    if (failure !== null) propsRef.current.onError(failure);
  }, [failure]);
  useEffect(() => propsRef.current.onBusy(!ready), [ready]);
  useImperativeHandle(ref, () => ({
    isReady: () => ready,
    canStart: () => ready,
    readyPlan(requested): InkPlan {
      const live = props.live.source()?.live() ?? [];
      if (!ready || live.length > 0 || !sameStrokes(requested, props.strokes))
        throw new Error('This picture is still being prepared.');
      const plan = {
        paper,
        projection,
        checkpoint: null,
        strokes: requested,
        prefix: [],
        needsCheckpoint: false,
      };
      // Unadopted paper holds no ink, so it has no layer: its capture is the empty SVG scene.
      if (!state.input) return plan;
      if (!scene.idle() || scene.base() !== props.strokes)
        throw new Error('This picture is still being prepared.');
      return {
        ...plan,
        ink: (grid, captured) => {
          if (!sameStrokes(scene.base(), requested))
            throw new Error('This picture is still being prepared.');
          return scene.capture(captured, grid);
        },
      };
    },
  }));
  return (
    <View
      style={styles.scene}
      pointerEvents="none"
      onLayout={({ nativeEvent }: LayoutChangeEvent) => {
        const { width, height } = nativeEvent.layout;
        setSize((previous) =>
          previous && previous.width === width && previous.height === height
            ? previous
            : { width, height }
        );
      }}
    >
      {state.input ? <SkiaPictureView ref={view} style={StyleSheet.absoluteFill} /> : null}
      <SkiaUndoGhost
        feedback={props.undoGhost}
        previous={state.previous}
        after={state.after}
        size={size}
        frame={props.paperFrame ?? null}
      />
    </View>
  );
});

// Memoized: the drawing surface renders for its input's disabled flag, a stroke width and a cohort
// starting, none of which changes the ink (DrawingSurface hands it stable handlers).
export const SkiaInk = memo(SkiaInkLayer);

const styles = StyleSheet.create({
  scene: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
