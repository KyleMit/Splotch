import { useEffect, useId, useMemo, useRef } from 'react';
import { PixelRatio } from 'react-native';
import { Svg, Defs, G, Mask, Rect } from '../platform/svg';
import { InkPaperScope, useInkProjection } from './InkPaper';
import { InkScene } from './InkScene';
import { StrokeShape } from './StrokeShape';
import { sameStrokes, type InkCheckpoint, type InkPlan } from './checkpoints';
import {
  drawingPaper,
  paperBounds,
  paperProjection,
  paperProjectionView,
  samePaper,
  samePaperProjection,
  semanticWidth,
  type PaperProjection,
} from './paperSpace';
import type { UndoGhost } from './undoFeedback';
import type { Drawing, Stroke } from './model';
import type { PaperFrame } from './paperGeometry';
import {
  UNDO_GHOST_AA_PAD_PX,
  UNDO_GHOST_MS,
  undoGhostBounds,
  undoGhostStrokes,
} from './undoGhostGeometry';
import { UndoInkMotion } from './UndoInkMotion';
import { useInkAppearance } from './InkAppearance';
import {
  CrayonTileResourceScope,
  useCrayonTileResources,
  useCrayonTileReadiness,
} from './useCrayonTileReadiness';

const imageLoaded = () => {};
type SvgGhostPlan = { feedback: UndoGhost; removed: readonly Stroke[] } & (
  { kind: 'pen' } | { kind: 'raster'; plan: InkPlan; remaining: InkPlan }
);

function SvgUndoGhost({
  ghost,
  frame,
  ready,
}: {
  ghost: SvgGhostPlan;
  frame: PaperFrame | null;
  ready: boolean;
}) {
  const { feedback, removed } = ghost;
  const id = useId();
  const density = PixelRatio.get();
  const current = useInkProjection();
  const projection = samePaper(current.paper, drawingPaper(feedback.before))
    ? current
    : paperProjection(drawingPaper(feedback.before));
  const bounds = frame ? undoGhostBounds(feedback, frame, density, projection) : null;
  useEffect(() => {
    if (!bounds) feedback.onFinished();
  }, [feedback, bounds]);
  if (!bounds || !frame) return null;
  const paper = drawingPaper(feedback.before);
  const size = paperBounds(projection);
  const view = paperProjectionView(projection, frame);
  const viewBox = `${(bounds.left - view.left) / view.scale} ${(bounds.top - view.top) / view.scale} ${bounds.width / view.scale} ${bounds.height / view.scale}`;
  return (
    <InkPaperScope.Provider value={projection}>
      <UndoInkMotion key={feedback.id} feedback={feedback} bounds={bounds} frame={frame}>
        {ready ? (
          <Svg
            width="100%"
            height="100%"
            viewBox={viewBox}
            preserveAspectRatio="none"
            pointerEvents="none"
          >
            {ghost.kind === 'raster' ? (
              <>
                <Defs>
                  <Mask
                    id={`${id}-footprint`}
                    maskUnits="userSpaceOnUse"
                    x={size.x}
                    y={size.y}
                    width={size.width}
                    height={size.height}
                    style={{ maskType: 'luminance' }}
                  >
                    {removed.map((stroke, index) => (
                      <StrokeShape
                        key={index}
                        points={stroke.points}
                        width={
                          semanticWidth(stroke.width, paper) +
                          (2 * UNDO_GHOST_AA_PAD_PX) / (density * view.scale)
                        }
                        paint="white"
                      />
                    ))}
                  </Mask>
                  <Mask
                    id={`${id}-remaining`}
                    maskUnits="userSpaceOnUse"
                    x={size.x}
                    y={size.y}
                    width={size.width}
                    height={size.height}
                    style={{ maskType: 'luminance' }}
                  >
                    <Rect
                      x={size.x}
                      y={size.y}
                      width={size.width}
                      height={size.height}
                      fill="white"
                    />
                    <G style={{ filter: 'brightness(0)' }}>
                      <InkScene
                        checkpoint={ghost.remaining.checkpoint}
                        strokes={ghost.remaining.strokes}
                        onImageLoad={imageLoaded}
                      />
                    </G>
                  </Mask>
                </Defs>
                <G mask={`url(#${id}-remaining)`}>
                  <G mask={`url(#${id}-footprint)`}>
                    <InkScene
                      checkpoint={ghost.plan.checkpoint}
                      strokes={ghost.plan.strokes}
                      onImageLoad={imageLoaded}
                    />
                  </G>
                </G>
              </>
            ) : (
              <InkScene checkpoint={null} strokes={removed} onImageLoad={imageLoaded} />
            )}
          </Svg>
        ) : null}
      </UndoInkMotion>
    </InkPaperScope.Provider>
  );
}

