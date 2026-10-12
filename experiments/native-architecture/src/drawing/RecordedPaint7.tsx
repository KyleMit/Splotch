import { useId } from 'react';
import { Circle, Defs, G, Path, Pattern, Use } from 'react-native-svg';
import { MagicPaint, useCrayonDefinition } from './Ink';
import { useInkAppearance } from './InkAppearance';
import { useInkPaper } from './InkPaper';
import { CRAYON_BANDS, CRAYON_TILE_PX, crayonPhase } from './crayon';
import { semanticWidth, textureScale } from './paperSpace';
import { paintAppearance } from './palette';
import type { Stroke } from './model';
import type { PaintOp7, RecordedPaint7 } from './recordedPaintPlan7';
import type { Style7 } from './recordedTypes7';

const TILE_OFFSETS_7 = [0, -CRAYON_TILE_PX];
export function recordedResourceStrokes7(styles: readonly Style7[]): readonly Stroke[] {
  return styles.map((style) =>
    style.brush === 'crayon' ? { ...style, seed: 1, points: [] } : { ...style, points: [] }
  );
}

export function RecordedShape7({
  op,
  width,
  paint,
}: {
  op: PaintOp7;
  width: number;
  paint: string;
}) {
  if (op.kind === 'dot' || op.kind === 'crayonDot')
    return <Circle cx={op.at.x} cy={op.at.y} r={width / 2} fill={paint} />;
  const path =
    'M' +
    op.start.x +
    ' ' +
    op.start.y +
    op.segments
      .map((segment) => ' Q' + segment.cx + ' ' + segment.cy + ' ' + segment.x + ' ' + segment.y)
      .join('');
  return (
    <Path
      d={path}
      fill="none"
      stroke={paint}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export function RecordedSolid7({ paint }: { paint: RecordedPaint7 }) {
  const paper = useInkPaper();
  const { theme } = useInkAppearance();
  const style = paint.style;
  if (style.brush === 'crayon' || style.brush === 'eraser')
    throw new Error('This recorded paint needs its own compositing owner.');
  if (style.brush === 'magic')
    return (
      <MagicPaint
        stroke={{ ...style, points: [] }}
        shape={(width, color) => <RecordedShape7 op={paint.op} width={width} paint={color} />}
      />
    );
  return (
    <RecordedShape7
      op={paint.op}
      width={semanticWidth(style.width, paper)}
      paint={paintAppearance(style.color, theme).hex}
    />
  );
}

export function RecordedWaxBand7({ paint, band }: { paint: RecordedPaint7; band: number }) {
  const id = 'wax-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const texture = useCrayonDefinition();
  const paper = useInkPaper();
  const { theme } = useInkAppearance();
  const style = paint.style;
  const op = paint.op;
  if (style.brush !== 'crayon' || (op.kind !== 'crayonDot' && op.kind !== 'crayonPath'))
    throw new Error('This is not a recorded wax operation.');
  const density = CRAYON_BANDS[band];
  if (!density) throw new Error('This wax band is not supported.');
  const appearance = paintAppearance(style.color, theme);
  const texel = textureScale(paper);
  const phase = crayonPhase(op.seed);
  return (
    <G>
      <Defs>
        <Pattern
          id={id}
          patternUnits="userSpaceOnUse"
          patternContentUnits="userSpaceOnUse"
          width={CRAYON_TILE_PX * texel}
          height={CRAYON_TILE_PX * texel}
        >
          <G transform={'scale(' + texel + ')'}>
            {TILE_OFFSETS_7.flatMap((x) =>
              TILE_OFFSETS_7.map((y) => (
                <G
                  key={x + ',' + y}
                  transform={'translate(' + (phase.x + x) + ' ' + (phase.y + y) + ')'}
                >
                  <Use href={'#' + texture + '-wax-' + appearance.definitionId + '-' + band} />
                </G>
              ))
            )}
          </G>
        </Pattern>
      </Defs>
      <RecordedShape7
        op={op}
        width={semanticWidth(style.width, paper) * density.widthScale}
        paint={'url(#' + id + ')'}
      />
    </G>
  );
}
