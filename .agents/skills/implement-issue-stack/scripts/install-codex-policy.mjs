#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installReviewer } from './install-reviewer.mjs';

const CODEX_DIRECTORY = join(homedir(), '.codex');
const CONFIG_PATH = join(CODEX_DIRECTORY, 'config.toml');
const RULES_PATH = join(CODEX_DIRECTORY, 'rules/default.rules');
const START_MARKER = '# BEGIN SPLOTCH ISSUE STACK';
const END_MARKER = '# END SPLOTCH ISSUE STACK';

export const CODEX_POLICY_PATHS = { config: CONFIG_PATH, rules: RULES_PATH };

export const POLICY_RULES = `${START_MARKER}
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
prefix_rule(
    pattern = ["/Users/kylemit/.local/libexec/splotch-claude-review-publish.mjs"],
    decision = "prompt",
    justification = "Launch the fixed Claude Auto-mode reviewer authorized to comment on one validated Splotch PR.",
)
prefix_rule(
    pattern = ["/Users/kylemit/.local/libexec/splotch-claude-review-health.mjs"],
    decision = "prompt",
    justification = "Check Claude and GitHub Keychain authentication through a fixed read-only wrapper before an unattended issue stack.",
)
prefix_rule(pattern = ["claude"], decision = "forbidden", justification = "Use the fixed reviewer wrapper instead of a raw Claude invocation.")
prefix_rule(pattern = ["/Users/kylemit/.local/bin/claude"], decision = "forbidden", justification = "Use the fixed reviewer wrapper instead of a raw Claude invocation.")
${END_MARKER}`;

export function upsertTopLevelToml(content, key, value) {
  const assignment = `${key} = ${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${key}\\s*=.*$`, 'm');
  if (pattern.test(content)) return content.replace(pattern, assignment);
  const tableIndex = content.search(/^\[/m);
  if (tableIndex === -1) return `${content.trimEnd()}\n${assignment}\n`;
  return `${content.slice(0, tableIndex).trimEnd()}\n${assignment}\n\n${content.slice(tableIndex)}`;
}

export function replaceManagedRules(content) {
  const pattern = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}\\n?`, 'g');
  const withoutManagedBlock = content.replace(pattern, '').trimEnd();
  return `${withoutManagedBlock}${withoutManagedBlock ? '\n\n' : ''}${POLICY_RULES}\n`;
}

function backupOnce(path) {
  const backup = `${path}.before-issue-stack`;
  if (existsSync(path) && !existsSync(backup)) copyFileSync(path, backup);
}

export function installCodexPolicy() {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  mkdirSync(dirname(RULES_PATH), { recursive: true });
  backupOnce(CONFIG_PATH);
  backupOnce(RULES_PATH);

  let config = existsSync(CONFIG_PATH) ? readFileSync(CONFIG_PATH, 'utf8') : '';
  config = upsertTopLevelToml(config, 'approval_policy', 'on-request');
  config = upsertTopLevelToml(config, 'approvals_reviewer', 'auto_review');
  config = upsertTopLevelToml(config, 'sandbox_mode', 'workspace-write');
  writeFileSync(CONFIG_PATH, config);

  const rules = existsSync(RULES_PATH) ? readFileSync(RULES_PATH, 'utf8') : '';
  writeFileSync(RULES_PATH, replaceManagedRules(rules));
  installReviewer();
  console.log(
    'installed Codex issue-stack policy; restart Codex before running an overnight queue'
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('install-codex-policy.mjs accepts no arguments');
    installCodexPolicy();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
