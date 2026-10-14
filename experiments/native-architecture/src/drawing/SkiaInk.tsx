import { useInkPaper } from './InkPaper';
import {
  artOrientation,
  CANONICAL_PAPER_SIZE,
  paperKey,
  paperSize,
  paperView,
  presentedPaperSize,
  type PaperReference,
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
import type { Stroke } from './model';
import type { RasterInkHandle } from './RasterInk';

type Props = {
  strokes: readonly Stroke[];
  drafts?: readonly Stroke[];
  brush: Brush;
  color: PaintColor;
  onBusy: (busy: boolean) => void;
  onError: (error: unknown) => void;
};
type Size = Readonly<{ width: number; height: number }>;
type Rendered<T> = Readonly<{ value: T | null; error: unknown }>;
type CommittedLayer = {
  key: string;
  surface: SkSurface;
  strokes: readonly Stroke[];
  image: SkImage;
};

const NO_DRAFTS: readonly Stroke[] = [];

function extendsStrokes(base: readonly Stroke[], next: readonly Stroke[]) {
  return base.length <= next.length && base.every((stroke, index) => next[index] === stroke);
}

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
  const view = paperView(pixels.width, pixels.height, paperSize(context.paper));
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
  key: string
) {
  const layer = useRef<CommittedLayer | null>(null);
  return useMemo((): Rendered<SkImage> => {
    if (!size || !context) return { value: null, error: null };
    try {
      return { value: commitLayer(layer, strokes, size, context, key), error: null };
    } catch (error) {
      layer.current = null;
      return { value: null, error };
    }
  }, [strokes, size, context, key]);
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
    layer.current = { key: layerKey, surface, strokes, image };
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

function recordDrafts(drafts: readonly Stroke[], size: Size, context: InkPaintContext) {
  {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, size.width, size.height));
    presentPaper(canvas, size, context);
    for (const stroke of drafts) paintStroke(canvas, stroke, context);
    return recorder.finishRecordingAsPicture();
  }
}

function useInkContext(
  paper: PaperReference,
  tiles: CrayonTileResources,
  bookFill: ReturnType<typeof useBookFill>
): InkPaintContext | null {
  const { pageId, theme } = useInkAppearance();
  return useMemo(
    () =>
      bookFill.ready && paper.kind !== 'unadopted'
        ? { paper, theme, pageId, tiles, bookFill: bookFill.image }
        : null,
    [paper, theme, pageId, tiles, bookFill.ready, bookFill.image]
  );
}

export const SkiaInk = forwardRef<RasterInkHandle, Props>(function SkiaInk(props, ref) {
  const drafts = props.drafts ?? NO_DRAFTS;
  const paper = useInkPaper();
  const { pageId, theme } = useInkAppearance();
  const [size, setSize] = useState<Size | null>(null);
  const allStrokes = useMemo(() => [...props.strokes, ...drafts], [props.strokes, drafts]);
  const tiles = useCrayonTileResources(
    allStrokes,
    theme,
    props.brush === 'crayon' ? props.color : undefined
  );
  const bookFill = useBookFill(
    pageId,
    theme,
    presentedPaperSize(paper, size ?? CANONICAL_PAPER_SIZE),
    props.onError
  );
  const context = useInkContext(paper, tiles, bookFill);
  const key = `${pageId}:${theme}:${paper.kind === 'unadopted' ? 'unadopted' : paperKey(paper)}`;
  const committed = useCommittedLayer(props.strokes, size, context, key);
  const draftPicture = useDraftPicture(drafts, size, context);
  const scene = useInkScene(committed.value, draftPicture.value, size);
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
      return { paper, checkpoint: null, strokes: requested, prefix: [], needsCheckpoint: false };
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
        <SkiaPictureView picture={scene.value} style={StyleSheet.absoluteFill} />
      ) : null}
    </View>
  );
});

// The committed raster contain-fitted to the plane and the strokes in progress over it, as one
// picture: the view draws it as soon as it arrives, once. A Skia Canvas element tree would
// re-record on the UI thread and draw twice for each change (once on commit, once after it).
function useInkScene(
  committed: SkImage | null,
  draft: SkPicture | null,
  size: Size | null
): Rendered<SkPicture> {
  return useMemo(() => {
    if (!size) return { value: null, error: null };
    try {
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
      return { value: recorder.finishRecordingAsPicture(), error: null };
    } catch (error) {
      return { value: null, error };
    }
  }, [committed, draft, size]);
}

const styles = StyleSheet.create({
  scene: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
