import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  initializeRun,
  parseIssueReferences,
  updateIssue,
} from '../../.agents/skills/implement-issue-stack/scripts/state.mjs';
import {
  buildAuthorizationPrompt,
  parseReviewerArgs,
} from '../../.agents/skills/implement-issue-stack/scripts/claude-review-publish.mjs';
import {
  replaceManagedRules,
  upsertTopLevelToml,
} from '../../.agents/skills/implement-issue-stack/scripts/install-codex-policy.mjs';
import {
  validateCodexConfig,
  validateManagedRules,
} from '../../.agents/skills/implement-issue-stack/scripts/check-codex-policy.mjs';
import { expectedReviewerFiles } from '../../.agents/skills/implement-issue-stack/scripts/install-reviewer.mjs';

const roots = [];
const repositoryRoot = resolve(import.meta.dirname, '../..');

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('issue-stack checkpoint', () => {
  it('normalizes ordered issue arguments and rejects duplicates or other repositories', () => {
    expect(
      parseIssueReferences([
        '#711,',
        '712',
        'https://github.com/KyleMit/Splotch/issues/713?notification_referrer_id=1',
      ])
    ).toEqual([711, 712, 713]);
    expect(() => parseIssueReferences(['711', '#711'])).toThrow('duplicate issue reference');
    expect(() => parseIssueReferences(['https://github.com/example/elsewhere/issues/7'])).toThrow(
      'expected KyleMit/Splotch'
    );
    expect(() => parseIssueReferences(['https://github.com/KyleMit/Splotch/pull/7'])).toThrow(
      'invalid issue URL'
    );
  });

  it('resumes only the same queue and advances the last good base only for ready work', () => {
    const root = mkdtempSync(join(tmpdir(), 'splotch-issue-stack-test-'));
    roots.push(root);
    const statePath = join(root, 'run.json');

    const trunkOid = 'a'.repeat(40);
    expect(initializeRun(statePath, ['11', '12'], 'main', trunkOid).resumed).toBe(false);
    expect(initializeRun(statePath, ['#11', '#12'], 'main', trunkOid).resumed).toBe(true);
    expect(() => initializeRun(statePath, ['12', '11'], 'main', trunkOid)).toThrow(
      'different ordered'
    );

    updateIssue(statePath, 11, {
      status: 'quarantined',
      branch: 'codex/issue-11',
      agent: 'agent-11',
      baseOid: trunkOid,
      stackNumber: 2,
      ciRepairContinuations: 3,
    });
    expect(JSON.parse(readFileSync(statePath, 'utf8')).lastGoodBase).toBe('main');
    updateIssue(statePath, 11, {
      status: 'quarantined',
      clearStack: true,
    });
    expect(JSON.parse(readFileSync(statePath, 'utf8')).stackNumber).toBeNull();
    const headOid = 'b'.repeat(40);
    updateIssue(statePath, 12, {
      status: 'ready',
      branch: 'codex/issue-12',
      head: headOid,
      stackNumber: 4,
    });
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    expect(state.lastGoodBase).toBe('codex/issue-12');
    expect(state.lastGoodBaseOid).toBe(headOid);
    expect(state.stackNumber).toBe(4);
    expect(state.issues[0]).toMatchObject({ agent: 'agent-11', ciRepairContinuations: 3 });
    expect(existsSync(`${statePath}.tmp`)).toBe(false);
    expect(() => updateIssue(statePath, 11, { status: 'ready', branch: 'missing-head' })).toThrow(
      'requires --branch and --head'
    );
  });
});

describe('trusted Claude reviewer', () => {
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

  it('hardcodes Auto and safe-mode flags without bypass or bare mode', () => {
    const wrapper = readFileSync(
      join(
        repositoryRoot,
        '.agents/skills/implement-issue-stack/scripts/claude-review-publish.mjs'
      ),
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
    const expected = expectedReviewerFiles();
    const manifest = JSON.parse(expected.manifest.toString());
    expect(expected.health.length).toBeGreaterThan(0);
    expect(manifest.healthSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Codex policy installation', () => {
  it('upserts top-level approval policy before TOML tables', () => {
    let config = 'model = "gpt"\n\n[features]\napps = true\n';
    config = upsertTopLevelToml(config, 'approval_policy', 'on-request');
    config = upsertTopLevelToml(config, 'approval_policy', 'on-request');
    expect(config.match(/^approval_policy = "on-request"$/gm)).toHaveLength(1);
    expect(config.indexOf('approval_policy')).toBeLessThan(config.indexOf('[features]'));
  });

  it('replaces its managed rules idempotently and keeps unrelated rules', () => {
    const existing = 'prefix_rule(pattern = ["npm"], decision = "allow")\n';
    const once = replaceManagedRules(existing);
    const twice = replaceManagedRules(once);
    expect(twice).toBe(once);
    expect(once).toContain('pattern = ["gh"]');
    expect(once).toContain('pattern = ["gh", "pr", "merge"]');
    expect(once).toContain('splotch-claude-review-health.mjs');
    expect(once).toContain('decision = "forbidden"');
    expect(once).toContain('pattern = ["npm"]');
    expect(() => validateManagedRules(once)).not.toThrow();
  });

  it('requires the three unattended Codex settings exactly once at top level', () => {
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

describe('skill contracts', () => {
  it('makes red CI a repair loop and preserves interactive review defaults', () => {
    const stackSkill = readFileSync(
      join(repositoryRoot, '.agents/skills/implement-issue-stack/SKILL.md'),
      'utf8'
    );
    const leaveReview = readFileSync(
      join(repositoryRoot, '.ruler/skills/leave-pr-review/SKILL.md'),
      'utf8'
    );
    const addressReview = readFileSync(
      join(repositoryRoot, '.ruler/skills/address-pr-review/SKILL.md'),
      'utf8'
    );
    expect(stackSkill).toContain('A failed check is blocking');
    expect(stackSkill).toContain('Never pause merely because CI is red');
    expect(stackSkill).toContain('last_good_base');
    expect(stackSkill).toMatch(/`ready_for_review`\s+event/);
    expect(stackSkill).toContain('`gh stack unstack <recorded-stack-number>`');
    expect(stackSkill).toContain('npm run issue-stack:policy:check');
    expect(stackSkill).toContain('Checkpoint every phase transition and external mutation');
    expect(stackSkill).toContain('Poll pending checks every 30 seconds for up to 45 minutes');
    expect(stackSkill).toContain('`ciRepairContinuations` starts at zero');
    expect(stackSkill).toContain('Immediately checkpoint `--clear-stack`');
    expect(leaveReview).toContain('mode=post-comments');
    expect(leaveReview).toMatch(/If no mode is\s+specified/);
    expect(leaveReview).toContain('`git diff <base-oid>...<head-oid>`');
    expect(leaveReview).not.toContain('git diff origin/main...HEAD');
    expect(addressReview).toContain('mode=autonomous');
    expect(addressReview).toContain('The default remains interactive');
    expect(addressReview).toContain('<!-- splotch-claude-review:');
    expect(addressReview).toMatch(
      /Include the marked review body\s+itself and every inline comment/
    );
  });
});
