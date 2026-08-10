import { createReadStream, existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import {
  availableThreadColumns,
  interfaceName,
  lookupThreadMetadata,
  resolveCodexHome,
  sessionIdFromRolloutPath,
  threadDatabasePath,
} from './codexStore.mjs';

const USER_PREVIEW_CHARS = 3000;
const TITLE_PREVIEW_CHARS = 400;
const TOOL_INPUT_PREVIEW_CHARS = 2400;
const RESULT_PREVIEW_CHARS = 400;
const SUSPECTED_FAILURE_PREVIEW_CHARS = 1800;
const OPERATION_EVENT_PREVIEW_CHARS = 1200;

function parseOptions() {
  const { values, positionals } = parseArgs({
    options: { 'codex-home': { type: 'string' } },
    allowPositionals: true,
  });
  if (positionals.length !== 1) {
    throw new Error('usage: node skeleton.mjs [--codex-home <path>] <rollout.jsonl>');
  }
  return {
    transcript: resolve(positionals[0]),
    codexHome: resolveCodexHome(values['codex-home']),
  };
}

function trunc(value, limit) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)} …[+${text.length - limit} chars]`;
}

function indent(text) {
  return String(text)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

function shortTimestamp(timestamp) {
  return typeof timestamp === 'string' ? timestamp.replace(/\.\d+Z$/, 'Z') : 'unknown-time';
}

function yamlString(value, fallback = 'unknown') {
  return JSON.stringify(value || fallback);
}

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return JSON.stringify(content ?? '');
  return content
    .map((block) => {
      if (typeof block === 'string') return block;
      return block?.text ?? block?.input_text ?? block?.output_text ?? '';
    })
    .filter(Boolean)
    .join('\n');
}

function userContentText(content) {
  if (!Array.isArray(content)) return contentText(content);
  return content
    .map((block) => (typeof block === 'string' ? block : (block?.text ?? '')))
    .filter(
      (text) =>
        text &&
        !text.startsWith('<recommended_plugins>') &&
        !text.startsWith('# AGENTS.md instructions for ') &&
        !text.startsWith('<environment_context>')
    )
    .join('\n');
}

function outputText(output) {
  if (!Array.isArray(output)) return contentText(output);
  return output.map((block) => block?.text ?? JSON.stringify(block)).join('\n');
}

function looksLikeFailure(text) {
  return [
    /\bexit[_ ]code["'\s:=]+[1-9]\d*\b/i,
    /\b(?:script failed|command failed|tool failed)\b/i,
    /\b(?:fatal|error|failure):/i,
    /\b(?:permission denied|operation not permitted|command not found|no such file|timed out|requires approval)\b/i,
    /["']isError["']\s*:\s*true/i,
  ].some((pattern) => pattern.test(text));
}

function loadThread(codexHome, sessionId, transcript) {
  const path = threadDatabasePath(codexHome);
  if (!existsSync(path)) {
    return { thread: null, metadataSource: 'none', metadataPathMismatch: false };
  }

  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return lookupThreadMetadata(database, availableThreadColumns(database), sessionId, transcript);
  } finally {
    database.close();
  }
}

function addSkipped(skipped, key) {
  skipped[key] = (skipped[key] ?? 0) + 1;
}

function addBody(body, lineNumber, timestamp, label, text) {
  body.push(`L${lineNumber} ${shortTimestamp(timestamp)} ${label}\n${indent(text)}`);
}

function recordCompaction(record, lineNumber, state, label, text) {
  const timestampMs = Date.parse(record.timestamp);
  if (
    Number.isFinite(timestampMs) &&
    Number.isFinite(state.lastCompactionTimestampMs) &&
    Math.abs(timestampMs - state.lastCompactionTimestampMs) <= 1_000
  ) {
    addSkipped(state.skipped, 'duplicate_compaction_notification');
    return;
  }
  state.lastCompactionTimestampMs = timestampMs;
  state.counts.compactions++;
  addBody(state.body, lineNumber, record.timestamp, label, text);
}

function handleResponseItem(record, lineNumber, state) {
  const payload = record.payload ?? {};
  const type = payload.type;

  if (type === 'message' && payload.role === 'user') {
    const text = userContentText(payload.content);
    if (!text) {
      addSkipped(state.skipped, 'response_item.message.injected_user_context');
      return;
    }
    state.counts.userMessages++;
    addBody(state.body, lineNumber, record.timestamp, 'USER', trunc(text, USER_PREVIEW_CHARS));
    return;
  }

  if (type === 'message' && payload.role === 'assistant') {
    const text = contentText(payload.content);
    if (!text) return;
    state.counts.assistantMessages++;
    const phase = payload.phase ? ` ${String(payload.phase).toUpperCase()}` : '';
    addBody(state.body, lineNumber, record.timestamp, `ASSISTANT${phase}`, text);
    return;
  }

  if (type === 'agent_message') {
    const text = contentText(payload.content);
    if (!text) return;
    state.counts.delegatedMessages++;
    addBody(
      state.body,
      lineNumber,
      record.timestamp,
      'DELEGATED MESSAGE',
      trunc(text, USER_PREVIEW_CHARS)
    );
    return;
  }

  if (type === 'custom_tool_call' || type === 'function_call') {
    state.counts.toolCalls++;
    const callId = payload.call_id ?? payload.id ?? 'no-call-id';
    const name = payload.name ?? type;
    const input = payload.input ?? payload.arguments ?? {};
    addBody(
      state.body,
      lineNumber,
      record.timestamp,
      `TOOL CALL ${name} [${callId}]`,
      trunc(input, TOOL_INPUT_PREVIEW_CHARS)
    );
    return;
  }

  if (type === 'custom_tool_call_output' || type === 'function_call_output') {
    state.counts.toolResults++;
    const callId = payload.call_id ?? 'no-call-id';
    const text = outputText(payload.output);
    const suspectedFailure = looksLikeFailure(text);
    if (suspectedFailure) state.counts.suspectedFailedToolResults++;
    addBody(
      state.body,
      lineNumber,
      record.timestamp,
      `TOOL RESULT${suspectedFailure ? ' ?FAILURE' : ''} [${callId}]`,
      trunc(text, suspectedFailure ? SUSPECTED_FAILURE_PREVIEW_CHARS : RESULT_PREVIEW_CHARS)
    );
    return;
  }

  addSkipped(state.skipped, `response_item.${type ?? 'unknown'}.${payload.role ?? 'none'}`);
}

function handleEvent(record, lineNumber, state) {
  const payload = record.payload ?? {};
  if (payload.type === 'context_compacted') {
    recordCompaction(
      record,
      lineNumber,
      state,
      'COMPACTION EVENT',
      'Raw earlier records remain in this JSONL.'
    );
    return;
  }

  if (payload.type === 'patch_apply_end' || payload.type === 'mcp_tool_call_end') {
    const text = JSON.stringify(payload);
    if (looksLikeFailure(text)) {
      addBody(
        state.body,
        lineNumber,
        record.timestamp,
        `OPERATION EVENT ?FAILURE ${payload.type}`,
        trunc(text, OPERATION_EVENT_PREVIEW_CHARS)
      );
      return;
    }
  }

  addSkipped(state.skipped, `event_msg.${payload.type ?? 'unknown'}`);
}

async function buildSkeleton(options) {
  if (!existsSync(options.transcript))
    throw new Error(`transcript not found: ${options.transcript}`);

  const state = {
    meta: {
      sessionId: null,
      source: null,
      originator: null,
      cliVersion: null,
      cwd: null,
      gitCommit: null,
    },
    models: new Set(),
    efforts: new Set(),
    started: null,
    ended: null,
    counts: {
      userMessages: 0,
      assistantMessages: 0,
      delegatedMessages: 0,
      toolCalls: 0,
      toolResults: 0,
      suspectedFailedToolResults: 0,
      compactions: 0,
      parseFailures: 0,
    },
    skipped: {},
    body: [],
    lastCompactionTimestampMs: Number.NaN,
  };

  const lines = createInterface({
    input: createReadStream(options.transcript),
    crlfDelay: Infinity,
  });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber++;
    if (!line) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      state.counts.parseFailures++;
      continue;
    }

    state.started ??= record.timestamp ?? null;
    state.ended = record.timestamp ?? state.ended;

    if (record.type === 'session_meta') {
      const payload = record.payload ?? {};
      state.meta.sessionId ??= payload.session_id ?? payload.id ?? null;
      state.meta.source ??= payload.source ?? null;
      state.meta.originator ??= payload.originator ?? null;
      state.meta.cliVersion ??= payload.cli_version ?? null;
      state.meta.cwd ??= payload.cwd ?? null;
      state.meta.gitCommit ??= payload.git?.commit_hash ?? null;
      state.started = payload.timestamp ?? state.started;
    } else if (record.type === 'turn_context') {
      if (record.payload?.model) state.models.add(record.payload.model);
      if (record.payload?.effort) state.efforts.add(record.payload.effort);
      state.meta.cwd ??= record.payload?.cwd ?? null;
    } else if (record.type === 'response_item') {
      handleResponseItem(record, lineNumber, state);
    } else if (record.type === 'event_msg') {
      handleEvent(record, lineNumber, state);
    } else if (record.type === 'compacted') {
      recordCompaction(
        record,
        lineNumber,
        state,
        'COMPACTION RECORD',
        'Raw earlier records remain in this JSONL; replacement_history is intentionally omitted.'
      );
    } else {
      addSkipped(state.skipped, record.type ?? 'unknown');
    }
  }

  const metadata = loadThread(options.codexHome, state.meta.sessionId, options.transcript);
  const thread = metadata.metadataPathMismatch ? null : metadata.thread;
  const source = thread?.source ?? state.meta.source;
  const rawTitle = thread?.name || thread?.title || thread?.agent_path || '(untitled)';
  const title = trunc(rawTitle, TITLE_PREVIEW_CHARS);
  const models = thread?.model ? [thread.model] : [...state.models];
  const efforts = thread?.reasoning_effort ? [thread.reasoning_effort] : [...state.efforts];
  const sessionId = metadata.metadataPathMismatch
    ? sessionIdFromRolloutPath(options.transcript)
    : (thread?.id ?? state.meta.sessionId ?? sessionIdFromRolloutPath(options.transcript));
  const sessionIdSource = metadata.metadataPathMismatch
    ? 'rollout_filename'
    : thread?.id
      ? metadata.metadataSource
      : state.meta.sessionId
        ? 'session_meta'
        : 'rollout_filename';
  const header = [
    '---',
    `session_id: ${yamlString(sessionId, basename(options.transcript))}`,
    `session_id_source: ${yamlString(sessionIdSource)}`,
    `title: ${yamlString(title)}`,
    `title_truncated: ${rawTitle.length > TITLE_PREVIEW_CHARS}`,
    'agent: "codex"',
    `interface: ${yamlString(interfaceName(source, state.meta.originator))}`,
    `source: ${yamlString(source)}`,
    `originator: ${yamlString(state.meta.originator)}`,
    `metadata_source: ${yamlString(metadata.metadataSource)}`,
    `metadata_path_mismatch: ${metadata.metadataPathMismatch}`,
    `model: ${yamlString(models.join(', '))}`,
    `reasoning_effort: ${yamlString(efforts.join(', '))}`,
    `cli_version: ${yamlString(thread?.cli_version ?? state.meta.cliVersion)}`,
    `git_branch: ${yamlString(thread?.git_branch)}`,
    `git_commit: ${yamlString(thread?.git_sha ?? state.meta.gitCommit)}`,
    `cwd: ${yamlString(thread?.cwd ?? state.meta.cwd)}`,
    `archived: ${thread ? Boolean(thread.archived) : yamlString(null)}`,
    `started: ${yamlString(state.started)}`,
    `ended: ${yamlString(state.ended)}`,
    `transcript: ${yamlString(options.transcript)}`,
    `transcript_bytes: ${statSync(options.transcript).size}`,
    `user_messages: ${state.counts.userMessages}`,
    `assistant_messages: ${state.counts.assistantMessages}`,
    `delegated_messages: ${state.counts.delegatedMessages}`,
    `tool_calls: ${state.counts.toolCalls}`,
    `tool_results: ${state.counts.toolResults}`,
    `suspected_failed_tool_results: ${state.counts.suspectedFailedToolResults}`,
    `compactions: ${state.counts.compactions}`,
    `parse_failures: ${state.counts.parseFailures}`,
    `skipped_record_types: ${JSON.stringify(state.skipped)}`,
    '---',
  ];

  return `${header.join('\n')}\n${state.body.length ? `${state.body.join('\n\n')}\n` : ''}`;
}

try {
  const output = await buildSkeleton(parseOptions());
  process.stdout.write(output);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
