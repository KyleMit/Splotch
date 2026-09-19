#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTALL_ROOT, INSTALL_SHIMS, installRunClaude } from './install-run-claude.mjs';

const CODEX_DIRECTORY = join(homedir(), '.codex');
const CONFIG_PATH = join(CODEX_DIRECTORY, 'config.toml');
const RULES_PATH = join(CODEX_DIRECTORY, 'rules/default.rules');
const START_MARKER = '# BEGIN SPLOTCH RUN CLAUDE';
const END_MARKER = '# END SPLOTCH RUN CLAUDE';
// The block the retired implement-issue-stack installer wrote. This block owns its GitHub and push
// rules, so an upgrade removes the old one rather than leaving two sources for `gh`.
const LEGACY_ISSUE_STACK_BLOCK = /# BEGIN SPLOTCH ISSUE STACK[\s\S]*?# END SPLOTCH ISSUE STACK\n?/g;

export const CODEX_POLICY_PATHS = { config: CONFIG_PATH, rules: RULES_PATH };

// The escalated entry points, in the order the handler meets them. The broker CLI needs no rule:
// it only reads and writes the spool under tmp, which the sandbox allows.
export const ESCALATED_WRAPPERS = Object.freeze({
  launch: join(INSTALL_ROOT, 'launch-claude.mjs'),
  post: join(INSTALL_ROOT, 'post-review.mjs'),
  reviewPublish: INSTALL_SHIMS.reviewPublish,
  health: INSTALL_SHIMS.health,
});

export const POLICY_RULES = `${START_MARKER}
prefix_rule(
    pattern = ["${ESCALATED_WRAPPERS.launch}"],
    decision = "prompt",
    justification = "Launch the Claude rival agent read-only in a disposable worktree with the broker attached; needs the Keychain login.",
)
prefix_rule(
    pattern = ["${ESCALATED_WRAPPERS.post}"],
    decision = "prompt",
    justification = "Post a finished rival session's findings to one validated Splotch PR as a COMMENT review through gh.",
)
prefix_rule(
    pattern = ["${ESCALATED_WRAPPERS.reviewPublish}"],
    decision = "prompt",
    justification = "The handler-less orchestrated PR-review alias: launch, auto-decline, post.",
)
prefix_rule(
    pattern = ["${ESCALATED_WRAPPERS.health}"],
    decision = "prompt",
    justification = "Check local Claude plan authentication and the installed bytes through a fixed read-only wrapper.",
)
prefix_rule(pattern = ["claude"], decision = "forbidden", justification = "Use the fixed rival-agent wrappers instead of a raw Claude invocation.")
prefix_rule(pattern = ["/Users/kylemit/.local/bin/claude"], decision = "forbidden", justification = "Use the fixed rival-agent wrappers instead of a raw Claude invocation.")
prefix_rule(
    pattern = ["gh"],
    decision = "prompt",
    justification = "Authenticated GitHub CLI operations require macOS Keychain access outside the Codex sandbox.",
)
prefix_rule(pattern = ["gh", "auth", "logout"], decision = "forbidden", justification = "Durable GitHub authentication may not be removed by an agent session.")
prefix_rule(pattern = ["gh", "repo", "delete"], decision = "forbidden", justification = "Repository deletion requires direct human action.")
prefix_rule(pattern = ["git", "push"], decision = "prompt", justification = "Codex Auto-review must evaluate every remote Git push.")
${END_MARKER}`;

export function upsertTopLevelToml(content, key, value) {
  const assignment = `${key} = ${JSON.stringify(value)}`;
  const tableIndex = content.search(/^\[/m);
  const topLevel = tableIndex === -1 ? content : content.slice(0, tableIndex);
  const rest = tableIndex === -1 ? '' : content.slice(tableIndex);
  const pattern = new RegExp(`^${key}\\s*=.*$`, 'm');
  if (pattern.test(topLevel)) return `${topLevel.replace(pattern, assignment)}${rest}`;
  if (tableIndex === -1) return `${content.trimEnd()}\n${assignment}\n`;
  return `${topLevel.trimEnd()}\n${assignment}\n\n${rest}`;
}

export function replaceManagedRules(content) {
  const pattern = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}\\n?`, 'g');
  const withoutManagedBlock = content
    .replace(LEGACY_ISSUE_STACK_BLOCK, '')
    .replace(pattern, '')
    .trimEnd();
  return `${withoutManagedBlock}${withoutManagedBlock ? '\n\n' : ''}${POLICY_RULES}\n`;
}

function backupOnce(path) {
  const backup = `${path}.before-run-claude`;
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
  installRunClaude();
  console.log('installed Codex rival-agent policy; restart Codex before using the wrappers');
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
