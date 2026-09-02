#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkCodexPolicy as checkRunClaudePolicy,
  evaluateDecision,
} from '../../run-rival-agent/scripts/check-codex-policy.mjs';
import { CODEX_POLICY_PATHS } from '../../run-rival-agent/scripts/install-codex-policy.mjs';
import { ISSUE_STACK_POLICY_RULES } from './install-codex-policy.mjs';

const POLICY_CASES = [
  { command: ['gh', 'pr', 'view', '1'], expected: 'prompt' },
  { command: ['gh', 'pr', 'merge', '1'], expected: 'forbidden' },
  { command: ['gh', 'stack', 'merge'], expected: 'forbidden' },
  { command: ['git', 'push', 'origin', 'codex/policy-check'], expected: 'prompt' },
];

export function validateIssueStackRules(content) {
  if (!content.includes(ISSUE_STACK_POLICY_RULES)) {
    throw new Error('managed issue-stack rules are missing or stale');
  }
}

export function checkIssueStackPolicy() {
  checkRunClaudePolicy();
  if (!existsSync(CODEX_POLICY_PATHS.rules)) {
    throw new Error(`missing Codex policy file: ${CODEX_POLICY_PATHS.rules}`);
  }
  validateIssueStackRules(readFileSync(CODEX_POLICY_PATHS.rules, 'utf8'));
  for (const { command, expected } of POLICY_CASES) {
    const actual = evaluateDecision(command);
    if (actual !== expected) {
      throw new Error(`${command.join(' ')} resolves to ${actual}, expected ${expected}`);
    }
  }
  console.log('Codex issue-stack policy is ready');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('check-codex-policy.mjs accepts no arguments');
    checkIssueStackPolicy();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
