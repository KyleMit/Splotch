// Locks the boundary every numeric burndown knob crosses. Each was read with a
// bare Number(), so a typo or a natural reading of a knob's name became NaN or 0
// and quietly changed an unattended run: RETRIES=0 ran no attempt at all and
// deferred findings as "verifier unavailable", MAX_HANDLED=5O and a non-numeric
// MAX_DEFERRALS lifted their limits, and PUSH_EVERY=abc pushed nothing until exit.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commentStorePath, readConfig } from '../lib/burndown-config.mjs';

const DEFAULT_COMMENT_STORE = join('.audit-work', 'pending-comments.jsonl');

describe('readConfig', () => {
  it('keeps the documented defaults when no knob is set', () => {
    expect(readConfig({})).toMatchObject({
      MAX_ISSUES: 5,
      MAX_HANDLED: 0,
      PUSH_EVERY: 1,
      MAX_DEFERRALS: 3,
      RETRIES: 3,
      BRANCH: 'audit/burndown',
      CHECK_CMD: 'npm run check',
      COMMENT_STORE: DEFAULT_COMMENT_STORE,
      RESUME: false,
    });
  });

  it('reads set counts as integers and keeps MAX_HANDLED=0 as unbounded', () => {
    const env = {
      MAX_ISSUES: '600',
      MAX_HANDLED: '0',
      PUSH_EVERY: '2',
      MAX_DEFERRALS: '1',
      RETRIES: '1',
    };

    expect(readConfig(env)).toMatchObject({
      MAX_ISSUES: 600,
      MAX_HANDLED: 0,
      PUSH_EVERY: 2,
      MAX_DEFERRALS: 1,
      RETRIES: 1,
    });
  });

  it.each([
    ['RETRIES', '0', 'RETRIES must be an integer >= 1; received "0"'],
    ['PUSH_EVERY', 'abc', 'PUSH_EVERY must be an integer >= 1; received "abc"'],
    ['MAX_DEFERRALS', '', 'MAX_DEFERRALS must be an integer >= 1; received ""'],
    ['MAX_HANDLED', '5O', 'MAX_HANDLED must be an integer >= 0; received "5O"'],
    ['MAX_ISSUES', '1e3', 'MAX_ISSUES must be an integer >= 1; received "1e3"'],
  ])('refuses %s=%j, naming the variable and the value', (name, raw, message) => {
    expect(() => readConfig({ [name]: raw })).toThrow(new Error(message));
  });
});

describe('commentStorePath', () => {
  it('defaults beside the run state and honors COMMENT_STORE', () => {
    expect(commentStorePath({})).toBe(DEFAULT_COMMENT_STORE);
    expect(commentStorePath({ COMMENT_STORE: 'docs/comments.jsonl' })).toBe('docs/comments.jsonl');
  });
});
