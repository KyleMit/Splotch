// @vitest-environment node
import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// eslint.config.js turns a test that cannot fail into a lint failure. That guard has the same
// failure mode as the tests it polices: a rule scoped to a glob nothing matches, or defanged by
// an option, reports nothing — and a lint run that reports nothing looks identical whether the
// repo is clean or the rule is dead. So every rule gets a seeded defect here, and each of the
// three deliberate relaxations gets a case pinning what it lets through, so tightening one is a
// decision rather than an accident.
const repoRoot = join(import.meta.dirname, '..', '..');
// The type-aware no-floating-promises block runs a TS project service over web/src/**/*.ts,
// which fatals on a virtual path instead of running any rules. It is orthogonal to what this
// control pins, so the override switches that one layer off for the web/src probe path.
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfig: [
    {
      files: ['web/src/**/*.ts'],
      languageOptions: { parserOptions: { projectService: false } },
      rules: { '@typescript-eslint/no-floating-promises': 'off' },
    },
  ],
});

// None of these paths exists on disk — ESLint reads a file path only to pick the config blocks that
// match it, and these are the globs the Vitest and Playwright blocks are scoped to. web/src's
// colocated unit tests get a fixture of their own because later blocks re-scope rules for that
// slice, and a re-scoped block can drop what the Vitest block turned on.
const VITEST_FIXTURE = 'tools/tests/seeded-defect.test.mjs';
const WEB_SRC_VITEST_FIXTURE = 'web/src/lib/seeded-defect.test.ts';
const PLAYWRIGHT_FIXTURE = 'web/tests/seeded-defect.spec.ts';

const rulesReportedFor = async (fixture, source) => {
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, fixture) });
  return result.messages.map((message) => message.ruleId);
};

const vitestSpec = (body) => `import { describe, expect, it, vi } from 'vitest';\n${body}`;
const playwrightSpec = (body) => `import { expect, test } from '@playwright/test';\n${body}`;

const vitestRules = (body) => rulesReportedFor(VITEST_FIXTURE, vitestSpec(body));
const playwrightRules = (body) => rulesReportedFor(PLAYWRIGHT_FIXTURE, playwrightSpec(body));

describe.each([VITEST_FIXTURE, WEB_SRC_VITEST_FIXTURE])(
  'the Vitest block reports a test that cannot fail in %s',
  (fixture) => {
    const fixtureRules = (body) => rulesReportedFor(fixture, vitestSpec(body));

    it('flags a test body with no assertion', async () => {
      expect(await fixtureRules(`it('asserts nothing', () => { JSON.parse('{}'); });`)).toContain(
        'vitest/expect-expect'
      );
    });

    it('flags a committed .only, which silently skips the rest of the file', async () => {
      expect(await fixtureRules(`it.only('is focused', () => { expect(1).toBe(1); });`)).toContain(
        'vitest/no-focused-tests'
      );
    });

    it('flags a skipped test', async () => {
      expect(await fixtureRules(`it.skip('is disabled', () => { expect(1).toBe(1); });`)).toContain(
        'vitest/no-disabled-tests'
      );
    });

    it('flags an expect that never reaches a matcher', async () => {
      expect(await fixtureRules(`it('never matches', () => { expect(1); });`)).toContain(
        'vitest/valid-expect'
      );
    });

    it('flags an expect.poll whose promise is dropped', async () => {
      const body = `it('drops the poll', async () => { expect.poll(() => 1).toBe(1); });`;
      expect(await fixtureRules(body)).toContain('vitest/require-awaited-expect-poll');
    });

    it('flags an async assertion that is never awaited', async () => {
      const body = `it('drops the rejection', async () => { expect(vi.fn()()).rejects.toThrow(); });`;
      expect(await fixtureRules(body)).toContain('vitest/valid-expect');
    });

    it('flags an assertion left inside a floating promise chain', async () => {
      const body = `it('drops the chain', async () => { Promise.resolve(1).then((value) => expect(value).toBe(1)); });`;
      expect(await fixtureRules(body)).toContain('vitest/valid-expect-in-promise');
    });

    it('flags an assertion reachable only if something threw', async () => {
      const body = [
        `it('rejects bad input', () => {`,
        `  try { JSON.parse('{}'); } catch (error) { expect(error.message).toBe('bad'); }`,
        `});`,
      ].join('\n');
      expect(await fixtureRules(body)).toContain('vitest/no-conditional-expect');
    });
  }
);

