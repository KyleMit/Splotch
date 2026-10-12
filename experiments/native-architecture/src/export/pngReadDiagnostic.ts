export type PngReadStage =
  | 'directory-open'
  | 'directory-create'
  | 'directory-list'
  | 'directory-entry'
  | 'archive-size'
  | 'archive-text'
  | 'archive-length'
  | 'archive-json'
  | 'archive-shape'
  | 'archive-record'
  | 'archive-capacity'
  | 'archive-duplicates'
  | 'png-validation'
  | 'png-crc'
  | 'png-adler'
  | 'owner-merge';

export type PngResumeSource =
  'idle' | 'timer-with-idle' | 'timer-without-idle' | 'message' | 'watchdog';

export type PngDeadlineDetail = Readonly<{
  phase: 'opening' | 'inflating' | 'completing';
  at: 'check' | 'charge' | 'before-pause' | 'resume' | 'after-pause';
  totalUnits: number;
  sliceUnits: number;
  pauseRequests: number;
  idleResumes: number;
  timerWithIdleResumes: number;
  timerWithoutIdleResumes: number;
  messageResumes: number;
  watchdogResumes: number;
  elapsedMs: number;
  callbackWaitMs: number;
  longestCallbackWaitMs: number;
  continuationWaitMs: number;
  longestContinuationWaitMs: number;
}>;

export class PngDecodeDeadlineError extends Error {
  constructor(readonly detail: PngDeadlineDetail) {
    super('Picture observation did not finish. Your drawing is still here.');
  }
}

type FailureReason =
  | 'held-record-or-header'
  | 'held-capacity'
  | 'held-png-size'
  | 'archive-size'
  | 'unexpected-directory'
  | 'unexpected-file'
  | 'decode-deadline'
  | 'decode-cancelled'
  | 'decode-work'
  | 'decode-synchronous-work'
  | 'decode-active'
  | 'png-dimensions'
  | 'png-format'
  | 'png-integrity-crc'
  | 'png-integrity-adler'
  | 'png-compressed-data'
  | 'png-filter'
  | 'png-size'
  | 'syntax'
  | 'other';

const KNOWN_MESSAGES = new Map<string, FailureReason>([
  ['The held PNG record is not supported. Your drawing is still here.', 'held-record-or-header'],
  [
    'PNG recovery is full. Try again or dismiss held pictures before exporting another.',
    'held-capacity',
  ],
  ['This PNG is too large to keep for retry. Your drawing is still here.', 'held-png-size'],
  ['PNG recovery data is too large.', 'archive-size'],
  ['Unexpected PNG recovery directory.', 'unexpected-directory'],
  ['Unexpected PNG recovery file.', 'unexpected-file'],
  ['Picture observation did not finish. Your drawing is still here.', 'decode-deadline'],
  ['Picture observation was cancelled. Your drawing is still here.', 'decode-cancelled'],
  ['Picture observation exceeded its work limit.', 'decode-work'],
  ['Picture observation exceeded its synchronous work limit.', 'decode-synchronous-work'],
  ['A picture observation is still settling.', 'decode-active'],
  ['Picture capture returned unsupported dimensions.', 'png-dimensions'],
  ['Picture capture returned an invalid or unsupported PNG.', 'png-format'],
  ['Picture capture returned invalid compressed PNG data.', 'png-compressed-data'],
  ['PNG scanline has an invalid filter.', 'png-filter'],
  ['This picture is too large to check.', 'png-size'],
]);

class PngReadDiagnosticError extends Error {
  readonly reason: FailureReason;
  readonly deadline: PngDeadlineDetail | undefined;

  constructor(
    readonly stage: PngReadStage,
    error: unknown
  ) {
    super(error instanceof Error ? error.message : 'PNG recovery read failed.');
    this.deadline = error instanceof PngDecodeDeadlineError ? error.detail : undefined;
    this.reason =
      stage === 'png-crc' &&
      error instanceof Error &&
      error.message === 'Picture capture returned an invalid or unsupported PNG.'
        ? 'png-integrity-crc'
        : stage === 'png-adler' &&
            error instanceof Error &&
            error.message === 'Picture capture returned invalid compressed PNG data.'
          ? 'png-integrity-adler'
          : error instanceof SyntaxError
            ? 'syntax'
            : error instanceof Error
              ? (KNOWN_MESSAGES.get(error.message) ?? 'other')
              : 'other';
  }
}

function tagged(stage: PngReadStage, error: unknown) {
  return error instanceof PngReadDiagnosticError ? error : new PngReadDiagnosticError(stage, error);
}

export function inPngReadStage<T>(stage: PngReadStage, action: () => T): T {
  try {
    return action();
  } catch (error) {
    throw tagged(stage, error);
  }
}

export async function awaitPngReadStage<T>(
  stage: PngReadStage,
  action: () => Promise<T>
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw tagged(stage, error);
  }
}

export function pngReadFailureDiagnostic(error: unknown, fallback: PngReadStage) {
  const fault = tagged(fallback, error);
  return { stage: fault.stage, reason: fault.reason } as const;
}

function deadlineDiagnostic(detail: PngDeadlineDetail) {
  return {
    schema: 'ROOT_NATIVE_PNG_DEADLINE_DETAIL_3641_V1',
    phase: detail.phase,
    at: detail.at,
    totalUnits: detail.totalUnits,
    sliceUnits: detail.sliceUnits,
    pauseRequests: detail.pauseRequests,
    idleResumes: detail.idleResumes,
    timerWithIdleResumes: detail.timerWithIdleResumes,
    timerWithoutIdleResumes: detail.timerWithoutIdleResumes,
    messageResumes: detail.messageResumes,
    watchdogResumes: detail.watchdogResumes,
    elapsedMs: detail.elapsedMs,
    callbackWaitMs: detail.callbackWaitMs,
    longestCallbackWaitMs: detail.longestCallbackWaitMs,
    continuationWaitMs: detail.continuationWaitMs,
    longestContinuationWaitMs: detail.longestContinuationWaitMs,
  };
}

export function reportPngReadFailure(error: unknown, fallback: PngReadStage) {
  try {
    const fault = tagged(fallback, error);
    console.info(
      'SPLOTCH_PNG_READ_DIAGNOSTIC_3629 ' +
        JSON.stringify(pngReadFailureDiagnostic(fault, fallback))
    );
    if (fault.deadline)
      console.info(
        'SPLOTCH_PNG_DEADLINE_DIAGNOSTIC_3641 ' + JSON.stringify(deadlineDiagnostic(fault.deadline))
      );
  } catch {
    // Diagnostic transport cannot alter the recovery owner's failure behavior.
  }
}
