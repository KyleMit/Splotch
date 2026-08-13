import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';

// Generous by design: the watchdog distinguishes a hung process from a slow one, and a single
// long tool execution emits no stream events between its tool_use and its tool_result.
export const STREAM_STALL_TIMEOUT_MS = 10 * 60 * 1000;
const PROGRESS_TEXT_MAX_CHARS = 160;
const STDERR_TAIL_MAX_CHARS = 4096;

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

// `stallTimeoutMs` stays injectable so tests can trip the watchdog without waiting minutes.
export function runClaudeStreaming(
  { command, args, cwd, env, logPath, onProgress },
  stallTimeoutMs = STREAM_STALL_TIMEOUT_MS
) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const log = createWriteStream(logPath, { flags: 'a' });
    let stderrTail = '';
    let lastEvent = 'none';
    let resultEvent;
    let stalled = false;

    const terminateStalledChild = () => {
      stalled = true;
      child.kill('SIGTERM');
    };
    let stallTimer = setTimeout(terminateStalledChild, stallTimeoutMs);

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
      if (stalled) {
        rejectPromise(
          new Error(
            `claude emitted no stream events for ${Math.round(stallTimeoutMs / 1000)}s and was terminated; last event: ${lastEvent}; full log: ${logPath}`
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
    });
  });
}
