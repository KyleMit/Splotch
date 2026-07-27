import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..');
const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'));
const allow = settings.permissions.allow;

function isBashAllowed(command) {
  return allow
    .filter((rule) => rule.startsWith('Bash(') && rule.endsWith(')'))
    .some((rule) => {
      const pattern = rule
        .slice(5, -1)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replaceAll('\\*', '.*');

      return new RegExp(`^${pattern}$`).test(command);
    });
}

describe('Claude Code Bash permissions', () => {
  it('allows only bare npm install and npm ci commands', () => {
    expect(isBashAllowed('npm install')).toBe(true);
    expect(isBashAllowed('npm ci')).toBe(true);
    expect(isBashAllowed('npm install some-package')).toBe(false);
    expect(isBashAllowed('npm install --ignore-scripts')).toBe(false);
  });
});
