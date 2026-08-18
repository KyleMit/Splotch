import { describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import {
  ALLOWED_PROMPT_ROOTS,
  authorizeResume,
  buildClaudeArgs,
  buildRunnerPrompt,
  createSessionRecord,
  endSession,
  parseRunArgs,
  readPromptFile,
  readSessionRecord,
  RUNNER_PATHS,
  sessionArguments,
  sessionRecordPath,
  updateSessionRecord,
} from '../../.agents/skills/run-claude/scripts/claude-run.mjs';
import {
  renderProgressEvent,
  runClaudeStreaming,
} from '../../.agents/skills/run-claude/scripts/splotch-claude-stream.mjs';
import {
  buildAuthorizationPrompt,
  endReviewerSession,
  parseReviewerArgs,
  planReviewerSession,
  readReviewerSession,
  REVIEWER_PATHS,
  reviewerSessionArguments,
} from '../../.agents/skills/run-claude/scripts/claude-review-publish.mjs';
import { HEALTH_PATHS } from '../../.agents/skills/run-claude/scripts/claude-health.mjs';
import {
  POLICY_RULES,
  replaceManagedRules,
  upsertTopLevelToml,
} from '../../.agents/skills/run-claude/scripts/install-codex-policy.mjs';
import {
  POLICY_CASES,
  REQUIRED_SKILL_EXECUTION_CONTRACT,
  validateCodexConfig,
  validateManagedRules,
  validateSkillExecutionContract,
} from '../../.agents/skills/run-claude/scripts/check-codex-policy.mjs';
import {
  EXPECTED_HOME,
  expectedRunClaudeFiles,
  INSTALL_PATHS,
} from '../../.agents/skills/run-claude/scripts/install-run-claude.mjs';
import {
  assertClaudePlanAuthentication,
  assertNoApiBillingEnvironment,
} from '../../.agents/skills/run-claude/scripts/splotch-claude-subscription-auth.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const SESSION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_SESSION_ID = 'ffffffff-0000-4111-8222-333333333333';

async function waitForProcessExit(pid, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    if (Date.now() > deadline) return false;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
}

describe('output-only Claude runner', () => {
  it('accepts a minimal prompt and closes every optional value set', () => {
    expect(parseRunArgs(['--prompt-file', '/private/tmp/ping.txt'])).toEqual({
      promptFile: '/private/tmp/ping.txt',
      profile: 'ask',
      cwd: undefined,
      model: 'sonnet',
      effort: 'high',
      persist: false,
      resume: undefined,
    });
    expect(() =>
      parseRunArgs(['--prompt-file', '/private/tmp/ping.txt', '--model', 'other'])
    ).toThrow('unsupported model');
    expect(() =>
      parseRunArgs(['--prompt-file', '/private/tmp/ping.txt', '--profile', 'inspect'])
    ).toThrow('requires --cwd');
    expect(() => parseRunArgs(['--prompt-file', '/private/tmp/ping.txt', '--cwd', '/tmp'])).toThrow(
      'only with --profile inspect'
    );
    expect(() =>
      parseRunArgs(['--prompt-file', '/private/tmp/ping.txt', '--dangerously-skip-permissions'])
    ).toThrow();
  });

  it('bounds the session controls to wrapper-issued UUID sessions', () => {
    expect(parseRunArgs(['--prompt-file', '/private/tmp/ping.txt', '--persist']).persist).toBe(
      true
    );
    expect(
      parseRunArgs(['--prompt-file', '/private/tmp/ping.txt', '--resume', SESSION_ID]).resume
    ).toBe(SESSION_ID);
    expect(parseRunArgs(['--end-session', SESSION_ID])).toEqual({ endSession: SESSION_ID });
    expect(() =>
      parseRunArgs(['--prompt-file', '/private/tmp/ping.txt', '--resume', 'not-a-uuid'])
    ).toThrow('UUIDs issued by this wrapper');
    expect(() =>
      parseRunArgs(['--prompt-file', '/private/tmp/ping.txt', '--persist', '--resume', SESSION_ID])
    ).toThrow('mutually exclusive');
    expect(() =>
      parseRunArgs(['--end-session', SESSION_ID, '--prompt-file', '/private/tmp/ping.txt'])
    ).toThrow('accepts no other options');
  });

  it('reads prompts only from bounded regular files', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'splotch-run-claude-test-'));
    try {
      const promptPath = join(temporaryRoot, 'prompt.txt');
      writeFileSync(promptPath, 'ping');
      const allowedRoots = [realpathSync(temporaryRoot)];
      expect(readPromptFile(promptPath, allowedRoots)).toBe('ping');
      expect(() => readPromptFile('relative.txt', allowedRoots)).toThrow('must be absolute');
      expect(() => readPromptFile('/etc/hosts', allowedRoots)).toThrow('must be under');
      expect(ALLOWED_PROMPT_ROOTS).toEqual([
        '/private/tmp',
        '/Users/kylemit/Code/Splotch',
        '/Users/kylemit/.codex/worktrees',
      ]);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('gives ask no tools and inspect only read tools', () => {
    const ask = buildClaudeArgs({
      prompt: 'ping',
      profile: 'ask',
      model: 'sonnet',
      effort: 'high',
    });
    const inspect = buildClaudeArgs({
      prompt: 'review',
      profile: 'inspect',
      model: 'opus',
      effort: 'medium',
    });
    expect(ask.slice(ask.indexOf('--tools'), ask.indexOf('--tools') + 2)).toEqual(['--tools', '']);
    expect(ask.slice(ask.indexOf('--tools'), ask.indexOf('--tools') + 3)).toEqual([
      '--tools',
      '',
      '--safe-mode',
    ]);
    expect(ask).not.toContain('--allowedTools');
    expect(inspect).toContain('Read,Grep,Glob');
    expect(inspect).not.toContain('Bash');
    expect(inspect).not.toContain('WebSearch');
    for (const arguments_ of [ask, inspect]) {
      expect(arguments_).toContain('--safe-mode');
      expect(arguments_).toContain('--no-session-persistence');
      expect(arguments_).toContain('stream-json');
      expect(arguments_).toContain('--verbose');
      expect(arguments_).not.toContain('--dangerously-skip-permissions');
      expect(arguments_).not.toContain('--bare');
      expect(arguments_.at(-1)).toContain('AUTHORIZED TASK');
      expect(arguments_.at(-3)).toBe('--effort');
    }
    expect(buildRunnerPrompt({ prompt: 'ping', profile: 'ask' })).toContain(
      'authorizes no external writes'
    );
  });

  it('persists or resumes a session only when the caller opts in', () => {
    expect(sessionArguments()).toEqual(['--no-session-persistence']);
    const created = buildClaudeArgs({
      prompt: 'ping',
      profile: 'ask',
      model: 'sonnet',
      effort: 'high',
      session: { mode: 'create', id: SESSION_ID },
    });
    expect(created).toContain('--session-id');
    expect(created).toContain(SESSION_ID);
    expect(created).not.toContain('--no-session-persistence');
    const resumed = buildClaudeArgs({
      prompt: 'follow-up',
      profile: 'inspect',
      model: 'sonnet',
      effort: 'high',
      session: { mode: 'resume', id: SESSION_ID },
    });
    expect(resumed).toContain('--resume');
    expect(resumed).toContain(SESSION_ID);
    expect(resumed).not.toContain('--no-session-persistence');
    expect(() => sessionArguments({ mode: 'other' })).toThrow('unsupported session mode');
  });

  it('resumes only recorded sessions and widens only ask to inspect', () => {
    expect(authorizeResume({ profile: 'ask' }, SESSION_ID, 'ask').profile).toBe('ask');
    expect(authorizeResume({ profile: 'ask' }, SESSION_ID, 'inspect').profile).toBe('inspect');
    expect(() => authorizeResume(null, OTHER_SESSION_ID, 'ask')).toThrow(
      'unknown run-claude session'
    );
    expect(authorizeResume({ profile: 'inspect' }, SESSION_ID, 'inspect').profile).toBe('inspect');
    expect(() => authorizeResume({ profile: 'inspect' }, SESSION_ID, 'ask')).toThrow(
      'widen ask to inspect'
    );
  });

  it('keeps one owner-only record per session so concurrent sessions never collide', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'splotch-run-claude-records-'));
    try {
      const directory = join(temporaryRoot, 'sessions');
      createSessionRecord(directory, SESSION_ID, { profile: 'ask' });
      createSessionRecord(directory, OTHER_SESSION_ID, { profile: 'inspect' });
      expect(statSync(sessionRecordPath(directory, SESSION_ID)).mode & 0o777).toBe(0o600);
      expect(() => createSessionRecord(directory, SESSION_ID, { profile: 'ask' })).toThrow();
      updateSessionRecord(directory, SESSION_ID, { profile: 'inspect', lastResumedAt: 'later' });
      expect(readSessionRecord(directory, SESSION_ID)).toEqual({
        profile: 'inspect',
        lastResumedAt: 'later',
      });
      expect(readSessionRecord(directory, OTHER_SESSION_ID)).toEqual({ profile: 'inspect' });
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('ends only recorded sessions and removes transcripts with their sidecars', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'splotch-run-claude-session-'));
    try {
      const paths = {
        sessionsDirectory: join(temporaryRoot, 'sessions'),
        claudeProjects: join(temporaryRoot, 'projects'),
      };
      createSessionRecord(paths.sessionsDirectory, SESSION_ID, { profile: 'ask' });
      createSessionRecord(paths.sessionsDirectory, OTHER_SESSION_ID, { profile: 'ask' });
      const project = join(paths.claudeProjects, 'some-project');
      const transcript = join(project, `${SESSION_ID}.jsonl`);
      const sidecarDirectory = join(project, SESSION_ID);
      mkdirSync(join(sidecarDirectory, 'tool-results'), { recursive: true });
      writeFileSync(transcript, '{}');
      writeFileSync(join(sidecarDirectory, 'tool-results', 'toolu_1.json'), '{}');
      endSession(SESSION_ID, paths);
      expect(existsSync(transcript)).toBe(false);
      expect(existsSync(sidecarDirectory)).toBe(false);
      expect(readSessionRecord(paths.sessionsDirectory, SESSION_ID)).toBeNull();
      expect(readSessionRecord(paths.sessionsDirectory, OTHER_SESSION_ID)).toEqual({
        profile: 'ask',
      });
      expect(() => endSession(SESSION_ID, paths)).toThrow('unknown run-claude session');
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects API-billed environments and accepts a logged-in plan session', () => {
    expect(() => assertNoApiBillingEnvironment({ ANTHROPIC_API_KEY: 'secret' })).toThrow(
      'API-billed authentication'
    );
    expect(() => assertNoApiBillingEnvironment({ CLAUDE_CODE_USE_BEDROCK: '1' })).toThrow(
      'CLAUDE_CODE_USE_BEDROCK'
    );
    expect(() =>
      assertNoApiBillingEnvironment({ CLAUDE_CODE_OAUTH_TOKEN: 'plan-token' })
    ).not.toThrow();
    expect(() =>
      assertClaudePlanAuthentication({ loggedIn: true, authMethod: 'oauth' })
    ).not.toThrow();
    expect(() => assertClaudePlanAuthentication({ loggedIn: true, authMethod: 'api_key' })).toThrow(
      'API-key'
    );
  });
});

