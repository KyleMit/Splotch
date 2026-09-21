// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  BROWSERLESS_TEST_COMMANDS,
  runBrowserlessTests,
  summarize,
} from '../run-browserless-tests.mjs';
import { jobBlock, runCommandsIn, testWorkflow } from './workflow-job-steps.mjs';

// `npm run test:browserless` exists because no other local command reproduced
// this job: `test:unit` runs a fraction of it, and `npm test` omits the API
// smoke while adding the Playwright suite. It only stays a faithful mirror while
// it runs the same commands, and the YAML cannot import the list — so the two
// sides are compared here.
describe('the browserless test script mirrors the Browserless tests job', () => {
  it('runs exactly the workflow steps, in the workflow order', () => {
    expect(BROWSERLESS_TEST_COMMANDS).toEqual(runCommandsIn(jobBlock(testWorkflow, 'browserless')));
  });

  it('picks the browserless job, not whatever job happens to be first', () => {
    const block = jobBlock(testWorkflow, 'browserless');
    expect(block).toContain('name: Browserless tests');
    expect(block).not.toContain('npm run test:e2e');
  });
});

describe('runBrowserlessTests', () => {
  it('runs every command even after one fails, and reports each failure', () => {
    const attempted = [];
    const failures = runBrowserlessTests({
      run: (command) => {
        attempted.push(command);
        return command !== 'npm run test:tools';
      },
    });

    expect(attempted).toEqual(BROWSERLESS_TEST_COMMANDS);
    expect(failures).toEqual(['npm run test:tools']);
  });

  it('exits non-zero and names the failures, or zero when all pass', () => {
    const errors = [];
    const log = { log: () => {}, error: (line) => errors.push(line) };

    expect(summarize([], log)).toBe(0);
    expect(errors).toEqual([]);

    expect(summarize(['npm run test:tools'], log)).toBe(1);
    expect(errors.join('\n')).toContain('npm run test:tools');
  });
});
