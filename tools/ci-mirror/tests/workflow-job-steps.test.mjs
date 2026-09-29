import { describe, expect, it } from 'vitest';

import { jobBlock, jobBlocks } from './workflow-job-steps.mjs';

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
});
