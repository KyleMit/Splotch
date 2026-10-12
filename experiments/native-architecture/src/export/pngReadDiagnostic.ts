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

  constructor(
    readonly stage: PngReadStage,
    error: unknown
  ) {
    super(error instanceof Error ? error.message : 'PNG recovery read failed.');
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

export function reportPngReadFailure(error: unknown, fallback: PngReadStage) {
  try {
    console.info(
      'SPLOTCH_PNG_READ_DIAGNOSTIC_3629 ' +
        JSON.stringify(pngReadFailureDiagnostic(error, fallback))
    );
  } catch {
    // Diagnostic transport cannot alter the recovery owner's failure behavior.
  }
}
