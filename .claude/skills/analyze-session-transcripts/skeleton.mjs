import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const USER_TEXT_PREVIEW_CHARS = 1500;
const TOOL_INPUT_PREVIEW_CHARS = 2000;
const RESULT_PREVIEW_CHARS = 200;
// Errored results get a deeper preview: they are rare (single digits per session) and are
// primary evidence for the failed-command report category.
const ERROR_RESULT_PREVIEW_CHARS = 1200;
const SUMMARY_PREVIEW_CHARS = 600;

function trunc(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)} …[+${text.length - max} chars]`;
}

function indent(text) {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

function shortTimestamp(ts) {
  return typeof ts === 'string' ? ts.replace(/\.\d+Z$/, 'Z') : '';
}

function blockText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((b) => (typeof b === 'string' ? b : (b?.text ?? ''))).join('\n');
  }
  return JSON.stringify(content ?? '');
}

function toolUsePreview(block) {
  const input = block.input ?? {};
  if (block.name === 'Bash') {
    const head = input.description ? `# ${input.description}\n` : '';
    return head + trunc(input.command ?? '', TOOL_INPUT_PREVIEW_CHARS);
  }
  if (typeof input.content === 'string' && input.file_path) {
    return `${input.file_path}\n${trunc(input.content, TOOL_INPUT_PREVIEW_CHARS)}`;
  }
  if (input.file_path) return input.file_path;
  if (typeof input.prompt === 'string') return trunc(input.prompt, RESULT_PREVIEW_CHARS);
  return trunc(JSON.stringify(input), RESULT_PREVIEW_CHARS);
}

function main() {
  const path = process.argv[2];
  if (!path || process.argv.length > 3) {
    console.error('usage: node skeleton.mjs <transcript.jsonl>');
    process.exit(1);
  }

  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n');

  const meta = {
    sessionId: null,
    title: null,
    model: null,
    version: null,
    entrypoint: null,
    gitBranch: null,
    cwd: null,
    pr: null,
    started: null,
    ended: null,
  };
  const counts = { user: 0, assistant: 0, toolCalls: 0, erroredResults: 0, parseFailures: 0 };
  const skippedTypes = {};
  const body = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    let record;
    try {
      record = JSON.parse(lines[i]);
    } catch {
      counts.parseFailures++;
      continue;
    }

    meta.sessionId ??= record.sessionId ?? null;
    meta.version ??= record.version ?? null;
    meta.entrypoint ??= record.entrypoint ?? null;
    meta.gitBranch ??= record.gitBranch ?? null;
    meta.cwd ??= record.cwd ?? null;
    meta.pr ??= record.prUrl ?? (record.prNumber ? `#${record.prNumber}` : null);
    if (record.type === 'ai-title' && record.aiTitle) meta.title = record.aiTitle;
    if (record.message?.model) meta.model = record.message.model;
    if (record.timestamp) {
      meta.started ??= record.timestamp;
      meta.ended = record.timestamp;
    }

    const lineNo = i + 1;
    const ts = shortTimestamp(record.timestamp);

    if (record.type === 'summary' && record.summary) {
      body.push(`L${lineNo} SUMMARY (compaction)`);
      body.push(indent(trunc(record.summary, SUMMARY_PREVIEW_CHARS)));
      continue;
    }

    if (record.type === 'system') {
      const label = record.subtype ? `SYSTEM:${record.subtype}` : 'SYSTEM';
      body.push(`L${lineNo} ${ts} ${label}`);
      const text = blockText(record.content);
      if (text) body.push(indent(trunc(text, RESULT_PREVIEW_CHARS)));
      continue;
    }

    if ((record.type === 'user' || record.type === 'assistant') && record.message) {
      counts[record.type]++;
      const marks = [record.isSidechain ? '(sidechain)' : '', record.isMeta ? '(meta)' : '']
        .filter(Boolean)
        .join(' ');
      const header = `L${lineNo} ${ts} ${record.type.toUpperCase()}${marks ? ` ${marks}` : ''}`;
      let headerEmitted = false;
      const emitHeader = () => {
        if (!headerEmitted) body.push(header);
        headerEmitted = true;
      };

      const content = record.message.content;
      const blocks = Array.isArray(content)
        ? content
        : [{ type: 'text', text: blockText(content) }];
      for (const block of blocks) {
        if (block.type === 'text' && block.text?.trim()) {
          emitHeader();
          const text =
            record.type === 'assistant' ? block.text : trunc(block.text, USER_TEXT_PREVIEW_CHARS);
          body.push(indent(text));
        } else if (block.type === 'tool_use') {
          counts.toolCalls++;
          emitHeader();
          body.push(`    ▶ ${block.name}`);
          body.push(indent(toolUsePreview(block)));
        } else if (block.type === 'tool_result') {
          const text = blockText(block.content);
          if (block.is_error) {
            counts.erroredResults++;
            emitHeader();
            body.push(`    ✗ TOOL_RESULT ERROR (${text.length} chars)`);
            body.push(indent(trunc(text, ERROR_RESULT_PREVIEW_CHARS)));
          } else {
            emitHeader();
            body.push(`    ✓ tool_result (${text.length} chars)`);
            if (text.trim()) body.push(indent(trunc(text, RESULT_PREVIEW_CHARS)));
          }
        }
      }
      continue;
    }

    skippedTypes[record.type ?? 'unknown'] = (skippedTypes[record.type ?? 'unknown'] ?? 0) + 1;
  }

  // JSON string encoding is a valid YAML double-quoted scalar, so quoting every
  // string field keeps values like `#916` from parsing as YAML comments.
  const yamlString = (value) => JSON.stringify(String(value));
  const frontMatter = [
    '---',
    `session_id: ${yamlString(meta.sessionId ?? basename(path, '.jsonl'))}`,
    `title: ${yamlString(meta.title ?? '(untitled)')}`,
    `agent: ${yamlString('claude')}`,
    `model: ${yamlString(meta.model ?? 'unknown')}`,
    `cli_version: ${yamlString(meta.version ?? 'unknown')}`,
    `entrypoint: ${yamlString(meta.entrypoint ?? 'unknown')}`,
    `git_branch: ${yamlString(meta.gitBranch ?? 'unknown')}`,
    `cwd: ${yamlString(meta.cwd ?? 'unknown')}`,
    `pr: ${yamlString(meta.pr ?? 'none')}`,
    `started: ${yamlString(shortTimestamp(meta.started) || 'unknown')}`,
    `ended: ${yamlString(shortTimestamp(meta.ended) || 'unknown')}`,
    `transcript_bytes: ${Buffer.byteLength(raw, 'utf8')}`,
    `user_records: ${counts.user}`,
    `assistant_records: ${counts.assistant}`,
    `tool_calls: ${counts.toolCalls}`,
    `errored_tool_results: ${counts.erroredResults}`,
    `parse_failures: ${counts.parseFailures}`,
    `skipped_record_types: ${JSON.stringify(skippedTypes)}`,
    '---',
    '',
  ];

  process.stdout.write(frontMatter.join('\n') + body.join('\n') + '\n');
}

main();
