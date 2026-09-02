import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import {
  BROKER_TOOL,
  buildClaudeArgs,
  claudeEnvironment,
  claudeVendor,
  removeClaudeTranscripts,
  resolveClaudeModel,
  RIVAL_TOOLS,
} from '../../.agents/skills/run-rival-agent/scripts/launch-claude.mjs';
import {
  digest,
  MANIFEST_NAME,
  verifyInstalledBytes,
} from '../../.agents/skills/run-rival-agent/scripts/claude-health.mjs';
import {
  declinePending,
  ORCHESTRATED_DECLINE_REASON,
  parseReviewerArgs,
} from '../../.agents/skills/run-rival-agent/scripts/claude-review-publish.mjs';
import {
  ESCALATED_WRAPPERS,
  POLICY_RULES,
  replaceManagedRules,
  upsertTopLevelToml,
} from '../../.agents/skills/run-rival-agent/scripts/install-codex-policy.mjs';
import {
  POLICY_CASES,
  REQUIRED_SKILL_EXECUTION_CONTRACT,
  validateCodexConfig,
  validateManagedRules,
  validateSkillExecutionContract,
} from '../../.agents/skills/run-rival-agent/scripts/check-codex-policy.mjs';
import {
  CORE_FILES,
  EXPECTED_HOME,
  expectedInstalledFiles,
  INSTALL_ROOT,
  INSTALL_SHIMS,
  installRunClaude,
  PACKAGE_FILES,
  rewriteCoreImports,
  shimSource,
} from '../../.agents/skills/run-rival-agent/scripts/install-run-claude.mjs';
import {
  assertClaudePlanAuthentication,
  assertNoApiBillingEnvironment,
} from '../../.agents/skills/run-rival-agent/scripts/splotch-claude-subscription-auth.mjs';
import {
  appendRequest,
  createSessionDirectory,
  PENDING_REQUEST_TIMEOUT_MS,
  readReply,
} from '../rival-agent/spool.mjs';
import { FINDINGS_SCHEMA_PATH } from '../rival-agent/validate-findings.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const SESSION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const canonicalHome = (path) => resolve(EXPECTED_HOME, relative(homedir(), path));

