import { PERF_MARKS } from './perf';

export type MagicEnsureOutcome = 'ready' | 'pending' | 'prepare';
export type MagicMainCause =
  'fill-direct' | 'unsupported' | 'no-bounds' | 'source-unavailable' | 'worker-failed';
export type MagicRasterOrigin =
  'ensure' | 'eager-resize' | 'fill-load' | 'fill-load-error' | 'remove-fill' | 'worker-rejection';
export type MagicMainOutcome = 'no-bounds' | 'no-source' | 'no-context' | 'fill' | 'gradient';
export type MagicWorkerFailure =
  | 'constructor'
  | 'listeners'
  | 'initial-post'
  | 'retry-post'
  | 'coded-reply'
  | 'reply'
  | 'error-event'
  | 'messageerror'
  | 'timeout';
export type MagicRecodeCaller = 'apply-fill' | 'host-repaint';
export type MagicRecodeOutcome = 'no-context' | 'no-snapshot' | boolean;
type MagicRecordedRecodeOutcome = MagicRecodeOutcome | 'threw';

function createRecodeCounts() {
  return {
    magicRecodeInvocations: 0,
    magicRecodeNoContext: 0,
    magicRecodeNoSnapshot: 0,
    magicRecodeCompletedDelegations: 0,
    magicRecodeChanges: 0,
    magicRecodeNoChanges: 0,
    magicRecodeThrows: 0,
  };
}

function createBranchCounts() {
  return {
    magicEnsureOutcomes: { ready: 0, pending: 0, prepare: 0 },
    magicMainCauses: {
      'fill-direct': 0,
      unsupported: 0,
      'no-bounds': 0,
      'source-unavailable': 0,
      'worker-failed': 0,
    },
    magicMainOrigins: {
      ensure: 0,
      'eager-resize': 0,
      'fill-load': 0,
      'fill-load-error': 0,
      'remove-fill': 0,
      'worker-rejection': 0,
    },
    magicMainOutcomes: { 'no-bounds': 0, 'no-source': 0, 'no-context': 0, fill: 0, gradient: 0 },
    magicWorkerFailures: {
      constructor: 0,
      listeners: 0,
      'initial-post': 0,
      'retry-post': 0,
      'coded-reply': 0,
      reply: 0,
      'error-event': 0,
      messageerror: 0,
      timeout: 0,
    },
    magicRecodes: { 'apply-fill': createRecodeCounts(), 'host-repaint': createRecodeCounts() },
  };
}

function recordRecodeOutcome(
  counts: ReturnType<typeof createRecodeCounts>,
  outcome: MagicRecordedRecodeOutcome
) {
  counts.magicRecodeInvocations++;
  if (outcome === 'no-context') counts.magicRecodeNoContext++;
  else if (outcome === 'no-snapshot') counts.magicRecodeNoSnapshot++;
  else if (outcome === 'threw') counts.magicRecodeThrows++;
  else {
    counts.magicRecodeCompletedDelegations++;
    if (outcome) counts.magicRecodeChanges++;
    else counts.magicRecodeNoChanges++;
  }
}

function createCounts() {
  return {
    magicPoolBuilds: 0,
    magicGradientSelections: 0,
    magicBrushWorkerRequests: 0,
    magicMainAttempts: 0,
    magicMainStaleAttempts: 0,
    magicMainPaints: 0,
    magicWorkerPublications: 0,
    magicSupersededDisposals: 0,
    magicWorkerRequests: 0,
    magicWorkerAcquisitions: 0,
    magicWorkerConstructionAttempts: 0,
    magicWorkerConstructed: 0,
    magicInitialPosts: 0,
    magicRetryPosts: 0,
    magicResolvedRequests: 0,
    magicRejectedRequests: 0,
    magicWorkerRetirements: 0,
  };
}

function copyMagicCounts(
  counts: ReturnType<typeof createCounts>,
  branches: ReturnType<typeof createBranchCounts>
) {
  return {
    ...counts,
    magicEnsureOutcomes: { ...branches.magicEnsureOutcomes },
    magicMainCauses: { ...branches.magicMainCauses },
    magicMainOrigins: { ...branches.magicMainOrigins },
    magicMainOutcomes: { ...branches.magicMainOutcomes },
    magicWorkerFailures: { ...branches.magicWorkerFailures },
    magicRecodes: {
      'apply-fill': { ...branches.magicRecodes['apply-fill'] },
      'host-repaint': { ...branches.magicRecodes['host-repaint'] },
    },
  };
}

export type ReadonlyMagicValue<T> = T extends object
  ? { readonly [Key in keyof T]: ReadonlyMagicValue<T[Key]> }
  : T;
export type MagicWorkCountSnapshot = ReadonlyMagicValue<ReturnType<typeof copyMagicCounts>>;

export function createMagicWorkCounters() {
  const counts = createCounts();
  const branches = createBranchCounts();
  return {
    recordEnsure(outcome: MagicEnsureOutcome) {
      branches.magicEnsureOutcomes[outcome]++;
    },
    recordPoolBuild() {
      counts.magicPoolBuilds++;
    },
    recordGradientSelection() {
      counts.magicGradientSelections++;
    },
    recordBrushWorkerRequest() {
      counts.magicBrushWorkerRequests++;
    },
    recordMainAttempt(cause: MagicMainCause, origin: MagicRasterOrigin, stale: boolean) {
      counts.magicMainAttempts++;
      if (stale) counts.magicMainStaleAttempts++;
      branches.magicMainCauses[cause]++;
      branches.magicMainOrigins[origin]++;
    },
    recordMainOutcome(outcome: MagicMainOutcome) {
      branches.magicMainOutcomes[outcome]++;
      if (outcome === 'fill' || outcome === 'gradient') counts.magicMainPaints++;
    },
    recordWorkerPublication() {
      counts.magicWorkerPublications++;
    },
    recordSupersededDisposal() {
      counts.magicSupersededDisposals++;
    },
    recordWorkerRequest() {
      counts.magicWorkerRequests++;
    },
    recordWorkerAcquisition() {
      counts.magicWorkerAcquisitions++;
    },
    recordWorkerConstructionAttempt() {
      counts.magicWorkerConstructionAttempts++;
    },
    recordWorkerConstructed() {
      counts.magicWorkerConstructed++;
    },
    recordWorkerPost(kind: 'initial' | 'retry') {
      if (kind === 'initial') counts.magicInitialPosts++;
      else counts.magicRetryPosts++;
    },
    recordWorkerResolution() {
      counts.magicResolvedRequests++;
    },
    recordWorkerRejection() {
      counts.magicRejectedRequests++;
    },
    recordWorkerRetirement() {
      counts.magicWorkerRetirements++;
    },
    recordWorkerFailure(stage: MagicWorkerFailure) {
      branches.magicWorkerFailures[stage]++;
    },
    recordRecode(caller: MagicRecodeCaller, outcome: MagicRecordedRecodeOutcome) {
      recordRecodeOutcome(branches.magicRecodes[caller], outcome);
    },
    snapshot(): MagicWorkCountSnapshot {
      return copyMagicCounts(counts, branches);
    },
  };
}

export const magicWorkCounters = PERF_MARKS ? createMagicWorkCounters() : null;
