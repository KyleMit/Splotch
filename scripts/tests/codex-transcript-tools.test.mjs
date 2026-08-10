import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

const catalogBin = fileURLToPath(
  new URL('../../.agents/skills/analyze-session-transcripts/catalog.mjs', import.meta.url)
);
const skeletonBin = fileURLToPath(
  new URL('../../.agents/skills/analyze-session-transcripts/skeleton.mjs', import.meta.url)
);
const dirs = [];

function createCodexHome() {
  const codexHome = mkdtempSync(join(tmpdir(), 'splotch-codex-transcripts-'));
  dirs.push(codexHome);
  const database = new DatabaseSync(join(codexHome, 'state_5.sqlite'));
  database.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      name TEXT,
      source TEXT NOT NULL,
      cwd TEXT NOT NULL,
      archived INTEGER NOT NULL,
      rollout_path TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_at_ms INTEGER,
      recency_at_ms INTEGER,
      model TEXT,
      reasoning_effort TEXT,
      cli_version TEXT,
      git_branch TEXT,
      git_sha TEXT
    )
  `);
  return { codexHome, database };
}

function insertThread(database, values) {
  database
    .prepare(
      `
      INSERT INTO threads (
        id, title, name, source, cwd, archived, rollout_path, updated_at, updated_at_ms,
        recency_at_ms, model, reasoning_effort, cli_version, git_branch, git_sha
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      values.id,
      values.title,
      values.name ?? null,
      values.source,
      values.cwd,
      values.archived ? 1 : 0,
      values.rolloutPath,
      Math.floor(values.recencyMs / 1000),
      values.recencyMs,
      values.recencyMs,
      values.model ?? 'gpt-test',
      values.reasoningEffort ?? 'high',
      values.cliVersion ?? '0.test',
      values.gitBranch ?? 'main',
      values.gitSha ?? 'abc123'
    );
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

describe('Codex transcript catalog', () => {
  it('combines active and archived CLI/Desktop sessions by recency and excludes automated threads', () => {
    const { codexHome, database } = createCodexHome();
    const repo = '/repo';
    insertThread(database, {
      id: 'cli-active',
      title: 'CLI active',
      source: 'cli',
      cwd: repo,
      archived: false,
      rolloutPath: join(codexHome, 'sessions', 'cli.jsonl'),
      recencyMs: 3_000,
    });
    insertThread(database, {
      id: 'desktop-archived',
      title: 'Desktop archived',
      name: 'Renamed session',
      source: 'vscode',
      cwd: repo,
      archived: true,
      rolloutPath: join(codexHome, 'archived_sessions', 'desktop.jsonl'),
      recencyMs: 4_000,
    });
    insertThread(database, {
      id: 'guardian',
      title: 'Automated guardian',
      source: '{"subagent":{"other":"guardian"}}',
      cwd: repo,
      archived: false,
      rolloutPath: join(codexHome, 'sessions', 'guardian.jsonl'),
      recencyMs: 5_000,
    });
    const delegatedTranscript = join(codexHome, 'sessions', 'delegated.jsonl');
    mkdirSync(join(codexHome, 'sessions'), { recursive: true });
    writeFileSync(
      delegatedTranscript,
      `${JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'agent_message',
          content: [
            { type: 'input_text', text: 'Message Type: NEW_TASK\nTask name: /root/worker' },
          ],
        },
      })}\n`
    );
    insertThread(database, {
      id: 'legacy-delegated-cli',
      title: 'Legacy delegated task',
      source: 'cli',
      cwd: repo,
      archived: false,
      rolloutPath: delegatedTranscript,
      recencyMs: 6_000,
    });
    database.close();

    const output = execFileSync(
      process.execPath,
      [catalogBin, '--codex-home', codexHome, '--cwd', repo, '--limit', '10', '--json'],
      { encoding: 'utf8' }
    );
    const rows = JSON.parse(output);

    expect(rows.map(({ session_id }) => session_id)).toEqual(['desktop-archived', 'cli-active']);
    expect(rows[0]).toMatchObject({
      title: 'Renamed session',
      interface: 'desktop',
      archived: true,
      transcript_exists: false,
    });
    expect(rows[1]).toMatchObject({ interface: 'cli', archived: false });
  });
});