describe('claude stream progress', () => {
  const stamped = new Date('2026-01-01T12:34:56');

  it('reduces stream events to compact one-line progress records', () => {
    expect(
      renderProgressEvent(
        { type: 'system', subtype: 'init', session_id: 'abc', model: 'opus' },
        stamped
      )
    ).toBe('[12:34:56] session abc model opus');
    expect(
      renderProgressEvent(
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: '  Reading the\n diff now.  ' },
              { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
            ],
          },
        },
        stamped
      )
    ).toBe('[12:34:56] Reading the diff now.\n[12:34:56] tool Bash: npm test');
    expect(
      renderProgressEvent(
        {
          type: 'user',
          message: {
            content: [{ type: 'tool_result', is_error: true, content: 'command not found' }],
          },
        },
        stamped
      )
    ).toBe('[12:34:56] tool error: command not found');
    expect(
      renderProgressEvent({ type: 'result', subtype: 'success', duration_ms: 754_000 }, stamped)
    ).toBe('[12:34:56] result success in 754s');
  });

  it('drops non-progress events and truncates long text', () => {
    expect(
      renderProgressEvent({
        type: 'user',
        message: { content: [{ type: 'tool_result', content: 'quiet success' }] },
      })
    ).toBeNull();
    expect(renderProgressEvent({ type: 'stream_event' })).toBeNull();
    const rendered = renderProgressEvent(
      { type: 'assistant', message: { content: [{ type: 'text', text: 'x'.repeat(500) }] } },
      stamped
    );
    expect(rendered.length).toBeLessThan(200);
    expect(rendered.endsWith('…')).toBe(true);
  });

  it('streams events as they arrive, tees the raw log, and returns the result event', async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'splotch-claude-stream-'));
    try {
      const logPath = join(temporaryRoot, 'stream.ndjson');
      const script = [
        `console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 's-1', model: 'sonnet' }));`,
        `console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/tmp/a.ts' } }] } }));`,
        `console.log(JSON.stringify({ type: 'result', subtype: 'success', result: 'done', duration_ms: 1200 }));`,
      ].join('\n');
      const progress = [];
      const result = await runClaudeStreaming({
        command: process.execPath,
        args: ['-e', script],
        logPath,
        onProgress: (line) => progress.push(line),
      });
      expect(result.result).toBe('done');
      expect(progress.some((line) => line.includes('session s-1 model sonnet'))).toBe(true);
      expect(progress.some((line) => line.includes('tool Read: /tmp/a.ts'))).toBe(true);
      expect(readFileSync(logPath, 'utf8').trim().split('\n')).toHaveLength(3);
      expect(statSync(logPath).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('terminates a silent child at the stall timeout and surfaces failures', async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'splotch-claude-stall-'));
    try {
      await expect(
        runClaudeStreaming(
          {
            command: process.execPath,
            args: ['-e', 'setTimeout(() => {}, 60000)'],
            logPath: join(temporaryRoot, 'stall.ndjson'),
          },
          200
        )
      ).rejects.toThrow('emitted no stream events');
      await expect(
        runClaudeStreaming({
          command: process.execPath,
          args: ['-e', 'console.error("boom"); process.exit(3)'],
          logPath: join(temporaryRoot, 'exit.ndjson'),
        })
      ).rejects.toThrow('claude exited 3: boom');
      await expect(
        runClaudeStreaming({
          command: process.execPath,
          args: ['-e', 'console.log("{}")'],
          logPath: join(temporaryRoot, 'no-result.ndjson'),
        })
      ).rejects.toThrow('without a result event');
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('refuses a pre-existing stream log target', async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'splotch-claude-log-'));
    try {
      const logPath = join(temporaryRoot, 'existing.ndjson');
      writeFileSync(logPath, '');
      await expect(
        runClaudeStreaming({
          command: process.execPath,
          args: ['-e', 'setTimeout(() => {}, 60000)'],
          logPath,
        })
      ).rejects.toThrow('stream log');
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it(
    'terminates the whole process group, not only the direct child',
    { timeout: 15_000 },
    async () => {
      const temporaryRoot = mkdtempSync(join(tmpdir(), 'splotch-claude-group-'));
      try {
        const script = [
          `const { spawn } = require('node:child_process');`,
          `const grandchild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });`,
          `console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: String(grandchild.pid), model: 'x' }));`,
          `setTimeout(() => {}, 60000);`,
        ].join('\n');
        const progress = [];
        await expect(
          runClaudeStreaming(
            {
              command: process.execPath,
              args: ['-e', script],
              logPath: join(temporaryRoot, 'group.ndjson'),
              onProgress: (line) => progress.push(line),
            },
            300
          )
        ).rejects.toThrow('emitted no stream events');
        const grandchildPid = Number(progress[0].match(/session (\d+) model/)[1]);
        expect(await waitForProcessExit(grandchildPid)).toBe(true);
      } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
      }
    }
  );

  it(
    'escalates to group SIGKILL when a descendant ignores SIGTERM',
    { timeout: 15_000 },
    async () => {
      const temporaryRoot = mkdtempSync(join(tmpdir(), 'splotch-claude-sigkill-'));
      try {
        // The init event arms the silence window, so it must wait for the grandchild's readiness
        // byte: emitted before the SIGTERM no-op handler exists, a slow host could end the window
        // while default SIGTERM still kills the grandchild, passing without the escalation.
        const grandchildScript = `process.on("SIGTERM", () => {}); process.stdout.write("ready"); setTimeout(() => {}, 60000);`;
        const script = [
          `const { spawn } = require('node:child_process');`,
          `const grandchild = spawn(process.execPath, ['-e', '${grandchildScript}'], { stdio: ['ignore', 'pipe', 'ignore'] });`,
          `grandchild.stdout.once('data', () => {`,
          `  console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: String(grandchild.pid), model: 'x' }));`,
          `});`,
          `setTimeout(() => {}, 60000);`,
        ].join('\n');
        const progress = [];
        await expect(
          runClaudeStreaming(
            {
              command: process.execPath,
              args: ['-e', script],
              logPath: join(temporaryRoot, 'sigkill.ndjson'),
              onProgress: (line) => progress.push(line),
            },
            2000,
            500
          )
        ).rejects.toThrow('process group was terminated');
        const grandchildPid = Number(progress[0].match(/session (\d+) model/)[1]);
        expect(await waitForProcessExit(grandchildPid)).toBe(true);
      } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
      }
    }
  );
});

