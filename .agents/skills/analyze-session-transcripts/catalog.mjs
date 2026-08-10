import { closeSync, existsSync, openSync, readSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';

const TITLE_PREVIEW_CHARS = 240;
const ROLLOUT_PREFIX_BYTES = 256 * 1024;
const CANDIDATE_MULTIPLIER = 10;

function parseOptions() {
  const { values, positionals } = parseArgs({
    options: {
      limit: { type: 'string', default: '10' },
      cwd: { type: 'string' },
      'all-cwds': { type: 'boolean', default: false },
      'include-automated': { type: 'boolean', default: false },
      'codex-home': { type: 'string' },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });
  if (positionals.length) throw new Error(`unexpected arguments: ${positionals.join(' ')}`);

  const limit = Number.parseInt(values.limit, 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('--limit must be an integer from 1 through 500');
  }

  return {
    limit,
    cwd: values.cwd ?? process.cwd(),
    allCwds: values['all-cwds'],
    includeAutomated: values['include-automated'],
    codexHome: resolve(values['codex-home'] ?? process.env.CODEX_HOME ?? join(homedir(), '.codex')),
    json: values.json,
  };
}

function availableColumns(database) {
  return new Set(
    database
      .prepare('PRAGMA table_info(threads)')
      .all()
      .map(({ name }) => name)
  );
}

function recencyExpression(columns) {
  if (columns.has('recency_at_ms')) {
    return 'COALESCE(NULLIF(recency_at_ms, 0), updated_at_ms, updated_at * 1000)';
  }
  if (columns.has('updated_at_ms')) return 'COALESCE(updated_at_ms, updated_at * 1000)';
  return 'updated_at * 1000';
}

function optionalColumn(columns, name, fallback) {
  return columns.has(name) ? name : `${fallback} AS ${name}`;
}

function interfaceName(source) {
  if (source === 'vscode') return 'desktop';
  if (source === 'cli') return 'cli';
  return source;
}

function isoTimestamp(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function truncateTitle(title) {
  if (title.length <= TITLE_PREVIEW_CHARS) return title;
  return `${title.slice(0, TITLE_PREVIEW_CHARS)} …[+${title.length - TITLE_PREVIEW_CHARS} chars]`;
}

function isDelegatedThread(path) {
  if (!existsSync(path)) return false;
  const descriptor = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(ROLLOUT_PREFIX_BYTES);
    const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0);
    for (const line of buffer.toString('utf8', 0, bytesRead).split('\n').slice(0, 40)) {
      if (!line) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (record.type !== 'response_item' || record.payload?.type !== 'agent_message') continue;
      const text = (record.payload.content ?? []).map((block) => block?.text ?? '').join('\n');
      if (text.startsWith('Message Type: NEW_TASK\n')) return true;
    }
    return false;
  } finally {
    closeSync(descriptor);
  }
}

function sessionRows(database, options) {
  const columns = availableColumns(database);
  const recency = recencyExpression(columns);
  const title = columns.has('name')
    ? "COALESCE(NULLIF(name, ''), NULLIF(title, ''), '(untitled)')"
    : "COALESCE(NULLIF(title, ''), '(untitled)')";
  const filters = [];
  const parameters = [];

  if (!options.allCwds) {
    filters.push('cwd = ?');
    parameters.push(options.cwd);
  }
  if (!options.includeAutomated) filters.push("source IN ('cli', 'vscode')");

  const query = `
    SELECT
      id,
      ${title} AS title,
      ${recency} AS recency_ms,
      source,
      cwd,
      archived,
      rollout_path,
      ${optionalColumn(columns, 'model', "''")},
      ${optionalColumn(columns, 'reasoning_effort', "''")},
      ${optionalColumn(columns, 'cli_version', "''")}
    FROM threads
    ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
    ORDER BY recency_ms DESC, id DESC
    LIMIT ?
  `;
  parameters.push(Math.min(options.limit * CANDIDATE_MULTIPLIER, 5_000));

  return database
    .prepare(query)
    .all(...parameters)
    .filter((row) => options.includeAutomated || !isDelegatedThread(row.rollout_path))
    .slice(0, options.limit)
    .map((row) => ({
      session_id: row.id,
      title: truncateTitle(row.title),
      title_truncated: row.title.length > TITLE_PREVIEW_CHARS,
      interface: interfaceName(row.source),
      source: row.source,
      archived: Boolean(row.archived),
      recency: isoTimestamp(row.recency_ms),
      cwd: row.cwd,
      model: row.model || null,
      reasoning_effort: row.reasoning_effort || null,
      cli_version: row.cli_version || null,
      transcript: row.rollout_path,
      transcript_exists: existsSync(row.rollout_path),
    }));
}

function markdownCell(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
}

function printRows(rows, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }

  console.log('| Recency | State | Interface | Session | Title | Transcript |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    const state = row.archived ? 'archived' : 'active';
    const transcript = row.transcript_exists ? row.transcript : `${row.transcript} (missing)`;
    console.log(
      `| ${markdownCell(row.recency)} | ${state} | ${markdownCell(row.interface)} | ${row.session_id} | ${markdownCell(row.title)} | ${markdownCell(transcript)} |`
    );
  }
}

function main() {
  const options = parseOptions();
  const databasePath = join(options.codexHome, 'state_5.sqlite');
  if (!existsSync(databasePath))
    throw new Error(`Codex thread database not found: ${databasePath}`);

  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    printRows(sessionRows(database, options), options.json);
  } finally {
    database.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
