#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODEX_POLICY_PATHS, POLICY_RULES } from './install-codex-policy.mjs';
import { installRunClaude } from './install-run-claude.mjs';

const EXPECTED_CONFIG = {
  approval_policy: 'on-request',
  approvals_reviewer: 'auto_review',
  sandbox_mode: 'workspace-write',
};
// Consumed only by the CI drift guard in tools/tests/run-claude.test.mjs. It is deliberately not
// part of checkCodexPolicy(), whose reinstall recovery cannot repair skill prose.
export const REQUIRED_SKILL_EXECUTION_CONTRACT = new Map([
  [
    'seamless invocation instruction',
    'After one-time setup, complete ordinary `ask` and `inspect` invocations without manual user steps.',
  ],
  ['host escalation instruction', '`sandbox_permissions: "require_escalated"`'],
  ['sandbox-first prohibition', 'Never run an installed wrapper in the sandbox first.'],
]);

// Exported so the installer-path drift guard covers the commands evaluated by Codex.
export const POLICY_CASES = [
  {
    command: [
      '/Users/kylemit/.local/libexec/splotch-claude-run.mjs',
      '--prompt-file',
      '/private/tmp/ping.txt',
    ],
    expected: 'prompt',
  },
  {
    command: ['/Users/kylemit/.local/libexec/splotch-claude-review-publish.mjs', '--pr', '1'],
    expected: 'prompt',
  },
  {
    command: ['/Users/kylemit/.local/libexec/splotch-claude-health.mjs'],
    expected: 'prompt',
  },
  { command: ['claude', '--print', 'review'], expected: 'forbidden' },
];

export function validateCodexConfig(content) {
  const firstTable = content.search(/^\[/m);
  const topLevel = firstTable === -1 ? content : content.slice(0, firstTable);
  for (const [key, value] of Object.entries(EXPECTED_CONFIG)) {
    const matches = topLevel.match(new RegExp(`^${key}\\s*=\\s*"${value}"\\s*$`, 'gm')) ?? [];
    if (matches.length !== 1) throw new Error(`Codex config must set ${key} = "${value}" once`);
  }
}

export function validateManagedRules(content) {
  if (!content.includes(POLICY_RULES)) {
    throw new Error('managed run-claude rules are missing or stale');
  }
}

// Test-only validator for the CI drift guard described above.
export function validateSkillExecutionContract(content) {
  for (const [name, requirement] of REQUIRED_SKILL_EXECUTION_CONTRACT) {
    if (!content.includes(requirement)) {
      throw new Error(`run-claude skill is missing its ${name}`);
    }
  }
}

export function evaluateDecision(command) {
  const result = spawnSync(
    'codex',
    ['execpolicy', 'check', '--rules', CODEX_POLICY_PATHS.rules, ...command],
    { encoding: 'utf8' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`codex execpolicy failed for ${command.join(' ')}: ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout).decision;
}

export function checkCodexPolicy() {
  for (const path of Object.values(CODEX_POLICY_PATHS)) {
    if (!existsSync(path)) throw new Error(`missing Codex policy file: ${path}`);
  }
  validateCodexConfig(readFileSync(CODEX_POLICY_PATHS.config, 'utf8'));
  validateManagedRules(readFileSync(CODEX_POLICY_PATHS.rules, 'utf8'));
  for (const { command, expected } of POLICY_CASES) {
    const actual = evaluateDecision(command);
    if (actual !== expected) {
      throw new Error(`${command.join(' ')} resolves to ${actual}, expected ${expected}`);
    }
  }
  installRunClaude({ check: true });
  console.log('Codex run-claude policy and trusted wrappers are ready');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('check-codex-policy.mjs accepts no arguments');
    checkCodexPolicy();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