describe('Claude rival command construction', () => {
  const options = {
    session: '/tmp/session',
    packetDir: '/tmp/session/packet',
    brokerServerPath: '/core/broker-server.mjs',
    nodePath: '/usr/local/bin/node',
    model: 'opus',
    effort: 'high',
    rivalSession: { mode: 'create', id: SESSION_ID },
  };

  // --safe-mode silently dropped --mcp-config in the first probe; restricted mode is the shape
  // that attached the broker and still refused every write path.
  it('runs restricted with read tools and the broker only, never safe mode or bypass', () => {
    const args = buildClaudeArgs(options);
    expect(args).toContain('--print');
    expect(args).toContain('--restricted');
    expect(args).not.toContain('--safe-mode');
    expect(args).not.toContain('--dangerously-skip-permissions');
    expect(args).not.toContain('bypassPermissions');
    expect(args).not.toContain('--bare');
    expect(
      args.slice(args.indexOf('--permission-mode'), args.indexOf('--permission-mode') + 2)
    ).toEqual(['--permission-mode', 'dontAsk']);
    expect(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2)).toEqual([
      '--tools',
      RIVAL_TOOLS,
    ]);
    expect(args.slice(args.indexOf('--allowedTools'), args.indexOf('--allowedTools') + 2)).toEqual([
      '--allowedTools',
      `${RIVAL_TOOLS},${BROKER_TOOL}`,
    ]);
    expect(RIVAL_TOOLS.split(',')).not.toContain('Bash');
    expect(RIVAL_TOOLS.split(',')).not.toContain('WebSearch');
    expect(args).toContain('--strict-mcp-config');
    expect(args).toContain('--no-chrome');
    expect(args.slice(args.indexOf('--add-dir'), args.indexOf('--add-dir') + 2)).toEqual([
      '--add-dir',
      '/tmp/session/packet',
    ]);
    expect(args).toContain('stream-json');
    expect(args).toContain('--verbose');
  });

  it('attaches exactly the broker server pointed at the session', () => {
    const args = buildClaudeArgs(options);
    const config = JSON.parse(args[args.indexOf('--mcp-config') + 1]);
    expect(Object.keys(config.mcpServers)).toEqual(['broker']);
    expect(config.mcpServers.broker).toEqual({
      command: '/usr/local/bin/node',
      args: ['/core/broker-server.mjs'],
      env: { RIVAL_SESSION_DIR: '/tmp/session' },
    });
  });

  // Claude's validator refused the draft 2020-12 `$schema` key on the first real launch.
  it('passes the findings schema without its dialect declaration, then the model and effort', () => {
    const args = buildClaudeArgs(options);
    const passed = JSON.parse(args[args.indexOf('--json-schema') + 1]);
    const { $schema: dialect, ...expected } = JSON.parse(
      readFileSync(FINDINGS_SCHEMA_PATH, 'utf8')
    );
    expect(dialect).toContain('2020-12');
    expect(passed).toEqual(expected);
    expect(args.slice(-4)).toEqual(['--model', 'opus', '--effort', 'high']);
  });

  it('issues the session id up front and resumes the recorded one later', () => {
    const created = buildClaudeArgs(options);
    expect(
      created.slice(created.indexOf('--session-id'), created.indexOf('--session-id') + 2)
    ).toEqual(['--session-id', SESSION_ID]);
    expect(created).not.toContain('--resume');
    const resumed = buildClaudeArgs({
      ...options,
      rivalSession: { mode: 'resume', id: SESSION_ID },
    });
    expect(resumed.slice(resumed.indexOf('--resume'), resumed.indexOf('--resume') + 2)).toEqual([
      '--resume',
      SESSION_ID,
    ]);
    expect(resumed).not.toContain('--session-id');
  });

  it('raises the MCP tool timeout to the pending-request budget', () => {
    expect(claudeEnvironment({ PATH: '/bin' })).toEqual({
      PATH: '/bin',
      MCP_TOOL_TIMEOUT: String(PENDING_REQUEST_TIMEOUT_MS),
    });
  });

  it('accepts only the two model aliases and defaults to opus', () => {
    expect(resolveClaudeModel(undefined)).toBe('opus');
    expect(resolveClaudeModel('sonnet')).toBe('sonnet');
    expect(() => resolveClaudeModel('haiku')).toThrow(/unsupported model/);
  });

  it('exposes the vendor adapter the shared launcher drives', () => {
    expect(claudeVendor).toMatchObject({
      rival: 'claude',
      command: '/Users/kylemit/.local/bin/claude',
    });
    expect(claudeVendor.newSessionId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(claudeVendor.buildArgs).toBe(buildClaudeArgs);
  });

  it('removes a session transcript and its sidecar, and nothing else', () => {
    const root = mkdtempSync(join(tmpdir(), 'rival-claude-transcripts-'));
    try {
      const project = join(root, 'some-project');
      mkdirSync(join(project, SESSION_ID, 'tool-results'), { recursive: true });
      writeFileSync(join(project, `${SESSION_ID}.jsonl`), '{}');
      writeFileSync(join(project, 'other.jsonl'), '{}');
      expect(removeClaudeTranscripts(SESSION_ID, root)).toBe(2);
      expect(existsSync(join(project, `${SESSION_ID}.jsonl`))).toBe(false);
      expect(existsSync(join(project, SESSION_ID))).toBe(false);
      expect(existsSync(join(project, 'other.jsonl'))).toBe(true);
      expect(removeClaudeTranscripts(SESSION_ID, join(root, 'absent'))).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
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

describe('orchestrated publisher alias', () => {
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

  it('declines every pending request with the fixed reason', () => {
    const root = mkdtempSync(join(tmpdir(), 'rival-alias-'));
    try {
      const session = createSessionDirectory(randomUUID(), root);
      appendRequest(session, { command: 'npm test', why: 'x' });
      appendRequest(session, { command: 'npm run check', why: 'y' });
      expect(declinePending(session)).toBe(2);
      expect(readReply(session, 1)).toMatchObject({ declined: ORCHESTRATED_DECLINE_REASON });
      expect(readReply(session, 2)).toMatchObject({ declined: ORCHESTRATED_DECLINE_REASON });
      expect(declinePending(session)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('trusted installation', () => {
  it('copies the whole core and repoints the package files at it', () => {
    const { files, shims, manifest } = expectedInstalledFiles();
    expect([...files.keys()]).toEqual([...CORE_FILES, ...PACKAGE_FILES]);
    for (const name of PACKAGE_FILES) {
      expect(files.get(name).toString()).not.toContain('../../../../');
    }
    expect(files.get('launch-claude.mjs').toString()).toContain("from './launch.mjs'");
    const parsed = JSON.parse(manifest.toString());
    expect(Object.keys(parsed.files)).toEqual([...files.keys()]);
    for (const [name, content] of files) expect(parsed.files[name]).toBe(digest(content));
    expect(Object.keys(parsed.shims).map(canonicalHome)).toEqual(
      Object.values(INSTALL_SHIMS).map(canonicalHome)
    );
    expect([...shims.keys()]).toEqual(Object.keys(INSTALL_SHIMS));
    expect(shimSource('claude-health.mjs')).toContain(
      "import { main } from './splotch-rival-agent/claude-health.mjs'"
    );
  });

  it('refuses a package file that still reaches outside the install directory', () => {
    expect(() =>
      rewriteCoreImports("import x from '../../../../tools/lib/proc.mjs';", 'x.mjs')
    ).toThrow(/outside the install directory/);
    expect(
      rewriteCoreImports("import x from '../../../../tools/rival-agent/spool.mjs';", 'x.mjs')
    ).toBe("import x from './spool.mjs';");
  });

  it('verifies every installed byte against the manifest and says what drifted', () => {
    const root = mkdtempSync(join(tmpdir(), 'rival-manifest-'));
    try {
      writeFileSync(join(root, 'a.mjs'), 'a');
      writeFileSync(join(root, 'b.mjs'), 'b');
      const manifest = {
        version: 5,
        files: { 'a.mjs': digest('a'), 'b.mjs': digest('b') },
        shims: {},
      };
      writeFileSync(join(root, MANIFEST_NAME), JSON.stringify(manifest));
      expect(verifyInstalledBytes(root)).toEqual({ installed: true, version: 5 });
      writeFileSync(join(root, 'b.mjs'), 'tampered');
      expect(() => verifyInstalledBytes(root)).toThrow(/changed: b\.mjs/);
      writeFileSync(join(root, 'b.mjs'), 'b');
      writeFileSync(join(root, 'extra.mjs'), 'x');
      expect(() => verifyInstalledBytes(root)).toThrow(/unexpected: extra\.mjs/);
      rmSync(join(root, 'extra.mjs'));
      rmSync(join(root, 'a.mjs'));
      expect(() => verifyInstalledBytes(root)).toThrow(/missing: a\.mjs/);
      expect(verifyInstalledBytes(join(root, 'nowhere'))).toEqual({ installed: false });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a missing or stale install in check mode', () => {
    const root = mkdtempSync(join(tmpdir(), 'rival-install-check-'));
    try {
      const shims = {
        reviewPublish: join(root, 'shim-publish.mjs'),
        health: join(root, 'shim-health.mjs'),
      };
      expect(() => installRunClaude({ check: true, root: join(root, 'pkg'), shims })).toThrow(
        /missing or stale/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('Codex policy', () => {
  it('requires the skill to enter the host approval boundary before invoking wrappers', () => {
    const skill = readFileSync(
      join(repositoryRoot, '.agents/skills/run-rival-agent/SKILL.md'),
      'utf8'
    );
    expect(() => validateSkillExecutionContract(skill)).not.toThrow();
    for (const [name, requirement] of REQUIRED_SKILL_EXECUTION_CONTRACT) {
      expect(skill).toContain(requirement);
      expect(() => validateSkillExecutionContract(skill.replaceAll(requirement, ''))).toThrow(name);
    }
  });

  it('documents every setup, verification, and handler command in the authoritative skill', () => {
    const skill = readFileSync(
      join(repositoryRoot, '.agents/skills/run-rival-agent/SKILL.md'),
      'utf8'
    );
    for (const required of [
      'cd /Users/kylemit/Code/Splotch',
      'npm run run-claude:install',
      'npm run run-claude:policy:check',
      canonicalHome(ESCALATED_WRAPPERS.health),
      canonicalHome(ESCALATED_WRAPPERS.launch),
      canonicalHome(ESCALATED_WRAPPERS.post),
      canonicalHome(ESCALATED_WRAPPERS.reviewPublish),
      `node ${canonicalHome(join(INSTALL_ROOT, 'broker.mjs'))} next --session <dir>`,
      'splotch-rival-review',
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
  });

  it('keeps the escalated wrapper paths aligned across installer, rules, and cases', () => {
    const wrapperPaths = Object.values(ESCALATED_WRAPPERS).map(canonicalHome);
    const policyRulePaths = [
      ...POLICY_RULES.matchAll(/pattern = \["([^"\]]+libexec[^"\]]+)"\]/g),
    ].map((match) => canonicalHome(match[1]));
    expect(policyRulePaths).toEqual(wrapperPaths);
    expect(
      POLICY_CASES.slice(0, wrapperPaths.length).map(({ command }) => canonicalHome(command[0]))
    ).toEqual(wrapperPaths);
    expect(POLICY_CASES.at(-1)).toEqual({
      command: ['claude', '--print', 'review'],
      expected: 'forbidden',
    });
    expect(canonicalHome(ESCALATED_WRAPPERS.launch)).toBe(
      canonicalHome(join(INSTALL_ROOT, 'launch-claude.mjs'))
    );
    expect(canonicalHome(ESCALATED_WRAPPERS.reviewPublish)).toBe(
      canonicalHome(INSTALL_SHIMS.reviewPublish)
    );
    const forbidden = [
      ...POLICY_RULES.matchAll(/pattern = \["([^"\]]*claude)"\], decision = "forbidden"/g),
    ].map((match) => match[1]);
    expect(forbidden).toEqual(['claude', claudeVendor.command]);
  });

  it('replaces its managed rules idempotently and keeps unrelated rules', () => {
    const existing = 'prefix_rule(pattern = ["npm"], decision = "allow")\n';
    const once = replaceManagedRules(existing);
    const twice = replaceManagedRules(once);
    expect(twice).toBe(once);
    expect(once).toContain('launch-claude.mjs');
    expect(once).toContain('splotch-claude-review-publish.mjs');
    expect(once).toContain('pattern = ["npm"]');
    expect(() => validateManagedRules(once)).not.toThrow();
    expect(() => validateManagedRules(existing)).toThrow(/missing or stale/);
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