describe('Codex transcript skeleton', () => {
  it('normalizes messages, tool failures, compaction, and database metadata with raw line anchors', () => {
    const { codexHome, database } = createCodexHome();
    const transcriptDir = join(codexHome, 'archived_sessions');
    mkdirSync(transcriptDir, { recursive: true });
    const transcript = join(transcriptDir, 'session.jsonl');
    const records = [
      {
        timestamp: '2026-08-10T12:00:00.000Z',
        type: 'session_meta',
        payload: {
          session_id: 'parent-session',
          timestamp: '2026-08-10T11:59:59.000Z',
          cwd: '/repo',
          originator: 'Codex Desktop',
          cli_version: '0.test',
          source: 'vscode',
          git: { commit_hash: 'abc123' },
        },
      },
      {
        timestamp: '2026-08-10T12:00:01.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: '<recommended_plugins>noise</recommended_plugins>' },
            { type: 'input_text', text: '# AGENTS.md instructions for /repo\nnoise' },
            { type: 'input_text', text: '<environment_context>noise</environment_context>' },
          ],
        },
      },
      {
        timestamp: '2026-08-10T12:00:02.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Run the check 🎨' }],
        },
      },
      {
        timestamp: '2026-08-10T12:00:03.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          phase: 'commentary',
          content: [{ type: 'output_text', text: 'Checking it.' }],
        },
      },
      {
        timestamp: '2026-08-10T12:00:04.000Z',
        type: 'response_item',
        payload: {
          type: 'custom_tool_call',
          name: 'exec',
          call_id: 'call-1',
          input: 'await tools.exec_command({cmd:"false"})',
        },
      },
      {
        timestamp: '2026-08-10T12:00:05.000Z',
        type: 'response_item',
        payload: {
          type: 'custom_tool_call_output',
          call_id: 'call-1',
          output: [{ type: 'input_text', text: 'Script completed\n{"exit_code":1}' }],
        },
      },
      {
        timestamp: '2026-08-10T12:00:06.000Z',
        type: 'compacted',
        payload: { replacement_history: [{ role: 'user', content: 'lossy summary' }] },
      },
      {
        timestamp: '2026-08-10T12:00:07.000Z',
        type: 'event_msg',
        payload: { type: 'context_compacted' },
      },
      {
        timestamp: '2026-08-10T12:00:08.000Z',
        type: 'response_item',
        payload: { type: 'reasoning', summary: [{ type: 'summary_text', text: 'hidden' }] },
      },
    ];
    const content = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
    writeFileSync(transcript, content);
    insertThread(database, {
      id: 'session-1',
      title: 'Fallback title',
      name: 'Desktop audit',
      source: 'vscode',
      cwd: '/repo',
      archived: true,
      rolloutPath: transcript,
      recencyMs: 10_000,
    });
    database.close();

    const output = execFileSync(
      process.execPath,
      [skeletonBin, '--codex-home', codexHome, transcript],
      { encoding: 'utf8' }
    );

    expect(output).toContain('title: "Desktop audit"');
    expect(output).toContain('session_id: "session-1"');
    expect(output).toContain('interface: "desktop"');
    expect(output).toContain('archived: true');
    expect(output).toContain(`transcript_bytes: ${Buffer.byteLength(content, 'utf8')}`);
    expect(output).toContain('user_messages: 1');
    expect(output).toContain('suspected_failed_tool_results: 1');
    expect(output).toContain('compactions: 1');
    expect(output).toContain('"duplicate_compaction_notification":1');
    expect(output).toContain('L3 2026-08-10T12:00:02Z USER');
    expect(output).toContain('L6 2026-08-10T12:00:05Z TOOL RESULT ?FAILURE [call-1]');
    expect(output).toContain('L7 2026-08-10T12:00:06Z COMPACTION RECORD');
    expect(output).not.toContain('recommended_plugins');
    expect(output).not.toContain('AGENTS.md instructions');
    expect(output).not.toContain('lossy summary');
    expect(output).not.toContain('hidden');
  });
});
