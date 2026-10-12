import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

function writeTranscript(codexHome, records, filename = 'session.jsonl') {
  const transcriptDir = join(codexHome, 'archived_sessions');
  mkdirSync(transcriptDir, { recursive: true });
  const transcript = join(transcriptDir, filename);
  const content = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  writeFileSync(transcript, content);
  return { transcript, content };
}

function sessionMeta(overrides = {}) {
  return {
    timestamp: '2026-08-10T12:00:00.000Z',
    type: 'session_meta',
    payload: {
      session_id: 'session-1',
      timestamp: '2026-08-10T11:59:59.000Z',
      cwd: '/repo',
      originator: 'Codex Desktop',
      cli_version: '0.test',
      source: 'vscode',
      git: { commit_hash: 'abc123' },
      ...overrides,
    },
  };
}

function runCatalog(codexHome, ...args) {
  return JSON.parse(
    execFileSync(process.execPath, [catalogBin, '--codex-home', codexHome, ...args, '--json'], {
      encoding: 'utf8',
    })
  );
}

function runSkeleton(codexHome, transcript) {
  return execFileSync(process.execPath, [skeletonBin, '--codex-home', codexHome, transcript], {
    encoding: 'utf8',
  });
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

    const rows = runCatalog(codexHome, '--cwd', repo, '--limit', '10');

    expect(rows.map(({ session_id }) => session_id)).toEqual(['desktop-archived', 'cli-active']);
    expect(rows[0]).toMatchObject({
      title: 'Renamed session',
      interface: 'desktop',
      archived: true,
      transcript_exists: false,
    });
    expect(rows[1]).toMatchObject({ interface: 'cli', archived: false });
  });

  it('classifies included automated subagents without leaking their raw source as the interface', () => {
    const { codexHome, database } = createCodexHome();
    insertThread(database, {
      id: 'guardian',
      title: 'Automated guardian',
      source: '{"subagent":{"other":"guardian"}}',
      cwd: '/repo',
      archived: false,
      rolloutPath: join(codexHome, 'sessions', 'guardian.jsonl'),
      recencyMs: 5_000,
    });
    database.close();

    const rows = runCatalog(codexHome, '--cwd', '/repo', '--limit', '10', '--include-automated');

    expect(rows[0]).toMatchObject({ interface: 'subagent', source: expect.stringContaining('{') });
  });

  it('uses updated_at when millisecond recency columns are absent', () => {
    const codexHome = mkdtempSync(join(tmpdir(), 'splotch-codex-transcripts-reduced-'));
    dirs.push(codexHome);
    const database = new DatabaseSync(join(codexHome, 'state_5.sqlite'));
    database.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source TEXT NOT NULL,
        cwd TEXT NOT NULL,
        archived INTEGER NOT NULL,
        rollout_path TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO threads VALUES ('reduced', 'Reduced schema', 'cli', '/repo', 0, '/missing', 2);
    `);
    database.close();

    const rows = runCatalog(codexHome, '--cwd', '/repo', '--limit', '10');

    expect(rows[0]).toMatchObject({
      session_id: 'reduced',
      recency: '1970-01-01T00:00:02.000Z',
    });
  });

  it('explains an empty cwd result and points to the cross-project flag', () => {
    const { codexHome, database } = createCodexHome();
    insertThread(database, {
      id: 'elsewhere',
      title: 'Elsewhere',
      source: 'cli',
      cwd: '/other-repo',
      archived: false,
      rolloutPath: join(codexHome, 'sessions', 'elsewhere.jsonl'),
      recencyMs: 1_000,
    });
    const delegatedTranscript = join(codexHome, 'sessions', 'diagnostic-delegated.jsonl');
    mkdirSync(join(codexHome, 'sessions'), { recursive: true });
    writeFileSync(
      delegatedTranscript,
      `${JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'agent_message',
          content: [{ type: 'input_text', text: 'Message Type: NEW_TASK\nTask name: worker' }],
        },
      })}\n`
    );
    insertThread(database, {
      id: 'delegated-elsewhere',
      title: 'Delegated elsewhere',
      source: 'cli',
      cwd: '/third-repo',
      archived: false,
      rolloutPath: delegatedTranscript,
      recencyMs: 2_000,
    });
    database.close();

    const result = spawnSync(
      process.execPath,
      [catalogBin, '--codex-home', codexHome, '--cwd', '/repo'],
      { encoding: 'utf8' }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      '| Recency | State | Interface | Session | Title | Transcript |'
    );
    expect(result.stderr.split('\n')).toContain(
      '0 sessions for "/repo"; 1 CLI/Desktop sessions exist under other working directories. Re-run with --all-cwds.'
    );
  });
});

describe('Codex transcript skeleton', () => {
  it('normalizes messages and compaction with raw line anchors', () => {
    const { codexHome, database } = createCodexHome();
    const records = [
      sessionMeta(),
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
        type: 'compacted',
        payload: { replacement_history: [{ role: 'user', content: 'lossy summary' }] },
      },
      {
        timestamp: '2026-08-10T12:00:05.000Z',
        type: 'event_msg',
        payload: { type: 'context_compacted' },
      },
      {
        timestamp: '2026-08-10T12:00:06.000Z',
        type: 'response_item',
        payload: { type: 'reasoning', summary: [{ type: 'summary_text', text: 'hidden' }] },
      },
    ];
    const { transcript, content } = writeTranscript(codexHome, records);
    insertThread(database, {
      id: 'session-1',
      title: 'Desktop audit',
      source: 'vscode',
      cwd: '/repo',
      archived: true,
      rolloutPath: transcript,
      recencyMs: 10_000,
    });
    database.close();

    const output = runSkeleton(codexHome, transcript);

    expect(output).toContain(`transcript_bytes: ${Buffer.byteLength(content, 'utf8')}`);
    expect(output).toContain('user_messages: 1');
    expect(output).toContain('compactions: 1');
    expect(output).toContain('"duplicate_compaction_notification":1');
    expect(output).toContain('L3 2026-08-10T12:00:02Z USER');
    expect(output).toContain('L5 2026-08-10T12:00:04Z COMPACTION RECORD');
    expect(output).not.toContain('recommended_plugins');
    expect(output).not.toContain('AGENTS.md instructions');
    expect(output).not.toContain('lossy summary');
    expect(output).not.toContain('hidden');
  });

  it('handles both tool envelopes, nested exit failures, successful statuses, and operation failures', () => {
    const { codexHome, database } = createCodexHome();
    const records = [
      sessionMeta(),
      {
        timestamp: '2026-08-10T12:00:01.000Z',
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          call_id: 'function-1',
          arguments: '{"cmd":"false"}',
        },
      },
      {
        timestamp: '2026-08-10T12:00:02.000Z',
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: 'function-1',
          output: 'Script completed\n{"exit_code":1}',
        },
      },
      {
        timestamp: '2026-08-10T12:00:03.000Z',
        type: 'response_item',
        payload: {
          type: 'custom_tool_call',
          name: 'web',
          call_id: 'custom-1',
          input: '{"url":"https://example.test"}',
        },
      },
      {
        timestamp: '2026-08-10T12:00:04.000Z',
        type: 'response_item',
        payload: {
          type: 'custom_tool_call_output',
          call_id: 'custom-1',
          output: [{ type: 'input_text', text: '{"status":200}' }],
        },
      },
      {
        timestamp: '2026-08-10T12:00:05.000Z',
        type: 'event_msg',
        payload: { type: 'mcp_tool_call_end', isError: true, message: 'upstream rejected call' },
      },
    ];
    const { transcript } = writeTranscript(codexHome, records);
    insertThread(database, {
      id: 'session-1',
      title: 'Tool session',
      source: 'vscode',
      cwd: '/repo',
      archived: false,
      rolloutPath: transcript,
      recencyMs: 10_000,
    });
    database.close();

    const output = runSkeleton(codexHome, transcript);

    expect(output).toContain('tool_calls: 2');
    expect(output).toContain('tool_results: 2');
    expect(output).toContain('suspected_failed_tool_results: 1');
    expect(output).toContain('L2 2026-08-10T12:00:01Z TOOL CALL exec_command [function-1]');
    expect(output).toContain('L3 2026-08-10T12:00:02Z TOOL RESULT ?FAILURE [function-1]');
    expect(output).toContain('L5 2026-08-10T12:00:04Z TOOL RESULT [custom-1]');
    expect(output).not.toContain('TOOL RESULT ?FAILURE [custom-1]');
    expect(output).toContain('L6 2026-08-10T12:00:05Z OPERATION EVENT ?FAILURE mcp_tool_call_end');
  });

  it('prefers an exact rollout row over a competing parent-session id row', () => {
    const { codexHome, database } = createCodexHome();
    const { transcript } = writeTranscript(
      codexHome,
      [sessionMeta({ session_id: 'parent-session' })],
      'child.jsonl'
    );
    insertThread(database, {
      id: 'parent-session',
      title: 'Parent title that must not win',
      source: 'cli',
      cwd: '/parent',
      archived: false,
      rolloutPath: join(codexHome, 'sessions', 'parent.jsonl'),
      recencyMs: 9_000,
    });
    insertThread(database, {
      id: 'child-session',
      title: 'Child title',
      source: 'vscode',
      cwd: '/repo',
      archived: true,
      rolloutPath: transcript,
      recencyMs: 10_000,
    });
    database.close();

    const output = runSkeleton(codexHome, transcript);

    expect(output).toContain('session_id: "child-session"');
    expect(output).toContain('title: "Child title"');
    expect(output).toContain('metadata_source: "rollout_path"');
    expect(output).toContain('metadata_path_mismatch: false');
    expect(output).not.toContain('Parent title that must not win');
  });

  it('surfaces an id fallback path mismatch without inheriting the other rollout identity', () => {
    const { codexHome, database } = createCodexHome();
    const { transcript } = writeTranscript(
      codexHome,
      [sessionMeta({ session_id: 'parent-session' })],
      'rollout-2026-08-10T12-00-00-019fc144-c307-7ee1-b0b3-c85ff58169dc.jsonl'
    );
    insertThread(database, {
      id: 'parent-session',
      title: 'Parent title that must be withheld',
      source: 'cli',
      cwd: '/parent',
      archived: true,
      rolloutPath: join(codexHome, 'sessions', 'parent.jsonl'),
      recencyMs: 9_000,
      gitBranch: 'parent-branch',
    });
    database.close();

    const output = runSkeleton(codexHome, transcript);

    expect(output).toContain('session_id: "019fc144-c307-7ee1-b0b3-c85ff58169dc"');
    expect(output).toContain('session_id_source: "rollout_filename"');
    expect(output).toContain('title: "(untitled)"');
    expect(output).toContain('metadata_source: "session_id_fallback"');
    expect(output).toContain('metadata_path_mismatch: true');
    expect(output).toContain('archived: "unknown"');
    expect(output).not.toContain('Parent title that must be withheld');
    expect(output).not.toContain('parent-branch');
    expect(output).not.toContain('session_id: "parent-session"');
  });

  it('recognizes a session-id fallback symlink as the same rollout', () => {
    const { codexHome, database } = createCodexHome();
    const { transcript } = writeTranscript(codexHome, [sessionMeta()]);
    const transcriptAlias = join(codexHome, 'session-alias.jsonl');
    symlinkSync(transcript, transcriptAlias);
    insertThread(database, {
      id: 'session-1',
      title: 'Aliased rollout',
      source: 'vscode',
      cwd: '/repo',
      archived: true,
      rolloutPath: transcript,
      recencyMs: 10_000,
    });
    database.close();

    const output = runSkeleton(codexHome, transcriptAlias);

    expect(output).toContain('title: "Aliased rollout"');
    expect(output).toContain('metadata_source: "session_id_fallback"');
    expect(output).toContain('metadata_path_mismatch: false');
    expect(output).toContain('archived: true');
  });

  it('marks and quantifies a truncated database title', () => {
    const { codexHome, database } = createCodexHome();
    const { transcript } = writeTranscript(codexHome, [sessionMeta()]);
    insertThread(database, {
      id: 'session-1',
      title: 'T'.repeat(420),
      source: 'vscode',
      cwd: '/repo',
      archived: false,
      rolloutPath: transcript,
      recencyMs: 10_000,
    });
    database.close();

    const output = runSkeleton(codexHome, transcript);

    expect(output).toContain('title_truncated: true');
    expect(output).toContain('…[+20 chars]');
  });
});
