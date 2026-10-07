import assert from 'node:assert/strict';

export function configureCommandTiming(lease, platform) {
  if (platform !== 'android') return {};
  const workDeadline = Date.parse(lease.workExpiresAt);
  const cleanupDeadline = Date.parse(lease.cleanupExpiresAt);
  const expiry = Date.parse(lease.expiresAt);
  assert.ok(
    Number.isFinite(workDeadline) &&
      Number.isFinite(cleanupDeadline) &&
      Date.now() < workDeadline &&
      workDeadline < cleanupDeadline &&
      cleanupDeadline <= expiry,
    'L0_COMMAND_PHASE_DEADLINES_INVALID'
  );
  return { workDeadline, cleanupDeadline, phase: 'work', workCancelled: false };
}

export function commandRemainingMs(context, boundMs) {
  const cut = context.phase === 'cleanup' ? context.cleanupDeadline : context.workDeadline;
  assert.ok(context.phase === 'cleanup' || !context.workCancelled, 'L0_COMMAND_WORK_CANCELLED');
  const remaining = Math.min(boundMs, (cut ?? Infinity) - Date.now());
  assert.ok(remaining > 0, 'L0_COMMAND_PHASE_DEADLINE');
  return remaining;
}

export function beginCommandCleanup(context) {
  context.phase = 'cleanup';
}
