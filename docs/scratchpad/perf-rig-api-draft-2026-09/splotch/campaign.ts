// The deployment-target campaign: four modes × five items per target, references on physical
// queues, Splotch's acceptance rules appended after the package's standard ones.
import {
  STANDARD_ACCEPTANCE,
  type AcceptanceRule,
  type CampaignDefinition,
  type CaptureArtifact,
  type TargetDefinition,
} from 'perf-rig';
import { actionSweep } from './scenarios/actions.js';
import { drawingCell, GESTURE_REPEATS, UNDO_COUNT } from './scenarios/drawing.js';

const MODES = [
  { id: 'portrait-light', orientation: 'PORTRAIT', dimensions: { theme: 'light' } },
  { id: 'portrait-dark', orientation: 'PORTRAIT', dimensions: { theme: 'dark' } },
  { id: 'landscape-light', orientation: 'LANDSCAPE', dimensions: { theme: 'light' } },
  { id: 'landscape-dark', orientation: 'LANDSCAPE', dimensions: { theme: 'dark' } },
] as const;

const ITEMS = ['pen-undo', 'crayon', 'magic', 'eraser', 'actions'] as const;
type Item = (typeof ITEMS)[number];

const BRUSH_BY_ITEM = {
  'pen-undo': 'pen',
  crayon: 'crayon',
  magic: 'magic',
  eraser: 'eraser',
} as const;

const undoEvidence: AcceptanceRule = {
  status: 'undo-evidence-incomplete',
  spendsAttempt: true,
  check: (artifact: CaptureArtifact) => {
    const evidence = artifact.evidence as {
      measuredAction?: { count: number; depthDelta: number; changedEveryStep: boolean };
    };
    if (!evidence.measuredAction) return { ok: true };
    const { count, depthDelta, changedEveryStep } = evidence.measuredAction;
    return count === UNDO_COUNT && depthDelta === UNDO_COUNT && changedEveryStep
      ? { ok: true }
      : {
          ok: false,
          detail: `undo proof: ${count}/${UNDO_COUNT} actions, depth fell ${depthDelta}, pixels changed every step: ${changedEveryStep}`,
        };
  },
};

export const deploymentCampaign = (
  target: TargetDefinition,
  outputRoot = 'perf-profiles/campaign'
): CampaignDefinition => ({
  target,
  modes: MODES,
  items: [...ITEMS],
  outputRoot,
  maxAttempts: 3,
  cellFor: (mode, item) => {
    const isActions = item === 'actions';
    const brush = isActions ? null : BRUSH_BY_ITEM[item as Exclude<Item, 'actions'>];
    return {
      id: `${mode.id}/${item}`,
      mode: mode.id,
      item,
      scenario: isActions ? actionSweep : drawingCell(brush!),
      options: {
        dimensions: mode.dimensions,
        orientation: mode.orientation,
        label: `${target.id}-${mode.id}-${item}`,
        ...(isActions ? { repeats: 4 } : {}),
      },
      artifact: isActions
        ? `${target.id}/${mode.id}/actions/actions.json`
        : `${target.id}/${mode.id}/${brush}-real-screen.json`,
      reports: { fidelity: !isActions && target.host !== 'desktop', refreshRegime: !isActions },
    };
  },
  reference: target.physicalDevice
    ? {
        item: 'crayon',
        metric: (artifact) =>
          (
            artifact.summaries as {
              phases: { key: string; frames: { lostFrameTimeShare: number } }[];
            }
          ).phases.find((p) => p.key === 'blank')!.frames.lostFrameTimeShare,
        warnAboveDelta: 0.005,
      }
    : undefined,
  acceptance: [...STANDARD_ACCEPTANCE, undoEvidence],
});

export { GESTURE_REPEATS };
