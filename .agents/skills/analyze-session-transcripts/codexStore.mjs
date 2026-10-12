import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

export const CODEX_DB_FILENAME = 'state_5.sqlite';
const ROLLOUT_SESSION_ID_PATTERN =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

export function resolveCodexHome(explicitPath) {
  return resolve(explicitPath ?? process.env.CODEX_HOME ?? join(homedir(), '.codex'));
}

export function threadDatabasePath(codexHome) {
  return join(codexHome, CODEX_DB_FILENAME);
}

export function sessionIdFromRolloutPath(rolloutPath) {
  return rolloutPath.match(ROLLOUT_SESSION_ID_PATTERN)?.[1] ?? basename(rolloutPath, '.jsonl');
}

export function availableThreadColumns(database) {
  return new Set(
    database
      .prepare('PRAGMA table_info(threads)')
      .all()
      .map(({ name }) => name)
  );
}

export function interfaceName(source, originator) {
  if (typeof source === 'string' && source.startsWith('{')) {
    try {
      if (JSON.parse(source)?.subagent) return 'subagent';
    } catch {
      // The raw source remains the best available label when it is not valid JSON.
    }
  }
  if (source === 'vscode' || originator === 'Codex Desktop') return 'desktop';
  if (source === 'cli' || originator === 'codex-tui') return 'cli';
  return source || originator || 'unknown';
}

function canonicalPath(path) {
  if (!path) return null;
  if (!existsSync(path)) return resolve(path);
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function lookupThreadMetadata(database, columns, sessionId, transcript) {
  const selected = ['id', 'title', 'source', 'cwd', 'archived', 'rollout_path'];
  for (const optional of [
    'name',
    'model',
    'reasoning_effort',
    'cli_version',
    'git_branch',
    'git_sha',
    'agent_path',
    'agent_nickname',
  ]) {
    if (columns.has(optional)) selected.push(optional);
  }

  const query = `SELECT ${selected.join(', ')} FROM threads`;
  const exactThread = database.prepare(`${query} WHERE rollout_path = ?`).get(transcript);
  if (exactThread) {
    return {
      thread: exactThread,
      metadataSource: 'rollout_path',
      metadataPathMismatch: false,
    };
  }

  if (!sessionId) {
    return { thread: null, metadataSource: 'none', metadataPathMismatch: false };
  }

  const fallbackThread = database.prepare(`${query} WHERE id = ?`).get(sessionId);
  if (!fallbackThread) {
    return { thread: null, metadataSource: 'none', metadataPathMismatch: false };
  }

  return {
    thread: fallbackThread,
    metadataSource: 'session_id_fallback',
    metadataPathMismatch: canonicalPath(fallbackThread.rollout_path) !== canonicalPath(transcript),
  };
}
