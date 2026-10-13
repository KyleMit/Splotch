import { useId } from 'react';
import { Defs, FeBlend, FeComposite, Filter, G } from 'react-native-svg';
import { useInkAppearance } from './InkAppearance';
import { paintAppearance } from './palette';
import { CRAYON_BANDS, NATIVE_CRAYON_EFFECTIVE_RETURN } from './crayon';
import { PAPER_HEIGHT, PAPER_WIDTH } from './paperSpace';
import { RecordedWaxBand7 } from './RecordedPaint7';
import type { RecordedPaint7 } from './recordedPaintPlan7';

export function RecordedWax7({ paints }: { paints: readonly RecordedPaint7[] }) {
  const { theme } = useInkAppearance();
  const id = 'glaze-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const alpha = 1 - (1 - NATIVE_CRAYON_EFFECTIVE_RETURN) ** (1 / CRAYON_BANDS.length);
  return <>{paints.map((paint, index) => <G key={index}>
    <Defs><Filter id={id + '-' + index} filterUnits="userSpaceOnUse" x={0} y={0} width={PAPER_WIDTH} height={PAPER_HEIGHT}><FeBlend in="SourceGraphic" in2="BackgroundImage" mode={paint.style.brush === 'crayon' ? paintAppearance(paint.style.color, theme).glaze : 'darken'} result="mixed" /><FeComposite in="mixed" in2="SourceGraphic" operator="in" /></Filter></Defs>
    {CRAYON_BANDS.map((_, band) => <G key={'darken-' + band} filter={'url(#' + id + '-' + index + ')'}><RecordedWaxBand7 paint={paint} band={band} /></G>)}
    {CRAYON_BANDS.map((_, band) => <G key={'return-' + band} opacity={alpha}><RecordedWaxBand7 paint={paint} band={band} /></G>)}
  </G>)}</>;
}
