import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import {
  ALLOWED_PROMPT_ROOTS,
  buildClaudeArgs,
  buildRunnerPrompt,
  parseRunArgs,
  readPromptFile,
  RUNNER_PATHS,
} from '../../.agents/skills/run-claude/scripts/claude-run.mjs';
import {
  buildAuthorizationPrompt,
  parseReviewerArgs,
  REVIEWER_PATHS,
} from '../../.agents/skills/run-claude/scripts/claude-review-publish.mjs';
import { HEALTH_PATHS } from '../../.agents/skills/run-claude/scripts/claude-health.mjs';
import {
  POLICY_RULES,
  replaceManagedRules,
  upsertTopLevelToml,
} from '../../.agents/skills/run-claude/scripts/install-codex-policy.mjs';
import {
  POLICY_CASES,
  validateCodexConfig,
  validateManagedRules,
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

describe('output-only Claude runner', () => {
  it('accepts a minimal prompt and closes every optional value set', () => {
    expect(parseRunArgs(['--prompt-file', '/private/tmp/ping.txt'])).toEqual({
      promptFile: '/private/tmp/ping.txt',
      profile: 'ask',
      cwd: undefined,
      model: 'sonnet',
      effort: 'high',
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
      expect(arguments_).not.toContain('--dangerously-skip-permissions');
      expect(arguments_).not.toContain('--bare');
      expect(arguments_.at(-1)).toContain('AUTHORIZED TASK');
      expect(arguments_.at(-3)).toBe('--effort');
    }
    expect(buildRunnerPrompt({ prompt: 'ping', profile: 'ask' })).toContain(
      'authorizes no external writes'
    );
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

describe('trusted Claude PR reviewer', () => {
  const metadata = {
    number: 42,
    url: 'https://github.com/KyleMit/Splotch/pull/42',
    baseRefName: 'codex/issue-41',
    baseRefOid: 'a'.repeat(40),
    headRefName: 'codex/issue-42',
    headRefOid: 'b'.repeat(40),
  };

  it('accepts only one fixed positive PR parameter', () => {
    expect(parseReviewerArgs(['--pr', '42'])).toBe(42);
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
      "'--no-session-persistence'",
      "'--output-format'",
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
      'settingsSha256',
      'runnerBoundarySha256',
      'rubricSha256',
    ]) {
      expect(manifest[key]).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('run-claude Codex policy', () => {
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
    });
    expect(REVIEWER_PATHS).toMatchObject({
      settings: installed.settings,
      rubric: installed.rubric,
      manifest: installed.manifest,
      subscriptionAuth: installed.subscriptionAuth,
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
