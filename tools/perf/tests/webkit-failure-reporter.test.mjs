import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

import {
  jobBlock,
  runScriptIn,
  stepBlock,
  stepBlocks,
} from '../../ci-mirror/tests/workflow-job-steps.mjs';

const workflow = readFileSync(
  new URL('../../../.github/workflows/test.yml', import.meta.url),
  'utf8'
);
const retryId = 'webkit-commit-gate-fast-retry';
const reportId = 'webkit-commit-gate-fast-report';
const retry = jobBlock(workflow, retryId);
const reporter = jobBlock(workflow, reportId);
const outcomes = ['failure', 'success', 'skipped', ''];

function condition(text, indent) {
  const match = text.match(new RegExp(`^ {${indent}}if: >-\\n((?: {${indent + 2}}.*\\n)+)`, 'm'));
  if (!match) throw new Error('Missing workflow condition');
  return match[1].trim().replace(/\s+/g, ' ');
}

function eligible(expression, { gate, compare, reproduced, event, ref, canceled }) {
  const javascript = expression.replace(
    /needs\.webkit-commit-gate-fast-retry\.outputs\.([\w-]+)/g,
    (_, key) => `outputs['${key}']`
  );
  // GitHub implicitly adds success() unless the expression names a status
  // function. A reproduced breach leaves the upstream retry failed.
  if (!/\b(?:always|cancelled|failure|success)\(\)/.test(javascript)) return false;
  return runInNewContext(javascript, {
    outputs: { 'gate-outcome': gate, 'compare-outcome': compare, reproduced },
    github: { event_name: event, ref },
    cancelled: () => canceled,
    always: () => true,
  });
}

const expression = condition(reporter, 4);
const reFailExpression = condition(stepBlock(retry, 'Fail on a reproduced breach'), 8)
  .replaceAll('steps.gate.outcome', `needs.${retryId}.outputs.gate-outcome`)
  .replaceAll('steps.compare.outcome', `needs.${retryId}.outputs.compare-outcome`)
  .replaceAll('steps.compare.outputs.reproduced', `needs.${retryId}.outputs.reproduced`);

const contexts = [
  { event: 'push', ref: 'refs/heads/main' },
  { event: 'push', ref: 'refs/heads/investigation' },
  { event: 'workflow_dispatch', ref: 'refs/heads/main' },
];
const cases = outcomes.flatMap((gate) =>
  outcomes.flatMap((compare) =>
    ['', 'multi-finger:breach'].flatMap((reproduced) =>
      contexts.flatMap((context) =>
        [false, true].map((canceled) => ({ gate, compare, reproduced, canceled, ...context }))
      )
    )
  )
);

describe('WebKit failure reporter boundary', () => {
  it.each(cases)('preserves filing eligibility for %j', (context) => {
    const expected =
      !context.canceled &&
      context.event === 'push' &&
      context.ref === 'refs/heads/main' &&
      context.gate === 'failure' &&
      (context.compare === 'failure' || context.reproduced !== '');
    expect(eligible(expression, context)).toBe(expected);
  });

  it('uses the same reproduction predicate for reporting and re-failing', () => {
    expect(expression).toContain(reFailExpression);
  });

  it('publishes outcomes rather than continue-on-error conclusions', () => {
    expect(retry).toContain('gate-outcome: ${{ steps.gate.outcome }}');
    expect(retry).toContain('compare-outcome: ${{ steps.compare.outcome }}');
    expect(retry).toContain('reproduced: ${{ steps.compare.outputs.reproduced }}');
    expect(retry).not.toContain('.conclusion');
  });

  it('keeps untrusted fingerprints in environment variables rather than shell source', () => {
    expect(reporter).toContain('GH_REPO: ${{ github.repository }}');
    expect(reporter).toContain(`REPRODUCED: \${{ needs.${retryId}.outputs.reproduced }}`);
    expect(reporter).toContain(`COMPARE_OUTCOME: \${{ needs.${retryId}.outputs.compare-outcome }}`);
    const scripts = stepBlocks(reporter).map(({ text }) => runScriptIn(text));
    expect(scripts).not.toEqual([]);
    for (const script of scripts) expect(script).not.toContain('${{');
    expect(reporter).not.toContain('uses:');
    expect(reporter).toContain('runs-on: ubuntu-latest');
  });

  it('detects loss of the failed-dependency status override', () => {
    const context = {
      gate: 'failure',
      compare: 'success',
      reproduced: 'multi-finger:breach',
      event: 'push',
      ref: 'refs/heads/main',
      canceled: false,
    };
    expect(eligible(expression, context)).toBe(true);
    expect(eligible(expression.replace('!cancelled() && ', ''), context)).toBe(false);
    expect(
      eligible(
        expression.replace("gate-outcome == 'failure'", "gate-outcome == 'success'"),
        context
      )
    ).toBe(false);
  });
});
