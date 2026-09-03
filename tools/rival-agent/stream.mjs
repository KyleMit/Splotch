import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';

// Generous by design: the watchdog separates a hung rival from a slow one, and a single long
// brokered command emits no stream events between the request and its reply. Spool traffic counts
// as liveness (activityProbe), so this bounds silence with nothing outstanding.
export const STREAM_STALL_TIMEOUT_MS = 10 * 60 * 1000;
const STALL_SIGKILL_GRACE_MS = 10 * 1000;
const GROUP_LIVENESS_POLL_MS = 100;
const WATCHDOG_TICK_MS = 1000;
// SIGHUP belongs here because a long review is backgrounded: when that shell closes the wrapper is
// hung up, and the detached rival would otherwise survive it and keep spending plan usage.
export const CANCELLATION_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);
// Callers have to tell a rival that refused the run from a run the user stopped: only the former
// may be retried.
export const STREAM_FAILURE = Object.freeze({
  cancelled: 'cancelled',
  stalled: 'stalled',
  logFailed: 'log-failed',
  exited: 'exited',
});
const PROGRESS_TEXT_MAX_CHARS = 160;
const STDERR_TAIL_MAX_CHARS = 4096;
// The raw log embeds whole tool results from the reviewed checkout and lives in a listable temp
// directory, so it is owner-only and exclusively created: 'wx' refuses a pre-existing or symlinked
// target.
const STREAM_LOG_OPTIONS = { flags: 'wx', mode: 0o600 };

function streamError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function compactText(value) {
  const collapsed = String(value).replace(/\s+/g, ' ').trim();
  return collapsed.length > PROGRESS_TEXT_MAX_CHARS
    ? `${collapsed.slice(0, PROGRESS_TEXT_MAX_CHARS - 1)}…`
    : collapsed;
}

function stamp(now, lines) {
  if (lines.length === 0) return null;
  const time = now.toTimeString().slice(0, 8);
  return lines.map((line) => `[${time}] ${line}`).join('\n');
}

function describeCodexItem(item, phase) {
  if (item.type === 'command_execution') {
    if (phase === 'started') return `cmd ${compactText(item.command)}`;
    return item.exit_code ? `cmd failed (${item.exit_code}) ${compactText(item.command)}` : null;
  }
  if (item.type === 'mcp_tool_call') {
    if (phase === 'started') return `broker ${compactText(item.arguments?.command ?? '')}`;
    return item.error ? `broker error ${compactText(item.error.message)}` : null;
  }
  if (phase !== 'completed') return null;
  if (item.type === 'agent_message') return compactText(item.text);
  if (item.type === 'reasoning') return item.text ? `thinking ${compactText(item.text)}` : null;
  if (item.type === 'error') return `error ${compactText(item.message ?? item.text)}`;
  if (item.type === 'file_change') return `edit ${compactText(JSON.stringify(item.changes ?? {}))}`;
  return null;
}

// `now` is a parameter only so tests can pin the timestamp.
export function renderCodexEvent(event, now = new Date()) {
  const lines = [];
  if (event.type === 'thread.started') lines.push(`thread ${event.thread_id}`);
  else if (event.type === 'item.started' || event.type === 'item.completed') {
    const line = describeCodexItem(event.item ?? {}, event.type.slice('item.'.length));
    if (line) lines.push(line);
  } else if (event.type === 'turn.completed') {
    const usage = event.usage ?? {};
    lines.push(`turn complete (${usage.input_tokens ?? 0} in / ${usage.output_tokens ?? 0} out)`);
  } else if (event.type === 'turn.failed') {
    lines.push(`turn failed: ${compactText(event.error?.message ?? JSON.stringify(event.error))}`);
  } else if (event.type === 'error') {
    lines.push(`error ${compactText(event.message ?? JSON.stringify(event))}`);
  }
  return stamp(now, lines);
}

