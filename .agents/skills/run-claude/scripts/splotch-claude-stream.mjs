import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';

// Generous by design: the watchdog distinguishes a hung process from a slow one, and a single
// long tool execution emits no stream events between its tool_use and its tool_result.
export const STREAM_STALL_TIMEOUT_MS = 10 * 60 * 1000;
// A stalled tree that ignores SIGTERM (a wedged test runner, an uninterruptible child) gets this
// long to exit before the whole process group is SIGKILLed.
const STALL_SIGKILL_GRACE_MS = 10 * 1000;
const GROUP_LIVENESS_POLL_MS = 100;
const PROGRESS_TEXT_MAX_CHARS = 160;
const STDERR_TAIL_MAX_CHARS = 4096;
// The raw stream log can embed whole tool results (file contents, command output) and lives in a
// listable shared temp directory, so it must be owner-only and exclusively created: 'wx' refuses a
// pre-existing or symlinked target instead of appending through it.
const STREAM_LOG_OPTIONS = { flags: 'wx', mode: 0o600 };

function compactText(value) {
  const collapsed = String(value).replace(/\s+/g, ' ').trim();
  return collapsed.length > PROGRESS_TEXT_MAX_CHARS
    ? `${collapsed.slice(0, PROGRESS_TEXT_MAX_CHARS - 1)}…`
    : collapsed;
}

function flattenToolResult(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((block) => (block?.type === 'text' ? block.text : '')).join(' ');
  }
  return JSON.stringify(content);
}

function describeToolUse(block) {
  const input = block.input ?? {};
  const summary =
    input.command ?? input.file_path ?? input.pattern ?? input.description ?? JSON.stringify(input);
  return `tool ${block.name}: ${compactText(summary)}`;
}

// `now` is a parameter only so tests can pin the timestamp.
export function renderProgressEvent(event, now = new Date()) {
  const lines = [];
  if (event.type === 'system' && event.subtype === 'init') {
    lines.push(`session ${event.session_id} model ${event.model}`);
  } else if (event.type === 'assistant') {
    for (const block of event.message?.content ?? []) {
      if (block.type === 'text' && block.text?.trim()) lines.push(compactText(block.text));
      if (block.type === 'tool_use') lines.push(describeToolUse(block));
    }
  } else if (event.type === 'user') {
    for (const block of event.message?.content ?? []) {
      if (block.type === 'tool_result' && block.is_error) {
        lines.push(`tool error: ${compactText(flattenToolResult(block.content))}`);
      }
    }
  } else if (event.type === 'result') {
    const seconds = event.duration_ms ? ` in ${Math.round(event.duration_ms / 1000)}s` : '';
    lines.push(`result ${event.subtype}${seconds}`);
  }
  if (lines.length === 0) return null;
  const stamp = now.toTimeString().slice(0, 8);
  return lines.map((line) => `[${stamp}] ${line}`).join('\n');
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

// `stallTimeoutMs` and `sigkillGraceMs` stay injectable so tests can trip the watchdog and the
// SIGKILL escalation without waiting minutes.
export function runClaudeStreaming(
  { command, args, cwd, env, logPath, onProgress },
  stallTimeoutMs = STREAM_STALL_TIMEOUT_MS,
  sigkillGraceMs = STALL_SIGKILL_GRACE_MS
) {
  return new Promise((resolvePromise, rejectPromise) => {
    // detached puts Claude at the head of its own process group so the watchdog can terminate the
    // whole tool tree, not just the Claude PID — the vite-server.mjs pattern.
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const log = createWriteStream(logPath, STREAM_LOG_OPTIONS);
    let stderrTail = '';
    let lastEvent = 'none';
    let resultEvent;
    let stalled = false;
    let logFailure;
    let termination;

    const groupAlive = () => {
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    const signalProcessGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    };
    // The one termination sequence both failure paths share: SIGTERM, a bounded grace polling for
    // the whole group to exit, then group SIGKILL and a final confirmation poll. Memoized so the
    // leader closing early cannot cancel a pending escalation, and awaited before the promise
    // settles so no descendant survives past the reported termination.
    const terminateGroup = () => {
      termination ??= (async () => {
        signalProcessGroup('SIGTERM');
        const graceDeadline = Date.now() + sigkillGraceMs;
        while (groupAlive() && Date.now() < graceDeadline) await delay(GROUP_LIVENESS_POLL_MS);
        if (!groupAlive()) return;
        signalProcessGroup('SIGKILL');
        const killDeadline = Date.now() + sigkillGraceMs;
        while (groupAlive() && Date.now() < killDeadline) await delay(GROUP_LIVENESS_POLL_MS);
      })();
      return termination;
    };
    const terminateStalledChild = () => {
      stalled = true;
      terminateGroup();
    };
    let stallTimer = setTimeout(terminateStalledChild, stallTimeoutMs);

    log.on('error', (error) => {
      clearTimeout(stallTimer);
      logFailure ??= new Error(`stream log ${logPath} failed: ${error.message}`);
      terminateGroup();
    });

    child.stderr.on('data', (chunk) => {
      stderrTail = `${stderrTail}${chunk}`.slice(-STDERR_TAIL_MAX_CHARS);
    });

    createInterface({ input: child.stdout }).on('line', (line) => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(terminateStalledChild, stallTimeoutMs);
      log.write(`${line}\n`);
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      lastEvent = event.subtype ? `${event.type}/${event.subtype}` : event.type;
      if (event.type === 'result') resultEvent = event;
      const rendered = renderProgressEvent(event);
      if (rendered && onProgress) onProgress(rendered);
    });

    child.on('error', (error) => {
      clearTimeout(stallTimer);
      log.end();
      rejectPromise(error);
    });

    child.on('close', (code) => {
      clearTimeout(stallTimer);
      log.end();
      const settle = () => {
        if (logFailure) {
          rejectPromise(logFailure);
        } else if (stalled) {
          rejectPromise(
            new Error(
              `claude emitted no stream events for ${Math.round(stallTimeoutMs / 1000)}s and its process group was terminated; last event: ${lastEvent}; full log: ${logPath}`
            )
          );
        } else if (code !== 0) {
          rejectPromise(
            new Error(`claude exited ${code ?? 'without a status'}: ${stderrTail.trim()}`)
          );
        } else if (!resultEvent) {
          rejectPromise(new Error(`claude exited without a result event; full log: ${logPath}`));
        } else {
          resolvePromise(resultEvent);
        }
      };
      // The leader closing does not end a termination in flight: settling waits until the whole
      // group is confirmed gone or SIGKILLed, so cleanup never starts under surviving descendants.
      (termination ?? Promise.resolve()).then(settle);
    });
  });
}
