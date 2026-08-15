import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..');
const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'));
const allow = settings.permissions.allow;

function ruleToRegex(rule) {
  const pattern = rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('\\*', '.*');
  return new RegExp(`^${pattern}$`);
}

function isBashAllowed(command) {
  return allow
    .filter((rule) => rule.startsWith('Bash(') && rule.endsWith(')'))
    .some((rule) => ruleToRegex(rule.slice(5, -1)).test(command));
}

// A rule is shadowed by another when every string its glob can produce is
// already matched by the other rule's glob. Exact glob containment is
// overkill here: substituting each `*` with a probe set (empty, plain word,
// multi-word, flag-shaped, path-shaped) and testing the expansions against
// the other rule's regex catches the real-world shadows (`x *` vs `x **`,
// duplicate rules) without one.
const PROBES = ['', 'x', 'x y z', '--force', 'a/b/c'];

function shadowedRules(rules) {
  const shadows = [];
  for (const [i, rule] of rules.entries()) {
    for (const [j, other] of rules.entries()) {
      if (i === j) continue;
      if (rule === other) {
        if (i < j) shadows.push(`"${rule}" is listed twice`);
        continue;
      }
      const regex = ruleToRegex(other);
      if (PROBES.every((probe) => regex.test(rule.replaceAll('*', probe)))) {
        shadows.push(`"${rule}" is fully covered by "${other}"`);
      }
    }
  }
  return shadows;
}

describe('Claude Code Bash permissions', () => {
  // Reproducing the committed tree is allowed; adding a package or skipping the
  // install-script gating is a decision that belongs to a human.
  it('allows only the two bare pnpm install shapes', () => {
    expect(isBashAllowed('pnpm install')).toBe(true);
    expect(isBashAllowed('pnpm install --frozen-lockfile')).toBe(true);
    expect(isBashAllowed('pnpm install some-package')).toBe(false);
    expect(isBashAllowed('pnpm add some-package')).toBe(false);
    expect(isBashAllowed('pnpm install --ignore-scripts')).toBe(false);
  });

  // npm still runs the script graph (`npm run …` works against a pnpm tree), but
  // `npm install` would author a competing package-lock.json.
  it('never allows npm to install', () => {
    expect(isBashAllowed('npm install')).toBe(false);
    expect(isBashAllowed('npm ci')).toBe(false);
    expect(isBashAllowed('npm run build')).toBe(true);
  });

  it('never allows destructive command shapes', () => {
    expect(isBashAllowed('git rm foo')).toBe(false);
    expect(isBashAllowed('sed -i s/a/b/ file')).toBe(false);
    expect(isBashAllowed('find . -delete')).toBe(false);
    expect(isBashAllowed('curl http://x -o /etc/passwd')).toBe(false);
  });

  it('has no allow rule fully shadowed by another', () => {
    expect(shadowedRules(allow)).toEqual([]);
  });
});
