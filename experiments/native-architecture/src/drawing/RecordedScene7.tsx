import { useMemo } from 'react';
import { RecordedSceneContent7 } from './RecordedSceneContent7';
import { recordedPaintPlan7, recordedResourceStyles7 } from './recordedPaintPlan7';
import { recordedResourceStrokes7 } from './RecordedPaint7';
import type { Drawing7 } from './recordedTypes7';
import type { LiveCohort7 } from './recordedContactCohort7';

export function RecordedScene7({ drawing, preview }: { drawing: Drawing7; preview: LiveCohort7 | null }) {
  const plan = useMemo(() => recordedPaintPlan7(drawing, preview, 'native'), [drawing, preview]);
  const resources = useMemo(() => recordedResourceStrokes7(recordedResourceStyles7(drawing, preview)), [drawing, preview]);
  return <RecordedSceneContent7 plan={plan} resources={resources} />;
}
