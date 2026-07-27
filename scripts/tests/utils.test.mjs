import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { capture } from '../lib/utils.mjs';

const argumentsToPreserve = [
  '$HOME',
  '`printf substituted`',
  'say "hello"',
  'two words',
  '$(printf substituted); printf not-run | cat',
];
const argumentPrinter = 'process.stdout.write(JSON.stringify(process.argv.slice(1)))';
const utilsUrl = new URL('../lib/utils.mjs', import.meta.url).href;

describe('command helpers', () => {
  it('passes capture arguments to the child unchanged', () => {
    const output = capture(process.execPath, ['-e', argumentPrinter, ...argumentsToPreserve]);

    expect(JSON.parse(output)).toEqual(argumentsToPreserve);
  });

  it('passes run arguments to the child unchanged', () => {
    const script = `
      import { run } from ${JSON.stringify(utilsUrl)};
      run(process.execPath, [
        '-e',
        ${JSON.stringify(argumentPrinter)},
        ...${JSON.stringify(argumentsToPreserve)}
      ], { echo: false });
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(argumentsToPreserve);
  });

  it('keeps deliberate shell syntax available through sh', () => {
    const script = `
      import { sh } from ${JSON.stringify(utilsUrl)};
      await sh('printf "left" && printf " right"');
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('left right');
  });
});
