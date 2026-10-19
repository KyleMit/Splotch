import { useInkPaper, useInkProjection } from './InkPaper';
import {
  artOrientation,
  paperKey,
  paperBounds,
  paperProjectionView,
  samePaperProjection,
  type PaperProjection,
  type PaperSize,
} from './paperSpace';
import {
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PixelRatio, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
  FilterMode,
  MipmapMode,
  Skia,
  SkiaPictureView,
  fitRects,
  type SkCanvas,
  type SkImage,
  type SkPicture,
  type SkSurface,
} from '@shopify/react-native-skia';
import { sameStrokes, type InkPlan } from './checkpoints';
import { useInkAppearance } from './InkAppearance';
import { useCrayonTileResources } from './useCrayonTileReadiness';
import type { CrayonTileResources } from './crayonTiles';
import type { PaintColor } from './palette';
import type { Brush } from './brushes';
import { isFarmPageId } from './bundledBooks';
import { bundledFill } from './bundledBookAssets';
import { isOfflinePageId } from '../offlineLibrary/identity';
import { OfflineArtworkScope } from '../offlineLibrary/artworkContext';
import type { PageId } from './pages';
import type { PaperTheme } from './theme';
import { decodeDataUriImage, paintStroke, type InkPaintContext } from './skiaInkPainter';
import { extendsStrokes, type Stroke } from './model';
import type { RasterInkHandle } from './RasterInk';
import type { UndoGhost } from './undoFeedback';
import type { PaperFrame } from './paperGeometry';
import { SkiaUndoGhost, type PreviousInk } from './SkiaUndoGhost';
import { perfTimed, useInkCommitProbe } from './perfProbe';

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
type Size = Readonly<{ width: number; height: number }>;
type Rendered<T> = Readonly<{ value: T | null; error: unknown }>;
type CommittedLayer = {
  key: string;
  surface: SkSurface;
  strokes: readonly Stroke[];
  image: SkImage;
  context: InkPaintContext;
};

const NO_DRAFTS: readonly Stroke[] = [];

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

// Paper units onto a canvas of the given pixel size, contain-fitted and centered exactly as
// contacts are mapped back (paperView).
function presentPaper(canvas: SkCanvas, pixels: Size, context: InkPaintContext) {
  const view = paperProjectionView(context.projection, pixels);
  canvas.translate(view.left, view.top);
  canvas.scale(view.scale, view.scale);
}

function paintAll(
  surface: SkSurface,
  strokes: readonly Stroke[],
  pixels: Size,
  context: InkPaintContext
) {
  const canvas = surface.getCanvas();
  canvas.save();
  presentPaper(canvas, pixels, context);
  for (const stroke of strokes) paintStroke(canvas, stroke, context);
  canvas.restore();
  surface.flush();
  return surface.makeImageSnapshot();
}

// Committed ink lives in one offscreen raster that only ever grows by the strokes appended since
// the last commit (ADR-0178); any other change to the stroke list or its appearance replays it.
function useCommittedLayer(
  strokes: readonly Stroke[],
  size: Size | null,
  context: InkPaintContext | null,
  key: string,
  feedback: UndoGhost | null | undefined
) {
  const layer = useRef<CommittedLayer | null>(null);
  // Memo replay needs the same pre-Undo image after commitLayer replaces the live cache.
  const previousCue = useRef<{
    feedback: UndoGhost;
    ink: PreviousInk | null;
    size: Size | null;
  } | null>(null);
  return useMemo(() => {
    const current = layer.current;
    if (previousCue.current?.feedback !== feedback)
      previousCue.current = feedback
        ? {
            feedback,
            size,
            ink:
              current &&
              !feedback.reduced &&
              current.strokes === feedback.before.strokes &&
              strokes === feedback.after.strokes
                ? { image: current.image, strokes: current.strokes, context: current.context }
                : null,
          }
        : null;
    const cue = previousCue.current;
    let previous = cue && cue.size === size ? cue.ink : null;
    if (!size || !context) {
      layer.current = null;
      return { value: null, error: null, previous };
    }
    try {
      if (cue?.ink) {
        if (
          cue.size !== size ||
          !samePaperProjection(cue.ink.context.projection, context.projection)
        ) {
          const image = commitLayer({ current: null }, cue.ink.strokes, size, context, key);
          cue.ink = { image, strokes: cue.ink.strokes, context };
          cue.size = size;
        }
        previous = cue.ink;
      }
      return { value: commitLayer(layer, strokes, size, context, key), error: null, previous };
    } catch (error) {
      layer.current = null;
      return { value: null, error, previous: null };
    }
  }, [strokes, size, context, key, feedback]);
}

