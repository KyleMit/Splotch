import type { InkPlan } from './checkpoints';
import type { Drawing7 } from './recordedTypes7';
export type RecordedInkPlan7 = Readonly<{ kind: 'recorded'; paper: Drawing7['paper']; drawing: Drawing7 }>;
export type CaptureInkPlan = InkPlan | RecordedInkPlan7;
export function isRecordedInkPlan(plan: CaptureInkPlan): plan is RecordedInkPlan7 { return 'kind' in plan && plan.kind === 'recorded'; }
