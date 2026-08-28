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

export function campaignReferenceReport(referenceCells, artifactRecordFor, { instrument } = {}) {
  const measurements = referenceCells.map((cell) => {
    const record = artifactRecordFor(cell);
    const lostFrameTimeShare = referenceLostFrameTimeShare(record?.artifact);
    return {
      position: cell.referencePosition,
      artifact: cell.artifact,
      capturedAt: record?.capturedAt ?? null,
      captureSession: record?.captureSession ?? null,
      lostFrameTimeShare,
      lostFrameTimePercentage: lostFrameTimeShare === null ? null : lostFrameTimeShare * 100,
    };
  });
  const measured = measurements
    .map(({ lostFrameTimeShare }) => lostFrameTimeShare)
    .filter(Number.isFinite);
  const spread = measured.length >= 2 ? Math.max(...measured) - Math.min(...measured) : null;
  const measuredSessions = measurements
    .filter(({ lostFrameTimeShare }) => lostFrameTimeShare !== null)
    .map(({ captureSession }) => captureSession);
  const knownSessions = new Set(measuredSessions.filter(Boolean));
  const sessionScope = measuredSessions.some((session) => session === null)
    ? 'unknown'
    : knownSessions.size > 1
      ? 'mixed'
      : knownSessions.size === 1
        ? 'single'
        : null;

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
    captureSessions: {
      scope: sessionScope,
      count: knownSessions.size,
    },
    instrument: instrument ?? null,
    drift: {
      lostFrameTimeShare: spread,
      percentagePoints: spread === null ? null : spread * 100,
      exceedsWarningThreshold: spread !== null && spread > REFERENCE_DRIFT_WARNING_SHARE,
    },
  };
}

export function campaignReferenceWarning(report) {
  const warnings = [];
  if (report.captureSessions.scope === 'mixed') {
    warnings.push(
      `reference captures span ${report.captureSessions.count} campaign sessions; ` +
        'their spread is not within-session drift'
    );
  } else if (report.captureSessions.scope === 'unknown') {
    warnings.push(
      'one or more reference capture sessions are unknown; their spread is not proven ' +
        'within-session drift'
    );
  }
  if (report.drift.exceedsWarningThreshold) {
    warnings.push(
      `reference drift reached ${report.drift.percentagePoints.toFixed(2)} percentage points, ` +
        `beyond the ${report.warningThreshold.percentagePoints.toFixed(2)}-point evidence ` +
        "threshold (issue 1458); differences smaller than this reference set's spread are unresolved"
    );
  }
  return warnings.length ? warnings.join('; ') : null;
}
