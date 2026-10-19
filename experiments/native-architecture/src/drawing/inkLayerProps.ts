import type { Brush } from './brushes';
import type { LiveInkFeed } from './liveInk';
import type { Stroke } from './model';
import type { PaintColor } from './palette';
import type { PaperFrame } from './paperGeometry';
import type { UndoGhost } from './undoFeedback';

// What the drawing surface hands its ink layer on every platform (InkLayer.tsx, InkLayer.web.tsx).
export type InkLayerProps = {
  strokes: readonly Stroke[];
  live: LiveInkFeed;
  brush: Brush;
  color: PaintColor;
  onBusy: (busy: boolean) => void;
  onError: (error: unknown) => void;
  undoGhost?: UndoGhost | null;
  paperFrame?: PaperFrame | null;
};