describe('the Playwright block reports a test that cannot fail', () => {
  it('flags a test body with no assertion', async () => {
    const body = `test('asserts nothing', async ({ page }) => { await page.goto('/'); });`;
    expect(await playwrightRules(body)).toContain('playwright/expect-expect');
  });

  it('flags a committed .only, which silently skips the rest of the file', async () => {
    const body = `test.only('is focused', async () => { expect(1).toBe(1); });`;
    expect(await playwrightRules(body)).toContain('playwright/no-focused-test');
  });

  it('flags an unconditionally skipped test', async () => {
    const body = `test.skip('is disabled', async () => { expect(1).toBe(1); });`;
    expect(await playwrightRules(body)).toContain('playwright/no-skipped-test');
  });

  it('flags an expect that never reaches a matcher', async () => {
    expect(await playwrightRules(`test('never matches', async () => { expect(1); });`)).toContain(
      'playwright/valid-expect'
    );
  });

  it('flags a web-first assertion whose promise is dropped', async () => {
    const body = `test('drops the wait', async ({ page }) => { expect(page.locator('h1')).toBeVisible(); });`;
    expect(await playwrightRules(body)).toContain('playwright/missing-playwright-await');
  });

  it('flags an assertion left inside a floating promise chain', async () => {
    const body = `test('drops the chain', async () => { Promise.resolve(1).then((value) => expect(value).toBe(1)); });`;
    expect(await playwrightRules(body)).toContain('playwright/valid-expect-in-promise');
  });

  it('flags an assertion reachable only if something threw', async () => {
    const body = [
      `test('rejects bad input', async ({ page }) => {`,
      `  try { await page.goto('/'); } catch (error) { expect(error.message).toBe('bad'); }`,
      `});`,
    ].join('\n');
    expect(await playwrightRules(body)).toContain('playwright/no-conditional-expect');
  });
});

// Each relaxation below exists because the rule's default reads a supported idiom as a defect.
// Removing one turns a whole idiom red, so these cases state what it currently permits.
describe('the deliberate relaxations permit what they were configured for', () => {
  // A literal message is waved through by the rule itself, so only a computed one — the form a
  // parametrized assertion needs to name the case that failed — exercises the raised cap.
  it("keeps Vitest's computed assertion message off valid-expect's argument cap", async () => {
    const body = [
      `const cases = [{ value: 1, label: 'the count' }];`,
      `it.each(cases)('names the case that failed', ({ value, label }) => {`,
      `  expect(value, label).toBe(1);`,
      `});`,
    ].join('\n');
    expect(await vitestRules(body)).not.toContain('vitest/valid-expect');
  });

  it('reads a delegating Vitest test as asserting through its expect* helper', async () => {
    const body = [
      `const expectParsed = (raw) => expect(JSON.parse(raw)).toEqual({});`,
      `it('delegates its assertion', () => { expectParsed('{}'); });`,
    ].join('\n');
    expect(await vitestRules(body)).not.toContain('vitest/expect-expect');
  });

  it('reads a delegating Playwright test as asserting through its expect* helper', async () => {
    const body = [
      `const expectHeading = async (page) => { await expect(page.locator('h1')).toBeVisible(); };`,
      `test('delegates its assertion', async ({ page }) => { await expectHeading(page); });`,
    ].join('\n');
    expect(await playwrightRules(body)).not.toContain('playwright/expect-expect');
  });

  it('allows the conditional skip that gates a spec on the environment', async () => {
    const body = [
      `test.skip(!!process.env.DEV_SERVER, 'the dev server does not prerender');`,
      `test('runs elsewhere', async () => { expect(1).toBe(1); });`,
    ].join('\n');
    expect(await playwrightRules(body)).not.toContain('playwright/no-skipped-test');
  });
});