function flattenToolResult(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((block) => (block?.type === 'text' ? block.text : '')).join(' ');
  }
  return JSON.stringify(content);
}

function describeClaudeToolUse(block) {
  const input = block.input ?? {};
  const summary =
    input.command ?? input.file_path ?? input.pattern ?? input.description ?? JSON.stringify(input);
  return `tool ${block.name}: ${compactText(summary)}`;
}

export function renderClaudeEvent(event, now = new Date()) {
  const lines = [];
  if (event.type === 'system' && event.subtype === 'init') {
    lines.push(`session ${event.session_id} model ${event.model}`);
  } else if (event.type === 'assistant') {
    for (const block of event.message?.content ?? []) {
      if (block.type === 'text' && block.text?.trim()) lines.push(compactText(block.text));
      if (block.type === 'tool_use') lines.push(describeClaudeToolUse(block));
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
  return stamp(now, lines);
}

// Reducers fold the vendor's events into the one shape the launchers consume: the rival's session
// id for the ledger, usage for the result, and the final message that must be the findings JSON.
export const codexReducer = Object.freeze({
  initial: () => ({ vendor: 'codex', sessionId: undefined, usage: undefined, message: undefined }),
  reduce(state, event) {
    if (event.type === 'thread.started') state.sessionId = event.thread_id;
    if (event.type === 'turn.completed') state.usage = event.usage;
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
      state.message = event.item.text;
    }
    return state;
  },
  render: renderCodexEvent,
});

export const claudeReducer = Object.freeze({
  initial: () => ({ vendor: 'claude', sessionId: undefined, usage: undefined, message: undefined }),
  reduce(state, event) {
    if (event.type === 'system' && event.subtype === 'init') state.sessionId = event.session_id;
    if (event.type === 'result') {
      state.usage = event.usage;
      state.resultSubtype = event.subtype;
      state.message =
        event.structured_output !== undefined
          ? JSON.stringify(event.structured_output)
          : event.result;
    }
    return state;
  },
  render: renderClaudeEvent,
});

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

// Injected only by tests: a log that fails while flushing its final write cannot be provoked
// through a real file, and that is exactly the case that must reject rather than report success
// over a truncated audit trail.
const defaultLogStream = (path) => createWriteStream(path, STREAM_LOG_OPTIONS);

// `stallTimeoutMs` and `sigkillGraceMs` stay injectable so tests can trip the watchdog and the
// SIGKILL escalation without waiting minutes.
export function runStreaming(
  {
    command,
    args,
    cwd,
    env,
    stdin,
    logPath,
    onProgress,
    reducer,
    activityProbe = () => 0,
    createLogStream = defaultLogStream,
    now = Date.now,
  },
  stallTimeoutMs = STREAM_STALL_TIMEOUT_MS,
  sigkillGraceMs = STALL_SIGKILL_GRACE_MS
) {
  return new Promise((resolvePromise, rejectPromise) => {
    // detached heads the rival's own process group so the watchdog can terminate the whole tool
    // tree — including the broker server it spawned — not just the rival PID.
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      detached: true,
    });
    const log = createLogStream(logPath);
    const state = reducer.initial();
    let stderrTail = '';
    let lastEvent = 'none';
    let lastEventAt = now();
    let stalled = false;
    let cancelled;
    let logFailure;
    let logClosed = false;
    let termination;

    const groupAlive = () => {
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    const signalGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    };
    // One termination sequence for every failure path: SIGTERM, a bounded grace polling for the
    // whole group to exit, then group SIGKILL. Memoized so the leader closing early cannot cancel a
    // pending escalation, and awaited before the promise settles so no descendant survives past the
    // reported termination.
    const terminateGroup = () => {
      termination ??= (async () => {
        signalGroup('SIGTERM');
        const graceDeadline = Date.now() + sigkillGraceMs;
        while (groupAlive() && Date.now() < graceDeadline) await delay(GROUP_LIVENESS_POLL_MS);
        if (!groupAlive()) return;
        signalGroup('SIGKILL');
        const killDeadline = Date.now() + sigkillGraceMs;
        while (groupAlive() && Date.now() < killDeadline) await delay(GROUP_LIVENESS_POLL_MS);
      })();
      return termination;
    };

    const watchdog = setInterval(
      () => {
        const lastActivity = Math.max(lastEventAt, activityProbe());
        if (now() - lastActivity <= stallTimeoutMs) return;
        clearInterval(watchdog);
        stalled = true;
        terminateGroup();
      },
      Math.min(WATCHDOG_TICK_MS, stallTimeoutMs)
    );

    log.on('close', () => {
      logClosed = true;
    });
    // The log is the run's only audit trail, so losing it ends the run rather than spending more
    // plan usage on an invocation whose evidence is already gone.
    log.on('error', (error) => {
      logFailure ??= error;
      clearInterval(watchdog);
      terminateGroup();
    });
    child.on('error', (error) => {
      clearInterval(watchdog);
      rejectPromise(error);
    });

    if (stdin !== undefined) {
      child.stdin.on('error', () => {
        /* the rival can exit before the prompt drains; the exit path reports the real failure */
      });
      child.stdin.end(stdin);
    }

    createInterface({ input: child.stdout }).on('line', (line) => {
      lastEventAt = now();
      log.write(`${line}\n`);
      if (!line.trim()) return;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      lastEvent = event.subtype ? `${event.type}/${event.subtype}` : (event.type ?? lastEvent);
      reducer.reduce(state, event);
      const rendered = reducer.render(event);
      if (rendered && onProgress) onProgress(rendered);
    });

    // Deliberately not liveness: a rival stuck in a retry loop keeps writing diagnostics here, and
    // letting that defer the timeout would break the promise the watchdog exists to keep.
    child.stderr.on('data', (chunk) => {
      stderrTail = `${stderrTail}${chunk}`.slice(-STDERR_TAIL_MAX_CHARS);
    });

    // `detached` puts the rival in its own group, so a Ctrl-C on the wrapper never reaches it.
    const cancel = (signal) => {
      cancelled = signal;
      clearInterval(watchdog);
      terminateGroup();
    };
    for (const signal of CANCELLATION_SIGNALS) process.on(signal, cancel);

    const settle = (code, signal) => {
      if (cancelled) {
        rejectPromise(
          streamError(
            STREAM_FAILURE.cancelled,
            `cancelled by ${cancelled}; the rival was terminated. Log: ${logPath}`
          )
        );
      } else if (stalled) {
        rejectPromise(
          streamError(
            STREAM_FAILURE.stalled,
            `the rival produced no stream event or broker traffic for ${Math.round(stallTimeoutMs / 1000)}s after "${lastEvent}"; terminated. Full log: ${logPath}`
          )
        );
      } else if (logFailure) {
        rejectPromise(
          streamError(
            STREAM_FAILURE.logFailed,
            `stream log ${logPath} failed: ${logFailure.message}`
          )
        );
      } else if (code !== 0) {
        rejectPromise(
          streamError(
            STREAM_FAILURE.exited,
            `${command} exited ${code ?? signal} after "${lastEvent}". Log: ${logPath}\n${stderrTail.trim()}`
          )
        );
      } else {
        resolvePromise(state);
      }
    };

    child.on('close', (code, signal) => {
      clearInterval(watchdog);
      for (const name of CANCELLATION_SIGNALS) process.off(name, cancel);
      // Settling waits for the log to close so a failed or truncated final write is seen before the
      // result is reported, and for any termination in flight so cleanup never starts under
      // surviving descendants. A log that already failed has emitted 'close' before this point.
      const finish = () => (termination ?? Promise.resolve()).then(() => settle(code, signal));
      if (logClosed) {
        finish();
        return;
      }
      log.once('close', finish);
      log.end();
    });
  });
}