describe('trusted Claude PR reviewer', () => {
  const metadata = {
    number: 42,
    url: 'https://github.com/KyleMit/Splotch/pull/42',
    baseRefName: 'codex/issue-41',
    baseRefOid: 'a'.repeat(40),
    headRefName: 'codex/issue-42',
    headRefOid: 'b'.repeat(40),
  };

  it('accepts only a fixed positive PR and its bounded cleanup action', () => {
    expect(parseReviewerArgs(['--pr', '42'])).toEqual({ prNumber: 42, endSession: false });
    expect(parseReviewerArgs(['--pr', '42', '--end-session'])).toEqual({
      prNumber: 42,
      endSession: true,
    });
    expect(() => parseReviewerArgs(['--pr', '0'])).toThrow('positive-integer');
    expect(() => parseReviewerArgs(['--pr', '42', '--model', 'sonnet'])).toThrow();
    expect(() => parseReviewerArgs(['42'])).toThrow();
  });

  it('passes exact target authorization and denies adjacent mutations', () => {
    const marker = '<!-- splotch-claude-review:test -->';
    const prompt = buildAuthorizationPrompt(metadata, '/private/tmp/review/checkout', marker);
    expect(prompt).toContain('mode=post-comments');
    expect(prompt).toContain(`${'a'.repeat(40)}...${'b'.repeat(40)}`);
    expect(prompt).toContain('one COMMENT review');
    expect(prompt).toContain('does not authorize:\n- commits or pushes');
    expect(prompt).toContain('another repository or pull request');
    expect(prompt).toContain(marker);
    const continuation = buildAuthorizationPrompt(
      metadata,
      '/private/tmp/review/checkout',
      marker,
      { continuation: true, previousHeadOid: 'c'.repeat(40) }
    );
    expect(continuation).toContain('CONTINUATION REVIEW');
    expect(continuation).toContain('Do not restart a greenfield audit');
    expect(continuation).toContain('not a non-empty findings list');
  });

  it('creates one reviewer conversation per PR, resumes it, and cleans it up', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'splotch-review-session-'));
    try {
      const paths = {
        sessionsDirectory: join(temporaryRoot, 'sessions'),
        claudeProjects: join(temporaryRoot, 'projects'),
      };
      const created = planReviewerSession(42, paths);
      expect(created.mode).toBe('create');
      expect(reviewerSessionArguments(created)).toEqual(['--session-id', created.id]);
      const resumed = planReviewerSession(42, paths);
      expect(resumed).toMatchObject({ mode: 'resume', id: created.id });
      expect(reviewerSessionArguments(resumed)).toEqual(['--resume', created.id]);

      const project = join(paths.claudeProjects, 'review-project');
      mkdirSync(join(project, created.id), { recursive: true });
      writeFileSync(join(project, `${created.id}.jsonl`), '{}');
      endReviewerSession(42, paths);
      expect(readReviewerSession(paths.sessionsDirectory, 42)).toBeNull();
      expect(existsSync(join(project, `${created.id}.jsonl`))).toBe(false);
      expect(existsSync(join(project, created.id))).toBe(false);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('hardcodes Auto and safe mode and installs every trusted byte', () => {
    const wrapper = readFileSync(
      join(repositoryRoot, '.agents/skills/run-claude/scripts/claude-review-publish.mjs'),
      'utf8'
    );
    for (const required of [
      "'--permission-mode'",
      "'auto'",
      "'--tools'",
      "'default'",
      "'--safe-mode'",
      "'--strict-mcp-config'",
      "'--session-id'",
      "'--resume'",
      "'--output-format'",
      "'stream-json'",
      "'--verbose'",
    ]) {
      expect(wrapper).toContain(required);
    }
    expect(wrapper).not.toContain('--dangerously-skip-permissions');
    expect(wrapper).not.toContain('bypassPermissions');
    expect(wrapper).not.toContain("'--bare'");
    expect(wrapper).toContain("'--slurp'");
    expect(wrapper).toContain("matches[0].state !== 'COMMENTED'");
    expect(wrapper).toContain('adoptPublishedReview(metadata, paths)');
    expect(wrapper).toContain('splotch-claude-review:base=${metadata.baseRefOid};head=');
    const expected = expectedRunClaudeFiles();
    const manifest = JSON.parse(expected.manifest.toString());
    for (const key of [
      'runnerSha256',
      'reviewerSha256',
      'healthSha256',
      'subscriptionAuthSha256',
      'streamSha256',
      'settingsSha256',
      'runnerBoundarySha256',
      'rubricSha256',
    ]) {
      expect(manifest[key]).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('run-claude Codex policy', () => {
  it('requires the skill to enter the host approval boundary before invoking wrappers', () => {
    const skill = readFileSync(join(repositoryRoot, '.agents/skills/run-claude/SKILL.md'), 'utf8');
    expect(() => validateSkillExecutionContract(skill)).not.toThrow();
    for (const [name, requirement] of REQUIRED_SKILL_EXECUTION_CONTRACT) {
      expect(skill).toContain(requirement);
      expect(() => validateSkillExecutionContract(skill.replaceAll(requirement, ''))).toThrow(name);
    }
  });

  it('documents every one-time setup and verification command in the authoritative skill', () => {
    const skill = readFileSync(join(repositoryRoot, '.agents/skills/run-claude/SKILL.md'), 'utf8');
    for (const required of [
      'cd /Users/kylemit/Code/Splotch',
      'npm run run-claude:install',
      'Restart Codex',
      'npm run run-claude:policy:check',
      '/Users/kylemit/.local/libexec/splotch-claude-health.mjs',
      'No per-invocation setup command is required.',
    ]) {
      expect(skill).toContain(required);
    }
  });

  it('upserts top-level approval policy before TOML tables', () => {
    let config = 'model = "gpt"\n\n[features]\napps = true\n';
    config = upsertTopLevelToml(config, 'approval_policy', 'on-request');
    config = upsertTopLevelToml(config, 'approval_policy', 'on-request');
    expect(config.match(/^approval_policy = "on-request"$/gm)).toHaveLength(1);
    expect(config.indexOf('approval_policy')).toBeLessThan(config.indexOf('[features]'));

    const profileConfig = 'model = "gpt"\n\n[profiles.fast]\napproval_policy = "never"\n';
    const updated = upsertTopLevelToml(profileConfig, 'approval_policy', 'on-request');
    expect(updated.match(/^approval_policy = "on-request"$/gm)).toHaveLength(1);
    expect(updated).toContain('[profiles.fast]\napproval_policy = "never"');
  });

  it('keeps standalone wrapper paths aligned with the installer and Codex policy', () => {
    const installed = Object.fromEntries(
      Object.entries(INSTALL_PATHS).map(([name, path]) => [
        name,
        resolve(EXPECTED_HOME, relative(homedir(), path)),
      ])
    );
    expect(RUNNER_PATHS).toMatchObject({
      settings: installed.settings,
      boundary: installed.runnerBoundary,
      manifest: installed.manifest,
      subscriptionAuth: installed.subscriptionAuth,
      stream: installed.stream,
    });
    expect(REVIEWER_PATHS).toMatchObject({
      settings: installed.settings,
      rubric: installed.rubric,
      manifest: installed.manifest,
      subscriptionAuth: installed.subscriptionAuth,
      stream: installed.stream,
    });
    expect(HEALTH_PATHS).toMatchObject({
      manifest: installed.manifest,
      subscriptionAuth: installed.subscriptionAuth,
    });

    const wrapperPaths = [installed.runner, installed.reviewer, installed.health];
    const policyRulePaths = [
      ...POLICY_RULES.matchAll(/pattern = \["([^"\]]+libexec[^"\]]+)"\]/g),
    ].map((match) => match[1]);
    expect(policyRulePaths).toEqual(wrapperPaths);
    expect(POLICY_CASES.slice(0, wrapperPaths.length).map(({ command }) => command[0])).toEqual(
      wrapperPaths
    );

    const forbiddenClaudePaths = [
      ...POLICY_RULES.matchAll(/pattern = \["([^"\]]*\/claude)"\], decision = "forbidden"/g),
    ].map((match) => match[1]);
    expect(forbiddenClaudePaths).toEqual([RUNNER_PATHS.claude]);
    expect(REVIEWER_PATHS.claude).toBe(RUNNER_PATHS.claude);
    expect(HEALTH_PATHS.claude).toBe(RUNNER_PATHS.claude);
  });

  it('replaces its managed rules idempotently and keeps unrelated rules', () => {
    const existing = 'prefix_rule(pattern = ["npm"], decision = "allow")\n';
    const once = replaceManagedRules(existing);
    const twice = replaceManagedRules(once);
    expect(twice).toBe(once);
    expect(once).toContain('splotch-claude-run.mjs');
    expect(once).toContain('splotch-claude-review-publish.mjs');
    expect(once).toContain('splotch-claude-health.mjs');
    expect(once).toContain('pattern = ["claude"]');
    expect(once).toContain('pattern = ["npm"]');
    expect(() => validateManagedRules(once)).not.toThrow();
  });

  it('requires the three Codex approval settings exactly once at top level', () => {
    const config = [
      'approval_policy = "on-request"',
      'approvals_reviewer = "auto_review"',
      'sandbox_mode = "workspace-write"',
      '',
      '[projects."/tmp"]',
      'trust_level = "trusted"',
      '',
    ].join('\n');
    expect(() => validateCodexConfig(config)).not.toThrow();
    expect(() => validateCodexConfig(config.replace('auto_review', 'off'))).toThrow(
      'approvals_reviewer'
    );
  });
});
