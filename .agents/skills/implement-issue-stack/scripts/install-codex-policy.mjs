#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CODEX_POLICY_PATHS,
  installCodexPolicy as installRunClaudePolicy,
} from '../../run-rival-agent/scripts/install-codex-policy.mjs';

const START_MARKER = '# BEGIN SPLOTCH ISSUE STACK';
const END_MARKER = '# END SPLOTCH ISSUE STACK';

export const ISSUE_STACK_POLICY_RULES = `${START_MARKER}
prefix_rule(
    pattern = ["gh"],
    decision = "prompt",
    justification = "Authenticated GitHub CLI operations require macOS Keychain access outside the Codex sandbox.",
)
prefix_rule(pattern = ["gh", "auth", "logout"], decision = "forbidden", justification = "Durable GitHub authentication may not be removed by the issue-stack workflow.")
prefix_rule(pattern = ["gh", "repo", "delete"], decision = "forbidden", justification = "Repository deletion requires direct human action.")
prefix_rule(pattern = ["gh", "pr", "merge"], decision = "forbidden", justification = "The issue-stack workflow must never merge pull requests.")
prefix_rule(pattern = ["gh", "stack", "merge"], decision = "forbidden", justification = "The issue-stack workflow must never merge a PR stack.")
prefix_rule(pattern = ["git", "push"], decision = "prompt", justification = "Codex Auto-review must evaluate every remote Git push.")
${END_MARKER}`;

export function replaceIssueStackRules(content) {
  const pattern = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}\\n?`, 'g');
  const withoutManagedBlock = content.replace(pattern, '').trimEnd();
  return `${withoutManagedBlock}${withoutManagedBlock ? '\n\n' : ''}${ISSUE_STACK_POLICY_RULES}\n`;
}

export function installIssueStackPolicy() {
  installRunClaudePolicy();
  const rules = existsSync(CODEX_POLICY_PATHS.rules)
    ? readFileSync(CODEX_POLICY_PATHS.rules, 'utf8')
    : '';
  writeFileSync(CODEX_POLICY_PATHS.rules, replaceIssueStackRules(rules));
  console.log('installed Codex issue-stack policy; restart Codex before an overnight queue');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('install-codex-policy.mjs accepts no arguments');
    installIssueStackPolicy();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
