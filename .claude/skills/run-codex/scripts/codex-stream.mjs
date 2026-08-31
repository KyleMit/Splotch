import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';

// Generous by design: the watchdog separates a hung Codex from a slow one, and a single long
// command execution (a test run, an install) emits no stream events between start and completion.
export const STREAM_STALL_TIMEOUT_MS = 10 * 60 * 1000;
// A wedged tool tree that ignores SIGTERM gets this long before the process group is SIGKILLed.
const STALL_SIGKILL_GRACE_MS = 10 * 1000;
const GROUP_LIVENESS_POLL_MS = 100;
const CANCELLATION_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM']);
const PROGRESS_TEXT_MAX_CHARS = 160;
const STDERR_TAIL_MAX_CHARS = 4096;
// The raw log embeds whole command outputs and lives in a listable shared temp directory, so it is
// owner-only and exclusively created: 'wx' refuses a pre-existing or symlinked target.
const STREAM_LOG_OPTIONS = { flags: 'wx', mode: 0o600 };

function compactText(value) {
  const collapsed = String(value).replace(/\s+/g, ' ').trim();
  return collapsed.length > PROGRESS_TEXT_MAX_CHARS
    ? `${collapsed.slice(0, PROGRESS_TEXT_MAX_CHARS - 1)}…`
    : collapsed;
}

function describeItem(item, phase) {
  if (item.type === 'command_execution') {
    if (phase === 'started') return `cmd ${compactText(item.command)}`;
    return item.exit_code ? `cmd failed (${item.exit_code}) ${compactText(item.command)}` : null;
  }
  if (phase !== 'completed') return null;
  if (item.type === 'agent_message') return compactText(item.text);
  if (item.type === 'reasoning') return item.text ? `thinking ${compactText(item.text)}` : null;
  if (item.type === 'error') return `error ${compactText(item.message ?? item.text)}`;
  if (item.type === 'file_change') return `edit ${compactText(JSON.stringify(item.changes ?? {}))}`;
  return null;
}

// `now` is a parameter only so tests can pin the timestamp.
export function renderProgressEvent(event, now = new Date()) {
  const lines = [];
  if (event.type === 'thread.started') lines.push(`thread ${event.thread_id}`);
  else if (event.type === 'item.started') {
    const line = describeItem(event.item ?? {}, 'started');
    if (line) lines.push(line);
  } else if (event.type === 'item.completed') {
    const line = describeItem(event.item ?? {}, 'completed');
    if (line) lines.push(line);
  } else if (event.type === 'turn.completed') {
    const usage = event.usage ?? {};
    lines.push(`turn complete (${usage.input_tokens ?? 0} in / ${usage.output_tokens ?? 0} out)`);
  } else if (event.type === 'turn.failed') {
    lines.push(`turn failed: ${compactText(event.error?.message ?? JSON.stringify(event.error))}`);
  } else if (event.type === 'error') {
    lines.push(`error ${compactText(event.message ?? JSON.stringify(event))}`);
  }
  if (lines.length === 0) return null;
  const stamp = now.toTimeString().slice(0, 8);
  return lines.map((line) => `[${stamp}] ${line}`).join('\n');
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function terminateGroup(pid, sigkillGraceMs) {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    return;
  }
  const deadline = Date.now() + sigkillGraceMs;
  while (Date.now() < deadline) {
    try {
      process.kill(-pid, 0);
    } catch {
      return;
    }
    await delay(GROUP_LIVENESS_POLL_MS);
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* the group exited between the liveness probe and the escalation */
  }
}

// `stallTimeoutMs` and `sigkillGraceMs` stay injectable so tests can trip the watchdog and the
// SIGKILL escalation without waiting minutes.
export function runCodexStreaming(
  { command, args, cwd, env, prompt, logPath, onProgress },
  stallTimeoutMs = STREAM_STALL_TIMEOUT_MS,
  sigkillGraceMs = STALL_SIGKILL_GRACE_MS
) {
  return new Promise((resolvePromise, rejectPromise) => {
    // detached heads its own process group so the watchdog can terminate the whole tool tree,
    // not just the Codex PID.
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });
    const log = createWriteStream(logPath, STREAM_LOG_OPTIONS);
    let stderrTail = '';
    let lastEvent = 'none';
    let threadId;
    let usage;
    let message;
    let stalled = false;
    let cancelled;
    let logFailure;
    let watchdog;

    const armWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(async () => {
        stalled = true;
        await terminateGroup(child.pid, sigkillGraceMs);
      }, stallTimeoutMs);
    };

    // The log is the run's only audit trail, so losing it ends the run rather than spending more
    // subscription time on an invocation whose evidence is already gone.
    log.on('error', (error) => {
      logFailure ??= error;
      clearTimeout(watchdog);
      void terminateGroup(child.pid, sigkillGraceMs);
    });
    child.on('error', (error) => {
      clearTimeout(watchdog);
      rejectPromise(error);
    });

    child.stdin.on('error', () => {
      /* Codex can exit before the prompt drains; the exit path reports the real failure */
    });
    child.stdin.end(prompt);

    createInterface({ input: child.stdout }).on('line', (line) => {
      armWatchdog();
      log.write(`${line}\n`);
      if (!line.trim()) return;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      lastEvent = event.type ?? lastEvent;
      if (event.type === 'thread.started') threadId = event.thread_id;
      if (event.type === 'turn.completed') usage = event.usage;
      if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
        message = event.item.text;
      }
      const rendered = renderProgressEvent(event);
      if (rendered) onProgress(rendered);
    });

    child.stderr.on('data', (chunk) => {
      armWatchdog();
      stderrTail = `${stderrTail}${chunk}`.slice(-STDERR_TAIL_MAX_CHARS);
    });

    // `detached` puts Codex in its own group, so a Ctrl-C on the wrapper never reaches it: without
    // these handlers a cancelled run leaves Codex alive and still spending plan usage.
    const cancel = (signal) => {
      cancelled = signal;
      clearTimeout(watchdog);
      void terminateGroup(child.pid, sigkillGraceMs);
    };
    for (const signal of CANCELLATION_SIGNALS) process.on(signal, cancel);

    armWatchdog();
    child.on('close', (code, signal) => {
      clearTimeout(watchdog);
      for (const name of CANCELLATION_SIGNALS) process.off(name, cancel);
      log.end();
      if (cancelled) {
        rejectPromise(new Error(`cancelled by ${cancelled}; Codex terminated. Log: ${logPath}`));
        return;
      }
      if (stalled) {
        rejectPromise(
          new Error(
            `Codex produced no stream event for ${Math.round(stallTimeoutMs / 1000)}s after "${lastEvent}"; terminated. Full log: ${logPath}`
          )
        );
        return;
      }
      if (logFailure) {
        rejectPromise(new Error(`stream log ${logPath} failed: ${logFailure.message}`));
        return;
      }
      if (code !== 0) {
        rejectPromise(
          new Error(
            `codex exited ${code ?? signal} after "${lastEvent}". Log: ${logPath}\n${stderrTail.trim()}`
          )
        );
        return;
      }
      resolvePromise({ threadId, usage, message });
    });
  });
}
