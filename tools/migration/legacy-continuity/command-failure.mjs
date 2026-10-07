export const COMMAND_FAILURE_PHASES = Object.freeze({
  command: 'command',
  cdpCleanup: 'cdp-cleanup',
  logcatCapture: 'logcat-capture',
  forwardCleanup: 'forward-cleanup',
  childSettlement: 'child-settlement',
});

export function serializeCommandError(error, seen = new Set()) {
  if (!(error instanceof Error)) return { name: 'NonError', message: String(error) };
  if (seen.has(error))
    return { name: 'CircularErrorReference', message: 'Repeated error reference' };
  seen.add(error);
  const result = { name: error.name, message: error.message };
  if (typeof error.code === 'string' || typeof error.code === 'number') result.code = error.code;
  if (error instanceof AggregateError) {
    result.errors = error.errors.map((item) => serializeCommandError(item, seen));
  }
  if (error.cause !== undefined) result.cause = serializeCommandError(error.cause, seen);
  return result;
}

export function recordCommandFailure(context, phase, error) {
  context.failurePhases ??= [];
  context.failurePhases.push({ phase, error: serializeCommandError(error) });
}