function completeGhostInkPlan(
  drawing: Drawing,
  cached: InkCheckpoint | null,
  projection: PaperProjection
): InkPlan {
  const paper = drawingPaper(drawing);
  const checkpoint =
    cached &&
    samePaperProjection(cached.projection, projection) &&
    sameStrokes(cached.strokes, drawing.strokes.slice(0, cached.strokes.length))
      ? cached
      : null;
  return {
    paper,
    projection,
    checkpoint,
    strokes: drawing.strokes.slice(checkpoint?.strokes.length ?? 0),
    prefix: drawing.strokes,
    needsCheckpoint: false,
  };
}

function planSvgUndoGhost(
  feedback: UndoGhost,
  checkpoint: InkCheckpoint | null,
  projection: PaperProjection
): SvgGhostPlan {
  const removed = undoGhostStrokes(feedback);
  return removed.some((stroke) => stroke.brush === 'crayon' || stroke.brush === 'magic')
    ? {
        kind: 'raster',
        feedback,
        removed,
        plan: completeGhostInkPlan(feedback.before, checkpoint, projection),
        remaining: completeGhostInkPlan(feedback.after, checkpoint, projection),
      }
    : { kind: 'pen', feedback, removed };
}

export function useSvgUndoGhostPlan(
  feedback: UndoGhost | null | undefined,
  checkpoint: InkCheckpoint | null
) {
  const projection = useInkProjection();
  const ghost = useRef<SvgGhostPlan | null>(null);
  if (
    ghost.current?.feedback !== feedback ||
    (ghost.current?.kind === 'raster' &&
      !samePaperProjection(ghost.current.plan.projection, projection))
  )
    ghost.current = feedback ? planSvgUndoGhost(feedback, checkpoint, projection) : null;
  const current = ghost.current;
  const tileStrokes = useMemo(
    () =>
      current?.kind === 'raster' ? [...current.plan.strokes, ...current.remaining.strokes] : [],
    [current]
  );
  return { ghost: current, tileStrokes };
}

export function SvgUndoGhostLayer({
  feedback,
  checkpoint,
  frame,
}: {
  feedback: UndoGhost;
  checkpoint: InkCheckpoint | null;
  frame: PaperFrame | null;
}) {
  const { theme } = useInkAppearance();
  const expired = performance.now() - feedback.startedAt >= UNDO_GHOST_MS;
  const eligible = !expired && undoGhostStrokes(feedback).length > 0;
  const { ghost, tileStrokes } = useSvgUndoGhostPlan(eligible ? feedback : null, checkpoint);
  useEffect(() => {
    if (!eligible) feedback.onFinished();
  }, [feedback, eligible]);
  const resources = useCrayonTileResources(tileStrokes, theme);
  const tiles = useCrayonTileReadiness(resources.uris, feedback.onFinished);
  return (
    <CrayonTileResourceScope.Provider value={resources}>
      {tiles.decode}
      {ghost ? <SvgUndoGhost ghost={ghost} frame={frame} ready={tiles.ready} /> : null}
    </CrayonTileResourceScope.Provider>
  );
}
