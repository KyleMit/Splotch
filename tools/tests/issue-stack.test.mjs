import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  initializeRun,
  parseIssueReferences,
  updateIssue,
} from '../../.agents/skills/implement-issue-stack/scripts/state.mjs';
import { replaceIssueStackRules } from '../../.agents/skills/implement-issue-stack/scripts/install-codex-policy.mjs';
import { validateIssueStackRules } from '../../.agents/skills/implement-issue-stack/scripts/check-codex-policy.mjs';

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

describe('Codex policy installation', () => {
  it('replaces only its issue-stack rules idempotently and keeps unrelated rules', () => {
    const existing = 'prefix_rule(pattern = ["npm"], decision = "allow")\n';
    const once = replaceIssueStackRules(existing);
    const twice = replaceIssueStackRules(once);
    expect(twice).toBe(once);
    expect(once).toContain('pattern = ["gh"]');
    expect(once).toContain('pattern = ["gh", "pr", "merge"]');
    expect(once).toContain('decision = "forbidden"');
    expect(once).toContain('pattern = ["npm"]');
    expect(() => validateIssueStackRules(once)).not.toThrow();
  });
});

describe('skill contracts', () => {
  it('reviews every PR before final CI and preserves interactive review defaults', () => {
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
    expect(stackSkill).toContain('Every product PR and gate-repair support PR receives');
    expect(stackSkill).toContain('Do not wait for CI before');
    expect(stackSkill.indexOf('### 6. Re-review until settled')).toBeLessThan(
      stackSkill.indexOf('### 7. Drive final CI to green')
    );
    expect(stackSkill).toContain('Do not run CI between those renewed review rounds');
    expect(stackSkill).toMatch(/automatically resumes it on\s+later review rounds/);
    expect(stackSkill).toContain('A reviewer is never required to find something wrong');
    expect(stackSkill).toMatch(/one full\s+review plus two resumed convergence rounds/);
    expect(stackSkill).toContain('establish causality');
    expect(stackSkill).toContain('One passing rerun is diagnostic evidence only');
    expect(stackSkill).toContain('Keep the product PR open and on the success path');
    expect(stackSkill).toContain('immediately below the product PR in the GitHub stack');
    expect(stackSkill).toMatch(/does not consume the product\s+issue's CI\s+repair\s+budget/);
    expect(stackSkill).toContain('Never quarantine a product issue for');
    expect(stackSkill).not.toContain('demonstrably inapplicable to this PR');
    expect(stackSkill).toMatch(/Never\s+pause merely because CI is red/);
    expect(stackSkill).toContain('last_good_base');
    expect(stackSkill).toMatch(/`ready_for_review`\s+event/);
    expect(stackSkill).toContain('`gh stack unstack <recorded-stack-number>`');
    expect(stackSkill).toContain('npm run issue-stack:policy:check');
    expect(stackSkill).toContain('gh auth status --hostname github.com');
    expect(stackSkill).toContain('Codex-only `run-claude` skill');
    expect(stackSkill).toContain("`run-claude` skill's empirical Splotch PR-review profile");
    expect(stackSkill).toContain('Checkpoint every phase transition and external mutation');
    expect(stackSkill).toContain('Poll pending checks every 30 seconds for up to 45 minutes');
    expect(stackSkill).toContain('`ciRepairContinuations` starts at zero');
    expect(stackSkill).toMatch(/Immediately checkpoint\s+`--clear-stack`/);
    expect(stackSkill).toMatch(/close its unsuccessful PR with the evidence attached to the issue/);
    expect(stackSkill).toContain('Begin the next pending issue immediately');
    expect(stackSkill).toContain('--end-session');
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
