import { describe, expect, it } from 'vitest';

import { jobBlock, jobBlocks, runScriptIn, stepBlock, stepBlocks } from './workflow-job-steps.mjs';

const buildJob = [
  '  build:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      # A comment inside the steps stays with its job.',
  '      - run: npm run build',
];
const testJob = ['  test:', '    needs: build', '    steps:', '      - run: npm test'];
const workflow = [
  'name: Fixture',
  'on:',
  '  push:',
  '    branches: [main]',
  'jobs:',
  ...buildJob,
  '',
  '  # Introduces the test job and names npm test, which build never runs.',
  ...testJob,
  '',
].join('\n');

describe('jobBlock', () => {
  it('slices the named job only, not the comment or lines of the job after it', () => {
    expect(jobBlock(workflow, 'build')).toBe(`${buildJob.join('\n')}\n`);
  });

  it('slices a job at the end of the file', () => {
    expect(jobBlock(workflow, 'test')).toBe(`${testJob.join('\n')}\n`);
    expect(jobBlock(workflow.trimEnd(), 'test')).toBe(testJob.join('\n'));
  });

  it('ends the last job at a top-level key after jobs:', () => {
    expect(jobBlock(`${workflow}env:\n  CI: true\n`, 'test')).toBe(`${testJob.join('\n')}\n`);
  });

  it('throws for a job the workflow does not declare', () => {
    expect(() => jobBlock(workflow, 'deploy')).toThrow('No deploy job under jobs:');
  });

  it('reads keys under jobs: only, not a trigger of the same name', () => {
    expect(() => jobBlock(workflow, 'push')).toThrow('No push job under jobs:');
  });
});

describe('jobBlocks', () => {
  it('lists every job in file order, each a verbatim slice of the workflow', () => {
    const blocks = jobBlocks(workflow);

    expect(blocks.map(({ id }) => id)).toEqual(['build', 'test']);
    for (const { text } of blocks) expect(workflow).toContain(text);
  });

  it('finds no jobs in a file without a jobs: key', () => {
    expect(jobBlocks('name: Fixture\non:\n  push:\n')).toEqual([]);
  });

  it.each([
    ['an anchor', '  lint: &lint\n    runs-on: ubuntu-latest\n'],
    ['a flow-style body', '  lint: { runs-on: ubuntu-latest }\n'],
    ['a trailing comment on a CRLF line', '  lint: # checks\r\n    runs-on: ubuntu-latest\r\n'],
  ])('enumerates a job whose key carries %s', (_label, lint) => {
    const blocks = jobBlocks(`${workflow}${lint}`);

    expect(blocks.map(({ id }) => id)).toEqual(['build', 'test', 'lint']);
    expect(blocks.at(-1).text).toBe(lint);
  });

  it('throws on a key at job indent it cannot read, rather than dropping that job', () => {
    expect(() => jobBlocks(`${workflow}  "lint":\n    runs-on: ubuntu-latest\n`)).toThrow(
      'Unreadable job key under jobs: "lint":'
    );
  });
});

const checkoutStep = ['      - uses: actions/checkout@sha'];
const compareStep = [
  '      - name: Compare',
  '        id: compare',
  '        # A comment indented inside a step stays with it.',
  '        run: |',
  '          first',
  '',
  '            second',
  '        env:',
  '          RESULT: ${{ steps.gate.outcome }}',
];
const reportStep = ['      - name: Report', '        run: echo report'];
const retryJob = [
  '  retry:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  ...checkoutStep,
  ...compareStep,
  '',
  '      # Introduces Report and names echo report, which Compare never runs.',
  ...reportStep,
  '',
].join('\n');
const block = (lines) => `${lines.join('\n')}\n`;

describe('stepBlocks', () => {
  it('ends each step at the next one, named or not, as a verbatim slice of the job', () => {
    expect(stepBlocks(retryJob)).toEqual([
      { name: undefined, text: block(checkoutStep) },
      { name: 'Compare', text: block(compareStep) },
      { name: 'Report', text: block(reportStep) },
    ]);
  });

  it('ends a step before a comment at step indent, which belongs to neither step', () => {
    const [, compare, report] = stepBlocks(retryJob);

    expect(retryJob).toContain('Introduces Report');
    expect(compare.text).not.toContain('Introduces Report');
    expect(report.text).not.toContain('Introduces Report');
  });

  it('ends the last step at the end of the job', () => {
    expect(stepBlocks(retryJob).at(-1).text).toBe(block(reportStep));
    expect(stepBlocks(retryJob.trimEnd()).at(-1).text).toBe(reportStep.join('\n'));
  });

  it('ends the last step at a job key after the list', () => {
    const withOutputs = `${retryJob}    outputs:\n      compared: \${{ steps.compare.outcome }}\n`;

    expect(stepBlocks(withOutputs).at(-1).text).toBe(block(reportStep));
  });

  it('finds no steps in a job without a steps: key', () => {
    expect(stepBlocks('  call:\n    uses: ./.github/workflows/deploy.yml\n')).toEqual([]);
  });

  it.each([
    ['a flow-style list', '    steps: []\n', 'Unreadable steps key: steps: []'],
    ['items at the key indent', '    steps:\n    - run: x\n', 'No step at six-space indent'],
    ['a key at step indent', '    steps:\n      run: x\n', 'Unreadable step: run: x'],
  ])('throws on %s rather than hiding the steps', (_label, steps, message) => {
    expect(() => stepBlocks(`  lint:\n${steps}`)).toThrow(message);
  });
});

describe('stepBlock', () => {
  it('slices the one step of that name', () => {
    expect(stepBlock(retryJob, 'Compare')).toBe(block(compareStep));
  });

  it('reads the job it is handed, not a same-named step in another job', () => {
    const rerunJob = ['  rerun:', '    steps:', '      - name: Report', '        run: echo rerun'];
    const workflowWithRetry = `${workflow}${retryJob}${block(rerunJob)}`;

    expect(stepBlock(jobBlock(workflowWithRetry, 'retry'), 'Report')).toBe(block(reportStep));
    expect(stepBlock(jobBlock(workflowWithRetry, 'rerun'), 'Report')).toContain('echo rerun');
  });

  it('throws for a step the job does not declare, or declares twice', () => {
    expect(() => stepBlock(retryJob, 'Deploy')).toThrow('Expected one step named Deploy, found 0');
    expect(() => stepBlock(`${retryJob}${block(reportStep)}`, 'Report')).toThrow(
      'Expected one step named Report, found 2'
    );
  });
});

describe('runScriptIn', () => {
  it("dedents a step's run: | block through its blank lines, up to the step's next key", () => {
    expect(runScriptIn(stepBlock(retryJob, 'Compare'))).toBe('first\n\n  second\n');
  });

  it('ends a script at the end of its step in one newline', () => {
    const lastStep = block(compareStep.slice(0, 7));

    expect(runScriptIn(`${lastStep}\n\n`)).toBe('first\n\n  second\n');
    expect(runScriptIn(lastStep.trimEnd())).toBe('first\n\n  second\n');
  });

  it('throws for a step whose run: is not a block', () => {
    expect(() => runScriptIn(stepBlock(retryJob, 'Report'))).toThrow(
      'No run: | script in step: - name: Report'
    );
  });
});
