export function createMagicActionWitness() {
  const MAGIC_ERROR_TEXT_CAP = 200;
  const MAGIC_COUNT_KEYS = [
    'magicPoolBuilds',
    'magicGradientSelections',
    'magicBrushWorkerRequests',
    'magicMainAttempts',
    'magicMainStaleAttempts',
    'magicMainPaints',
    'magicWorkerPublications',
    'magicSupersededDisposals',
    'magicOrphanedReplyDisposals',
    'magicWorkerRequests',
    'magicWorkerAcquisitions',
    'magicWorkerConstructionAttempts',
    'magicWorkerConstructed',
    'magicInitialPosts',
    'magicRetryPosts',
    'magicResolvedRequests',
    'magicRejectedRequests',
    'magicWorkerRetirements',
  ];
  const MAGIC_RECODE_KEYS = [
    'magicRecodeInvocations',
    'magicRecodeNoContext',
    'magicRecodeNoSnapshot',
    'magicRecodeCompletedDelegations',
    'magicRecodeChanges',
    'magicRecodeNoChanges',
    'magicRecodeThrows',
  ];
  const nonnegative = (value) => Number.isFinite(value) && value >= 0;
  const finite = (value) => Number.isFinite(value);
  const boolean = (value) => typeof value === 'boolean';
  const nullableText = (value) => value === null || typeof value === 'string';
  const countersFor = (keys) => Object.fromEntries(keys.map((key) => [key, nonnegative]));
  const nullableShape = (shape) => (value) =>
    value === null ? null : copyMagicShape(value, shape);
  const MAGIC_SNAPSHOT_SHAPE = {
    magicWitnessRevision: (value) => value === 1,
    magicEngineFacts: {
      brush: (value) => ['pen', 'crayon', 'magic', 'eraser'].includes(value),
      engineLive: boolean,
      paperSized: boolean,
    },
    magicBrushState: {
      magicSourceKind: (value) => ['none', 'fill', 'gradient'].includes(value),
      magicPoolExists: boolean,
      magicHeldGradient: boolean,
      magicSheetReady: boolean,
      magicSheetGeometryStale: boolean,
      magicPendingLoad: boolean,
      magicPendingFillRaster: boolean,
      magicPendingGradientRaster: boolean,
      magicDeferredFill: boolean,
      magicFillUrl: nullableText,
      magicSheetSourceUrl: nullableText,
      magicPaperSize: nullableShape({ width: nonnegative, height: nonnegative }),
      magicSheetBounds: nullableShape({
        x: finite,
        y: finite,
        width: nonnegative,
        height: nonnegative,
      }),
      magicSheetOrigin: { x: finite, y: finite },
    },
    magicWorkerState: {
      magicWorkerSupported: boolean,
      magicWorkerExists: boolean,
      magicWorkerPending: nonnegative,
      magicWorkerNextRequestId: nonnegative,
    },
    magicWorkCounts: {
      ...countersFor(MAGIC_COUNT_KEYS),
      magicEnsureOutcomes: countersFor(['ready', 'pending', 'prepare']),
      magicMainCauses: countersFor([
        'fill-direct',
        'unsupported',
        'no-bounds',
        'source-unavailable',
        'worker-failed',
      ]),
      magicMainOrigins: countersFor([
        'ensure',
        'eager-resize',
        'fill-load',
        'fill-load-error',
        'remove-fill',
        'worker-rejection',
      ]),
      magicMainOutcomes: countersFor(['no-bounds', 'no-source', 'no-context', 'fill', 'gradient']),
      magicWorkerFailures: countersFor([
        'constructor',
        'listeners',
        'initial-post',
        'retry-post',
        'coded-reply',
        'reply',
        'error-event',
        'messageerror',
        'timeout',
      ]),
      magicRecodes: {
        'apply-fill': countersFor(MAGIC_RECODE_KEYS),
        'host-repaint': countersFor(MAGIC_RECODE_KEYS),
      },
    },
  };

  function copyMagicShape(value, shape) {
    if (
      !value ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).sort().join('|') !== Object.keys(shape).sort().join('|')
    ) {
      throw new Error('Invalid Magic witness object shape');
    }
    return Object.fromEntries(
      Object.entries(shape).map(([key, rule]) => {
        const field = value[key];
        if (typeof rule === 'object') return [key, copyMagicShape(field, rule)];
        const validated = rule(field);
        if (validated === false) throw new Error(`Invalid Magic witness ${key}`);
        return [key, validated === true ? field : validated];
      })
    );
  }

  function magicReadError(error) {
    try {
      return String(error?.message ?? error).slice(0, MAGIC_ERROR_TEXT_CAP);
    } catch {
      return 'Magic witness error could not be formatted';
    }
  }

  function magicReadTime() {
    try {
      const time = performance.now();
      return nonnegative(time) ? time : null;
    } catch {
      return null;
    }
  }

  function readMagicWitness() {
    const startedAt = magicReadTime();
    try {
      if (startedAt === null) throw new Error('Invalid Magic witness read clock');
      const reader = window.__drawingDebug?.getMagicWorkDebug;
      if (typeof reader !== 'function')
        return { available: false, reason: 'missing', startedAt, finishedAt: magicReadTime() };
      const value = reader();
      if (value === null)
        return { available: false, reason: 'disabled', startedAt, finishedAt: magicReadTime() };
      const snapshot = copyMagicShape(value, MAGIC_SNAPSHOT_SHAPE);
      const finishedAt = magicReadTime();
      const timeOriginUnixMs = performance.timeOrigin;
      if (![startedAt, finishedAt, timeOriginUnixMs].every(nonnegative) || finishedAt < startedAt) {
        throw new Error('Invalid Magic witness read clock');
      }
      return { available: true, reader, snapshot, startedAt, finishedAt, timeOriginUnixMs };
    } catch (error) {
      return {
        available: false,
        reason: 'read-failed',
        error: magicReadError(error),
        startedAt,
        finishedAt: magicReadTime(),
      };
    }
  }

  function magicCounterDelta(before, after) {
    return Object.fromEntries(
      Object.keys(after).map((key) => {
        if (typeof after[key] === 'object')
          return [key, magicCounterDelta(before[key], after[key])];
        if (after[key] < before[key]) throw new Error('Magic witness counters decreased');
        return [key, after[key] - before[key]];
      })
    );
  }

  function magicComparison(before, after) {
    if (!before.available || !after.available)
      return { available: false, reason: 'unavailable-read' };
    if (before.timeOriginUnixMs !== after.timeOriginUnixMs)
      return { available: false, reason: 'time-origin-changed' };
    if (before.reader !== after.reader)
      return { available: false, reason: 'module-lifetime-changed' };
    try {
      return {
        available: true,
        deltas: magicCounterDelta(before.snapshot.magicWorkCounts, after.snapshot.magicWorkCounts),
      };
    } catch (error) {
      return { available: false, reason: 'nonmonotonic', error: magicReadError(error) };
    }
  }

  function magicReadMetadata({ reader: _reader, ...metadata }) {
    return metadata;
  }

  return { read: readMagicWitness, compare: magicComparison, metadata: magicReadMetadata };
}