function commitLayer(
  layer: { current: CommittedLayer | null },
  strokes: readonly Stroke[],
  size: Size,
  context: InkPaintContext,
  key: string
) {
  {
    const pixelWidth = Math.max(1, Math.round(size.width * PixelRatio.get()));
    const pixelHeight = Math.max(1, Math.round(size.height * PixelRatio.get()));
    const pixels = { width: pixelWidth, height: pixelHeight };
    const layerKey = `${key}:${pixelWidth}x${pixelHeight}`;
    const current = layer.current;
    if (current && current.key === layerKey && extendsStrokes(current.strokes, strokes)) {
      if (current.strokes.length === strokes.length) return current.image;
      current.image = paintAll(
        current.surface,
        strokes.slice(current.strokes.length),
        pixels,
        context
      );
      current.strokes = strokes;
      return current.image;
    }
    const surface = Skia.Surface.Make(pixelWidth, pixelHeight);
    if (!surface) throw new Error('The drawing paper could not be prepared.');
    const image = paintAll(surface, strokes, pixels, context);
    layer.current = { key: layerKey, surface, strokes, image, context };
    return image;
  }
}

function useDraftPicture(
  drafts: readonly Stroke[],
  size: Size | null,
  context: InkPaintContext | null
) {
  return useMemo((): Rendered<SkPicture> => {
    if (!size || !context || drafts.length === 0) return { value: null, error: null };
    try {
      return { value: recordDrafts(drafts, size, context), error: null };
    } catch (error) {
      return { value: null, error };
    }
  }, [drafts, size, context]);
}

const recordDrafts = perfTimed(
  'draftRecord',
  (drafts: readonly Stroke[], size: Size, context: InkPaintContext) => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, size.width, size.height));
    presentPaper(canvas, size, context);
    for (const stroke of drafts) paintStroke(canvas, stroke, context);
    return recorder.finishRecordingAsPicture();
  }
);

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

export const SkiaInk = forwardRef<RasterInkHandle, Props>(function SkiaInk(props, ref) {
  const drafts = props.drafts ?? NO_DRAFTS;
  const paper = useInkPaper();
  const projection = useInkProjection();
  const { pageId, theme } = useInkAppearance();
  const [size, setSize] = useState<Size | null>(null);
  const view = useLayoutRedraw(size);
  const tiles = useCrayonTileResources(
    props.strokes,
    theme,
    props.brush === 'crayon' ? props.color : undefined,
    drafts
  );
  const bookFill = useBookFill(pageId, theme, paperBounds(projection), props.onError);
  const context = useInkContext(projection, tiles, bookFill);
  const key = `${pageId}:${theme}:${paper.kind === 'unadopted' ? 'unadopted' : paperKey(paper)}:${projection.extent.width}x${projection.extent.height}`;
  const committed = useCommittedLayer(props.strokes, size, context, key, props.undoGhost);
  const draftPicture = useDraftPicture(drafts, size, context);
  const scene = useInkScene(committed.value, draftPicture.value, size);
  useInkCommitProbe(scene.value);
  const failure = committed.error ?? draftPicture.error ?? scene.error;
  const ready = size !== null && bookFill.ready && failure === null;
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
      if (!ready || drafts.length > 0 || !sameStrokes(requested, props.strokes))
        throw new Error('This picture is still being prepared.');
      return {
        paper,
        projection,
        checkpoint: null,
        strokes: requested,
        prefix: [],
        needsCheckpoint: false,
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
      {scene.value ? (
        <SkiaPictureView ref={view} picture={scene.value} style={StyleSheet.absoluteFill} />
      ) : null}
      <SkiaUndoGhost
        feedback={props.undoGhost}
        previous={committed.previous}
        after={committed.value}
        size={size}
        frame={props.paperFrame ?? null}
      />
    </View>
  );
});

// The committed raster contain-fitted to the plane and the strokes in progress over it, as one
// picture: the view draws it as soon as it arrives. A Skia Canvas element tree would
// re-record on the UI thread and draw twice for each change (once on commit, once after it).
function useInkScene(
  committed: SkImage | null,
  draft: SkPicture | null,
  size: Size | null
): Rendered<SkPicture> {
  return useMemo(() => {
    if (!size) return { value: null, error: null };
    try {
      return { value: recordScene(committed, draft, size), error: null };
    } catch (error) {
      return { value: null, error };
    }
  }, [committed, draft, size]);
}

const recordScene = perfTimed(
  'sceneRecord',
  (committed: SkImage | null, draft: SkPicture | null, size: Size) => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, size.width, size.height));
    if (committed) {
      const { src, dst } = fitRects(
        'contain',
        { x: 0, y: 0, width: committed.width(), height: committed.height() },
        { x: 0, y: 0, width: size.width, height: size.height }
      );
      canvas.drawImageRectOptions(
        committed,
        src,
        dst,
        FilterMode.Linear,
        MipmapMode.None,
        Skia.Paint()
      );
    }
    if (draft) canvas.drawPicture(draft);
    return recorder.finishRecordingAsPicture();
  }
);

const styles = StyleSheet.create({
  scene: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
