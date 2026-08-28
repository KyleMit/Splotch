import { scoreDrawingPhase } from './drawing-gates.mjs';

export const CAMPAIGN_REFERENCE_POSITIONS = ['start', 'middle', 'end'];

// Issue 1458 measured 0.44 percentage points of same-build, same-cell spread.
// The rounded 0.5-point boundary is the largest small difference that evidence
// cannot distinguish from within-run drift; it is not a claim about the cause.
const REFERENCE_DRIFT_WARNING_SHARE = 0.005;

function referenceLostFrameTimeShare(artifact) {
  const blank = artifact?.summaries?.phases?.find((phase) => phase.key === 'blank');
  if (!blank) return null;
  const share = scoreDrawingPhase(blank).lostFrameTimeShare;
  return Number.isFinite(share) ? share : null;
}

export function campaignReferenceReport(referenceCells, artifactFor) {
  const measurements = referenceCells.map((cell) => {
    const lostFrameTimeShare = referenceLostFrameTimeShare(artifactFor(cell));
    return {
      position: cell.referencePosition,
      artifact: cell.artifact,
      lostFrameTimeShare,
      lostFrameTimePercentage: lostFrameTimeShare === null ? null : lostFrameTimeShare * 100,
    };
  });
  const measured = measurements
    .map(({ lostFrameTimeShare }) => lostFrameTimeShare)
    .filter(Number.isFinite);
  const spread = measured.length >= 2 ? Math.max(...measured) - Math.min(...measured) : null;

  return {
    metric: 'lostFrameTimeShare',
    warningThreshold: {
      lostFrameTimeShare: REFERENCE_DRIFT_WARNING_SHARE,
      percentagePoints: REFERENCE_DRIFT_WARNING_SHARE * 100,
    },
    referenceCell: referenceCells.length
      ? {
          target: referenceCells[0].targetId,
          mode: referenceCells[0].mode.id,
          brush: referenceCells[0].item,
        }
      : null,
    measurements,
    drift: {
      lostFrameTimeShare: spread,
      percentagePoints: spread === null ? null : spread * 100,
      exceedsWarningThreshold: spread !== null && spread > REFERENCE_DRIFT_WARNING_SHARE,
    },
  };
}

export function campaignReferenceWarning(report) {
  if (!report.drift.exceedsWarningThreshold) return null;
  return (
    `reference drift reached ${report.drift.percentagePoints.toFixed(2)} percentage points, ` +
    `beyond the ${report.warningThreshold.percentagePoints.toFixed(2)}-point evidence threshold ` +
    "(issue 1458); differences smaller than this run's reference spread are unresolved"
  );
}
