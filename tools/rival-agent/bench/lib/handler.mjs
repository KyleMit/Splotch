import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { replyToRequest } from '../../broker.mjs';
import { outputPath, readSession, waitForPendingOrEnd } from '../../spool.mjs';

// The bench is its own handler, and it decides mechanically: a request stays inside the disposable
// worktree and the session, or it is declined. Absolute paths anywhere else, the network, the
// host-exclusive suites, and dependency installs are the shapes a real handler declines too.
const HOST_ONLY_COMMAND =
  /\b(curl|wget|gh|ssh|scp|adb|xcrun|idevice\w*|netlify|playwright)\b|\bgit\s+(push|fetch|pull|remote)\b|\b(npm|pnpm|npx)\s+(install|add|i|ci)\b|test:e2e|perf:|dev:netlify/;
// A path can follow a redirect, a pipe, a separator, or a backtick as easily as a space (the
// first Claude rival round showed `>/abs`, `</abs`, and `~/x` slipping past a narrower class).
const ABSOLUTE_PATH = /(?:^|[\s'"=(<>|&;`])(\/[^\s'"`;)&|<>]*)/g;
const HOME_REFERENCE = /(?:^|[\s'"=(<>|&;`])~|\$\{?HOME\b/;
const ALWAYS_ALLOWED_PATHS = new Set(['/dev/null']);
export const DECLINE_REASONS = Object.freeze({
  outside: 'reaches outside the disposable worktree',
  hostOnly: 'needs the network or a host-exclusive resource',
});
// A brokered command that runs longer than this is killed and answered with exit 124; the bench
// cannot sit behind one rival's runaway request while the other cells wait.
const BROKERED_COMMAND_TIMEOUT_MS = 15 * 60 * 1000;
const POLL_MS = 1000;

export function judgeRequest(request, { session }) {
  if (HOST_ONLY_COMMAND.test(request.command)) {
    return { approved: false, reason: DECLINE_REASONS.hostOnly };
  }
  if (HOME_REFERENCE.test(request.command)) {
    return { approved: false, reason: DECLINE_REASONS.outside };
  }
  for (const [, path] of request.command.matchAll(ABSOLUTE_PATH)) {
    if (ALWAYS_ALLOWED_PATHS.has(path)) continue;
    if (!path.startsWith(`${session}/`) && path !== session) {
      return { approved: false, reason: DECLINE_REASONS.outside };
    }
  }
  return { approved: true };
}

function runBrokered(command, { cwd, outputFile, timeoutMs = BROKERED_COMMAND_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', command], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const output = createWriteStream(outputFile, { mode: 0o600 });
    child.stdout.pipe(output, { end: false });
    child.stderr.pipe(output, { end: false });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      output.end();
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      output.end(() => resolve(timedOut ? 124 : (code ?? 1)));
    });
  });
}

// Serves one session until its terminal file appears: every request is judged, run or declined,
// and recorded. Returns the decisions in order so the report can show what the rival asked for.
export async function serveSession(session, { judge = judgeRequest, onDecision } = {}) {
  const decisions = [];
  for (;;) {
    const outcome = await waitForPendingOrEnd(session, { timeoutMs: POLL_MS });
    if (outcome.state === 'done' || outcome.state === 'failed') return { outcome, decisions };
    if (outcome.state !== 'request') continue;
    const { request } = outcome;
    const verdict = judge(request, { session });
    const decision = { seq: request.seq, command: request.command, why: request.why, ...verdict };
    if (verdict.approved) {
      const { worktree } = readSession(session);
      const outputFile = outputPath(session, request.seq);
      decision.exit = await runBrokered(request.command, { cwd: worktree, outputFile });
      replyToRequest({ session, seq: request.seq, exit: decision.exit, outputFile });
    } else {
      replyToRequest({ session, seq: request.seq, declined: verdict.reason });
    }
    decisions.push(decision);
    onDecision?.(decision);
  }
}
