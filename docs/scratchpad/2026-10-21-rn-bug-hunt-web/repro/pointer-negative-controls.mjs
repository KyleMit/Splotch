import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const repo = resolve('.');
const out = resolve('docs/scratchpad/2026-10-21-rn-bug-hunt-web');
const sourcePath = resolve('experiments/native-architecture/src/drawing/PaperInputView.web.tsx');
const original = readFileSync(sourcePath, 'utf8');
const fixtures = mkdtempSync(join(out, 'repro', 'pointer-mutation-'));
const mutations = [
  {
    name: 'coalesced-tail',
    title: 'retains the latest move when the browser coalesced batch ends before it',
    before: 'samples.push(inputSample(event));',
    after: '{}',
  },
  {
    name: 'blur',
    title: 'cancels every held pointer',
    before: "window.addEventListener('blur', cancelAll);",
    after: '',
  },
  {
    name: 'cancel-one',
    title: 'keeps the other pointer active',
    before: "send('cancel', [identifier]);\n      contacts.delete(identifier);",
    after: "send('cancel', [identifier]);\n      contacts.clear();",
  },
];

try {
  for (const mutation of mutations) {
    assert(original.includes(mutation.before), `Mutation anchor missing: ${mutation.name}`);
    let source = original.replace(mutation.before, mutation.after);
    for (const spec of [
      './paperInput',
      '../platform/earlyPointers',
      '../platform/firstFrameContract',
    ]) {
      const full = resolve('experiments/native-architecture/src/drawing', spec) + '.ts';
      source = source.replaceAll(`'${spec}'`, JSON.stringify(full));
    }
    const fixture = join(fixtures, `${mutation.name}.tsx`);
    const config = join(fixtures, `${mutation.name}.config.mjs`);
    writeFileSync(fixture, source);
    writeFileSync(
      config,
      `import config from ${JSON.stringify(join(repo, 'tools/vitest.config.mjs'))};\nconfig.test.projects[0].resolve.alias.unshift({find:/^.*\\/PaperInputView\\.web\\.tsx$/,replacement:${JSON.stringify(fixture)}});\nexport default config;\n`
    );
    const result = spawnSync(
      process.execPath,
      [
        join(repo, 'node_modules/vitest/vitest.mjs'),
        'run',
        '--config',
        config,
        'tests/native-paper-input-web.test.mjs',
        '-t',
        mutation.title,
      ],
      { cwd: repo, encoding: 'utf8' }
    );
    const output = result.stdout + result.stderr;
    writeFileSync(join(out, 'evidence', `pointer-negative-${mutation.name}.log.txt`), output);
    assert.equal(result.status, 1, `${mutation.name} mutant must fail`);
    assert(
      output.includes('AssertionError'),
      `${mutation.name} must fail its assertion, not setup`
    );
    assert(output.includes(mutation.title), `${mutation.name} must reach the named regression`);
    console.log(`${mutation.name}: intended assertion failed against copied-source mutant`);
  }
  assert.equal(readFileSync(sourcePath, 'utf8'), original);
} finally {
  rmSync(fixtures, { recursive: true, force: true });
}
