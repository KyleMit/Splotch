// The deployment-target campaign: four variants × five items per target, references on physical
// queues, Splotch's undo-evidence rule appended after the package's standard ones.
import type { TargetDefinition } from 'perf-rig';
import {
  STANDARD_ACCEPTANCE,
  ruleFor,
  type CampaignDefinition,
  type CampaignVariant,
} from 'perf-rig/campaign';
import { splotch, type Brush, type Splotch } from './app.js';
import { fidelity, gates } from './gates.js';
import { actionSweep } from './scenarios/actions.js';
import { drawingCell, GESTURE_REPEATS } from './scenarios/drawing.js';

const LANDSCAPE = { width: 1366, height: 915, deviceScaleFactor: 2 } as const;
const PORTRAIT = { width: 915, height: 1366, deviceScaleFactor: 2 } as const;

const VARIANTS: readonly CampaignVariant<Splotch>[] = [
  {
    id: 'portrait-light',
    dimensions: { orientation: 'PORTRAIT', theme: 'light' },
    viewport: PORTRAIT,
  },
  {
    id: 'portrait-dark',
    dimensions: { orientation: 'PORTRAIT', theme: 'dark' },
    viewport: PORTRAIT,
  },
  {
    id: 'landscape-light',
    dimensions: { orientation: 'LANDSCAPE', theme: 'light' },
    viewport: LANDSCAPE,
  },
  {
    id: 'landscape-dark',
    dimensions: { orientation: 'LANDSCAPE', theme: 'dark' },
    viewport: LANDSCAPE,
  },
];

const ITEMS = ['pen-undo', 'crayon', 'magic', 'eraser', 'actions'] as const;
const BRUSH_BY_ITEM = {
  'pen-undo': 'pen',
  crayon: 'crayon',
  magic: 'magic',
  eraser: 'eraser',
} satisfies Record<Exclude<(typeof ITEMS)[number], 'actions'>, Brush>;

type SplotchStatus = 'undo-evidence-incomplete';

// splitUndoEvidenceProblem: a cell whose scenario repeats undo must carry complete undo evidence;
// absence is a rejection there, and only a cell without a repeated action may lack it.
const undoEvidence = ruleFor('frames', {
  status: 'undo-evidence-incomplete' as SplotchStatus,
  retry: 'always',
  check: (artifact, cell) => {
    const required = cell.scenario.repeatedAction;
    const proof = artifact.evidence.repeatedAction;
    if (!required) return { ok: true };
    if (!proof)
      return {
        ok: false,
        detail: 'the cell repeats undo and the artifact carries no undo evidence',
      };
    const depthDelta = proof.depthBefore - proof.depthAfter;
    const incomplete = proof.samples.findIndex(
      (sample, index) =>
        sample.index !== index ||
        !Number.isFinite(sample.engineMs) ||
        !Number.isFinite(sample.nextFrameMs)
    );
    if (proof.samples.length !== required.count || incomplete !== -1) {
      return {
        ok: false,
        detail: `undo proof: ${proof.samples.length}/${required.count} timed actions${incomplete === -1 ? '' : `, action ${incomplete + 1} incomplete`}`,
      };
    }
    return proof.count === required.count && depthDelta === required.count && proof.changedEveryStep
      ? { ok: true }
      : {
          ok: false,
          detail: `undo proof: ${proof.count}/${required.count} actions, depth fell ${depthDelta}, pixels changed every step: ${proof.changedEveryStep}`,
        };
  },
});

export const deploymentCampaign = (
  target: TargetDefinition,
  outputRoot = 'perf-profiles/campaign'
): CampaignDefinition<Splotch, SplotchStatus> => ({
  app: splotch,
  target,
  variants: VARIANTS,
  items: [...ITEMS],
  outputRoot,
  maxAttempts: 3,
  gates,
  fidelity,
  cellFor: (variant, item) => {
    const isActions = item === 'actions';
    const brush = isActions ? null : BRUSH_BY_ITEM[item as keyof typeof BRUSH_BY_ITEM];
    return {
      id: `${variant.id}/${item}`,
      variant: variant.id,
      item,
      scenario: isActions ? actionSweep : drawingCell(brush!),
      options: {
        dimensions: variant.dimensions,
        viewport: target.host === 'desktop' ? variant.viewport : undefined,
        label: `${target.id}-${variant.id}-${item}`,
        ...(isActions ? { repeats: 4 } : {}),
      },
      artifact: isActions
        ? `${target.id}/${variant.id}/actions/actions.json`
        : `${target.id}/${variant.id}/${brush}-real-screen.json`,
    };
  },
  reference: target.physicalDevice
    ? {
        item: 'crayon',
        onlyWhenQueueContains: ['pen-undo', 'crayon', 'magic', 'eraser'],
        metric: (artifact) =>
          artifact.summaries?.phases.find((p) => p.key === 'blank')?.starvation.inContact
            .lostFrameTimeShare ?? null,
        warnAboveDelta: 0.005,
      }
    : undefined,
  acceptance: [...STANDARD_ACCEPTANCE, undoEvidence],
});

export { GESTURE_REPEATS };
