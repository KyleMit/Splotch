import { G } from 'react-native-svg';
import { CRAYON_BANDS, CRAYON_COLOR_MIX } from './crayon';
import { RecordedWaxBand7 } from './RecordedPaint7';
import type { RecordedPaint7 } from './recordedPaintPlan7';

export function RecordedWax7({ paints }: { paints: readonly RecordedPaint7[] }) {
  const wax = paints.flatMap((paint, index) =>
    CRAYON_BANDS.map((_, band) => (
      <RecordedWaxBand7 key={index + ':' + band} paint={paint} band={band} />
    ))
  );
  return (
    <>
      <G style={{ mixBlendMode: 'darken' }}>{wax}</G>
      <G opacity={1 - CRAYON_COLOR_MIX}>{wax}</G>
    </>
  );
}
