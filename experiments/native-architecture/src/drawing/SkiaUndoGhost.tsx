import { useEffect, useMemo } from 'react';
import { PixelRatio, StyleSheet } from 'react-native';
import {
  Skia,
  SkiaPictureView,
  FilterMode,
  MipmapMode,
  type SkImage,
} from '@shopify/react-native-skia';
import type { Stroke } from './model';
import type { InkPaintContext } from './skiaInkPainter';
import type { UndoGhost } from './undoFeedback';
import type { PaperFrame } from './paperGeometry';
import { undoGhostBounds, undoGhostStrokes } from './undoGhostGeometry';
import { makeSkiaUndoGhost } from './skiaUndoGhostImage';
import { UndoInkMotion } from './UndoInkMotion';

export type PreviousInk = { image: SkImage; strokes: readonly Stroke[]; context: InkPaintContext };

export function SkiaUndoGhost({
  feedback,
  previous,
  after,
  size,
  frame,
}: {
  feedback: UndoGhost | null | undefined;
  previous: PreviousInk | null;
  after: SkImage | null;
  size: { width: number; height: number } | null;
  frame: PaperFrame | null;
}) {
  const ghost = useMemo(() => {
    if (!feedback || !previous || !size || previous.strokes !== feedback.before.strokes)
      return null;
    const bounds = undoGhostBounds(feedback, size, PixelRatio.get(), previous.context.projection);
    if (!bounds) return null;
    const image = makeSkiaUndoGhost({
      before: previous.image,
      after,
      removed: undoGhostStrokes(feedback),
      context: previous.context,
      bounds,
      size,
      density: PixelRatio.get(),
    });
    if (!image) return null;
    const recorder = Skia.PictureRecorder();
    const dst = Skia.XYWHRect(0, 0, bounds.width, bounds.height);
    const canvas = recorder.beginRecording(dst);
    canvas.drawImageRectOptions(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      dst,
      FilterMode.Linear,
      MipmapMode.None,
      Skia.Paint()
    );
    return { bounds, picture: recorder.finishRecordingAsPicture() };
  }, [feedback, previous, after, size]);
  useEffect(() => {
    if (feedback && !ghost) feedback.onFinished();
  }, [feedback, ghost]);
  return ghost && feedback ? (
    <UndoInkMotion key={feedback.id} feedback={feedback} bounds={ghost.bounds} frame={frame}>
      <SkiaPictureView picture={ghost.picture} style={StyleSheet.absoluteFill} />
    </UndoInkMotion>
  ) : null;
}
